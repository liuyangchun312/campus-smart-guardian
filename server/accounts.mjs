import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { isInspections } from "../src/lib/safety.ts";
import { createSchoolOrders } from "./school-orders.mjs";

const derive = promisify(scrypt);
const SESSION_MS = 12 * 60 * 60 * 1000;
const emptyWorkspace = () => ({ messages: [], orders: [], inspections: [] });
const digest = (value) => createHash("sha256").update(value).digest("hex");
const safeUser = ({ id, username, name, role, disabled, createdAt }) => ({ id, username, name, role, disabled: Boolean(disabled), createdAt });
export class AccountError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function credentials(body) {
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = body.password;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!/^[a-z0-9_]{3,32}$/.test(username)) throw new AccountError(400, "账号需为3–32位字母、数字或下划线。");
  if (typeof password !== "string" || password.length < 10 || password.length > 128) throw new AccountError(400, "密码长度需为10–128个字符。");
  if (!name || name.length > 40) throw new AccountError(400, "请填写1–40个字符的姓名或昵称。");
  return { username, password, name };
}
async function passwordRecord(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt, hash: hash.toString("hex") };
}
async function matches(password, user) {
  if (typeof password !== "string" || password.length > 128) return false;
  const result = await derive(password, user?.salt ?? "guardian-missing-account", 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(user?.passwordHash ?? "00".repeat(64), "hex");
  return expected.length === result.length && timingSafeEqual(result, expected) && Boolean(user);
}
function sessionToken(req) {
  return req.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith("guardian_session="))?.slice(17) ?? "";
}
const textField = (value, max) => typeof value === "string" && value.length <= max;
function validWorkspace(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (!Array.isArray(data.messages) || data.messages.length > 100 || !data.messages.every((m) => m && textField(m.id, 100) && ["user", "assistant"].includes(m.role) && textField(m.content, 40000) && (m.sources === undefined || Array.isArray(m.sources) && m.sources.length <= 10 && m.sources.every((s) => s && textField(s.id, 100) && textField(s.url, 2000))))) return false;
  if (!Array.isArray(data.orders) || data.orders.length > 1000 || !data.orders.every((o) => o && ["id", "category", "location", "description", "safety"].every((key) => textField(o[key], key === "description" || key === "safety" ? 10000 : 500)) && Number.isFinite(Date.parse(o.createdAt)) && ["draft", "submitted", "resolved"].includes(o.status) && ["普通", "紧急", "特急"].includes(o.priority) && Array.isArray(o.history) && o.history.length <= 2000 && o.history.every((h) => h && ["draft", "submitted", "resolved"].includes(h.status) && Number.isFinite(Date.parse(h.at))))) return false;
  try { return isInspections(data.inspections); } catch { return false; }
}

export async function createAccounts({ file, bootstrapToken, send, readJson, database, secureCookies = false, clientAddress = (req) => req.socket.remoteAddress }) {
  if (!database) await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const db = database ?? new DatabaseSync(file);
  if (!database) db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','admin')), passwordHash TEXT NOT NULL, salt TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expiresAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS workspaces (userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updatedAt TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS session_user ON sessions(userId);`);
  const setupFile = join(dirname(file), "admin-setup-code.txt");
  const needsAdmin = () => db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").get().n === 0;
  const transaction = (callback) => {
    if (db.transaction) return db.transaction(callback);
    db.exec("BEGIN IMMEDIATE");
    try { const result = callback(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  let setupCode = bootstrapToken;
  if (needsAdmin() && !setupCode && !database) {
    try { setupCode = (await readFile(setupFile, "utf8")).trim(); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      setupCode = randomBytes(24).toString("base64url");
      await writeFile(setupFile, setupCode, { mode: 0o600, flag: "wx" });
    }
  }
  const attempts = new Map();
  function throttle(key, max = 8) {
    const now = Date.now();
    for (const [k, value] of attempts) if (value.until < now) attempts.delete(k);
    if (attempts.size >= 1000 && !attempts.has(key)) throw new AccountError(429, "请求较多，请稍后重试。");
    const value = attempts.get(key) ?? { count: 0, until: now + 15 * 60 * 1000 };
    value.count++;
    attempts.set(key, value);
    if (value.count > max) throw new AccountError(429, "尝试次数过多，请15分钟后重试。");
  }
  function currentUser(req, required = true) {
    db.prepare("DELETE FROM sessions WHERE expiresAt <= ?").run(Date.now());
    const user = db.prepare("SELECT u.* FROM users u JOIN sessions s ON u.id=s.userId WHERE s.tokenHash=? AND u.disabled=0").get(digest(sessionToken(req)));
    if (!user && required) throw new AccountError(401, "登录已过期，请重新登录。");
    if (user && req.headers["x-guardian-user"] && req.headers["x-guardian-user"] !== user.id) throw new AccountError(401, "当前账号已在其他窗口切换，请重新登录。");
    return user;
  }
  function requireAdmin(req) {
    const user = currentUser(req);
    if (user.role !== "admin") throw new AccountError(403, "此操作仅限管理员。");
    return user;
  }
  function startSession(req, res, user) {
    db.prepare("DELETE FROM sessions WHERE tokenHash=?").run(digest(sessionToken(req)));
    const token = randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(digest(token), user.id, Date.now() + SESSION_MS);
    res.setHeader("Set-Cookie", `guardian_session=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secureCookies ? "; Secure" : ""}`);
  }
  function insertUser(c, secret, role) {
    const user = { id: randomUUID(), username: c.username, name: c.name, role, disabled: 0, createdAt: new Date().toISOString() };
    if (db.prepare("SELECT id FROM users WHERE username=?").get(c.username)) throw new AccountError(409, "此账号已被使用，请换一个账号名称。");
    db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, 0, ?)").run(user.id, user.username, user.name, role, secret.hash, secret.salt, user.createdAt);
    return user;
  }
  const routePaths = new Set(["/api/auth/session", "/api/auth/register", "/api/auth/login", "/api/auth/bootstrap", "/api/auth/logout", "/api/auth/password", "/api/workspace", "/api/admin/users"]);
  const schoolOrders = createSchoolOrders({ db, transaction, currentUser, requireAdmin, readJson, send, ErrorType: AccountError });
  async function handle(req, res, path) {
    if (!routePaths.has(path) && !path.startsWith("/api/admin/users/") && !schoolOrders.matches(path)) return false;
    const respond = (status, body) => { send(res, status, body); return true; };
    if (req.method === "GET" && path === "/api/auth/session") {
      const user = currentUser(req, false);
      return respond(200, { user: user ? safeUser(user) : null, setupRequired: needsAdmin() });
    }
    if (req.method !== "GET" && req.headers["x-guardian-request"] !== "1") throw new AccountError(403, "请从应用页面提交请求。");
    if (schoolOrders.matches(path)) return schoolOrders.handle(req, res, path);
    if (req.method === "POST" && ["/api/auth/register", "/api/auth/bootstrap"].includes(path)) {
      const body = await readJson(req);
      const bootstrap = path.endsWith("bootstrap");
      throttle(`${bootstrap ? "bootstrap" : "register"}:${clientAddress(req)}`, bootstrap ? 8 : 20);
      if (bootstrap && (!needsAdmin() || !setupCode || typeof body.setupCode !== "string" || !timingSafeEqual(Buffer.from(digest(body.setupCode.trim())), Buffer.from(digest(setupCode))))) throw new AccountError(403, "初始化码无效，或管理员已完成初始化。");
      if (!bootstrap && body.role !== undefined && body.role !== "user") throw new AccountError(403, "公开注册仅能创建普通用户。");
      const c = credentials(body);
      const secret = await passwordRecord(c.password);
      // Recheck after asynchronous hashing so concurrent setup cannot create two first admins.
      const user = transaction(() => {
        if (bootstrap && !needsAdmin()) throw new AccountError(409, "管理员已完成初始化，请直接登录。");
        return insertUser(c, secret, bootstrap ? "admin" : "user");
      });
      if (bootstrap) { setupCode = null; if (!database) await unlink(setupFile).catch(() => {}); }
      startSession(req, res, user);
      return respond(201, { user: safeUser(user) });
    }
    if (req.method === "POST" && path === "/api/auth/login") {
      const body = await readJson(req);
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      if (!/^[a-z0-9_]{3,32}$/.test(username)) throw new AccountError(401, "账号、密码或登录身份不正确，或账号已被停用。");
      const key = `login:${clientAddress(req)}:${username}`;
      throttle(key);
      throttle(`login-total:${clientAddress(req)}`, 80);
      const user = db.prepare("SELECT * FROM users WHERE username=?").get(username);
      if (!(await matches(body.password, user)) || user.disabled || body.portal === "admin" && user.role !== "admin") throw new AccountError(401, "账号、密码或登录身份不正确，或账号已被停用。");
      // Account could have been disabled while password verification was in progress.
      if (db.prepare("SELECT disabled FROM users WHERE id=?").get(user.id).disabled) throw new AccountError(401, "此账号已被停用。");
      attempts.delete(key);
      startSession(req, res, user);
      return respond(200, { user: safeUser(user) });
    }
    const user = currentUser(req);
    if (req.method === "POST" && path === "/api/auth/logout") {
      db.prepare("DELETE FROM sessions WHERE tokenHash=?").run(digest(sessionToken(req)));
      res.setHeader("Set-Cookie", `guardian_session=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secureCookies ? "; Secure" : ""}`);
      return respond(200, { ok: true });
    }
    if (req.method === "POST" && path === "/api/auth/password") {
      throttle(`password:${user.id}`);
      const body = await readJson(req);
      if (!(await matches(body.currentPassword, user))) throw new AccountError(400, "当前密码不正确。");
      credentials({ username: user.username, name: user.name, password: body.password });
      const secret = await passwordRecord(body.password);
      if (!currentUser(req)) throw new AccountError(401, "请重新登录。");
      db.prepare("UPDATE users SET passwordHash=?, salt=? WHERE id=?").run(secret.hash, secret.salt, user.id);
      db.prepare("DELETE FROM sessions WHERE userId=?").run(user.id);
      startSession(req, res, user);
      return respond(200, { ok: true });
    }
    if (path === "/api/workspace") {
      if (req.headers["x-guardian-user"] !== user.id) throw new AccountError(401, "账号上下文已改变，请刷新后重新登录。");
      const record = db.prepare("SELECT * FROM workspaces WHERE userId=?").get(user.id);
      if (req.method === "GET") return respond(200, { data: record ? JSON.parse(record.data) : emptyWorkspace(), revision: record?.revision ?? 0 });
      if (req.method === "PUT") {
        const body = await readJson(req, 6 * 1024 * 1024);
        if (!Number.isSafeInteger(body.revision) || body.revision < 0 || !validWorkspace(body.data)) throw new AccountError(400, "记录格式或长度不正确，未保存此次变更。");
        currentUser(req);
        const data = JSON.stringify({ messages: body.data.messages, orders: body.data.orders, inspections: body.data.inspections });
        const revision = transaction(() => {
          const latest = db.prepare("SELECT revision FROM workspaces WHERE userId=?").get(user.id)?.revision ?? 0;
          if (latest !== body.revision) throw new AccountError(409, "其他窗口已更新记录。请先导出本页未保存内容，再重新载入服务器记录。");
          db.prepare("INSERT INTO workspaces VALUES (?, ?, ?, ?) ON CONFLICT(userId) DO UPDATE SET data=excluded.data, revision=excluded.revision, updatedAt=excluded.updatedAt").run(user.id, data, latest + 1, new Date().toISOString());
          return latest + 1;
        });
        return respond(200, { revision });
      }
    }
    if (path.startsWith("/api/admin/users")) {
      requireAdmin(req);
      if (req.method === "GET" && path === "/api/admin/users") {
        const users = db.prepare("SELECT u.*, COALESCE(json_array_length(w.data, '$.orders'),0) AS orderCount, COALESCE(json_array_length(w.data, '$.inspections'),0) AS inspectionCount FROM users u LEFT JOIN workspaces w ON w.userId=u.id ORDER BY u.createdAt DESC").all();
        return respond(200, { users: users.map((entry) => ({ ...safeUser(entry), orderCount: entry.orderCount, inspectionCount: entry.inspectionCount })) });
      }
      if (req.method === "PATCH" && path.startsWith("/api/admin/users/")) {
        const target = db.prepare("SELECT * FROM users WHERE id=?").get(path.slice("/api/admin/users/".length));
        if (!target) throw new AccountError(404, "账号不存在。");
        const body = await readJson(req);
        requireAdmin(req);
        if (target.role === "admin") throw new AccountError(403, "管理员账号不可在此停用。");
        if (typeof body.disabled !== "boolean") throw new AccountError(400, "请指定账号启用状态。");
        db.prepare("UPDATE users SET disabled=? WHERE id=?").run(body.disabled ? 1 : 0, target.id);
        if (body.disabled) db.prepare("DELETE FROM sessions WHERE userId=?").run(target.id);
        return respond(200, { ok: true });
      }
    }
    throw new AccountError(405, "此接口不支持当前请求方式。");
  }
  return { handle, currentUser, requireAdmin, database: db, transaction, close: () => { if (!database) db.close(); } };
}
