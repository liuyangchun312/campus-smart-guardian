import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { createGuardianServer } from "./app.mjs";

const password = "test-strong-password";
const userForm = (username = "student_one") => ({ username, password, name: "测试用户" });
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "guardian-account-test-"));
  const options = { configFile: join(dir, "ai.json"), env: {}, bootstrapToken: "test-setup-code" };
  let server;
  let base;
  const start = async () => { server = await createGuardianServer(options); server.listen(0, "127.0.0.1"); await once(server, "listening"); base = `http://127.0.0.1:${server.address().port}`; };
  const stop = async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); };
  await start();
  t.after(async () => { await stop(); assert.ok(resolve(dir).startsWith(resolve(tmpdir())) && dir.includes("guardian-account-test-")); await rm(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = ""; let userId = "";
    return { request: async (path, body, method = body === undefined ? "GET" : "POST", headers = {}) => {
      const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "X-Guardian-Request": "1", "X-Guardian-Config": "1", "X-Guardian-User": userId, Cookie: cookie, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      const data = await res.json(); if (data.user) userId = data.user.id;
      return { status: res.status, body: data, setCookie };
    }, getCookie: () => cookie, getId: () => userId };
  };
  const admin = client();
  const bootstrap = () => admin.request("/api/auth/bootstrap", { ...userForm("administrator"), setupCode: "test-setup-code" });
  return { client, admin, bootstrap, restart: async () => { await stop(); await start(); }, db: join(dir, "guardian.sqlite") };
}
test("registration creates a regular account, hashes passwords, and enforces admin access", async (t) => {
  const f = await fixture(t); const c = f.client();
  assert.equal((await c.request("/api/admin/users")).status, 401);
  assert.equal((await c.request("/api/auth/register", { ...userForm(), role: "admin" })).status, 403);
  const r = await c.request("/api/auth/register", userForm());
  assert.equal(r.status, 201); assert.equal(r.body.user.role, "user");
  assert.match(r.setCookie, /HttpOnly/); assert.match(r.setCookie, /SameSite=Strict/);
  assert.equal(r.body.user.passwordHash, undefined);
  assert.equal((await c.request("/api/admin/users")).status, 403);
  assert.equal((await c.request("/api/ai/config")).status, 403);
  assert.equal((await c.request("/api/ai/disconnect", {})).status, 403);
  assert.equal((await c.request("/api/auth/register", userForm("STUDENT_ONE"))).status, 409);
  const db = new DatabaseSync(f.db); const row = db.prepare("SELECT * FROM users").get();
  assert.notEqual(row.passwordHash, password); assert.equal(row.passwordHash.length, 128); assert.equal(row.salt.length, 32); db.close();
});
test("first admin requires setup code, is single-use, and ordinary users cannot use admin portal", async (t) => {
  const f = await fixture(t); const c = f.client();
  assert.equal((await c.request("/api/auth/session")).body.setupRequired, true);
  assert.equal((await c.request("/api/auth/bootstrap", { ...userForm(), setupCode: "wrong" })).status, 403);
  assert.equal((await f.bootstrap()).body.user.role, "admin");
  assert.equal((await f.bootstrap()).status, 403);
  assert.equal((await c.request("/api/auth/session")).body.setupRequired, false);
  await c.request("/api/auth/register", userForm());
  assert.equal((await c.request("/api/auth/login", { ...userForm(), portal: "admin" })).status, 401);
  assert.equal((await f.admin.request("/api/admin/users")).body.users.length, 2);
});
test("concurrent administrator initialization creates exactly one admin", async (t) => {
  const f = await fixture(t);
  const results = await Promise.all([f.client().request("/api/auth/bootstrap", { ...userForm("admin_one"), setupCode: "test-setup-code" }), f.client().request("/api/auth/bootstrap", { ...userForm("admin_two"), setupCode: "test-setup-code" })]);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.ok(results.some((r) => r.status === 409));
});
test("workspace persists across restart, isolates accounts and rejects stale writes/context", async (t) => {
  const f = await fixture(t); const a = f.client(); const b = f.client();
  await a.request("/api/auth/register", userForm("worker_a")); await b.request("/api/auth/register", userForm("worker_b"));
  const data = { messages: [{ id: "m1", role: "user", content: "自己的咨询" }], orders: [], inspections: [] };
  assert.equal((await a.request("/api/workspace", { data, revision: 0, userId: b.getId() }, "PUT")).body.revision, 1);
  assert.equal((await b.request("/api/workspace")).body.data.messages.length, 0);
  assert.equal((await a.request("/api/workspace", { data, revision: 0 }, "PUT")).status, 409);
  assert.equal((await a.request("/api/workspace", { data, revision: 1 }, "PUT", { "X-Guardian-User": b.getId() })).status, 401);
  assert.equal((await a.request("/api/workspace", { data: { ...data, inspections: [{}] }, revision: 1 }, "PUT")).status, 400);
  await f.restart(); assert.equal((await a.request("/api/workspace")).body.data.messages[0].content, "自己的咨询");
});
test("logout invalidates captured session and password changes invalidate other sessions", async (t) => {
  const f = await fixture(t); const a = f.client(); const b = f.client();
  await a.request("/api/auth/register", userForm()); await b.request("/api/auth/login", userForm());
  assert.equal((await a.request("/api/auth/password", { currentPassword: "wrong", password: "replacement-password" })).status, 400);
  assert.equal((await a.request("/api/auth/password", { currentPassword: password, password: "replacement-password" })).status, 200);
  assert.equal((await b.request("/api/workspace")).status, 401);
  assert.equal((await b.request("/api/auth/login", userForm())).status, 401);
  assert.equal((await b.request("/api/auth/login", { ...userForm(), password: "replacement-password" })).status, 200);
  const captured = a.getCookie(); await a.request("/api/auth/logout", {});
  assert.equal((await a.request("/api/workspace", undefined, "GET", { Cookie: captured })).status, 401);
});
test("admin can disable/reactivate regular accounts and disabling revokes sessions", async (t) => {
  const f = await fixture(t); const a = f.client(); await f.bootstrap(); await a.request("/api/auth/register", userForm());
  const path = `/api/admin/users/${a.getId()}`;
  assert.equal((await a.request(path, { disabled: true }, "PATCH")).status, 403);
  assert.equal((await f.admin.request(path, { disabled: true }, "PATCH")).status, 200);
  assert.equal((await a.request("/api/workspace")).status, 401);
  assert.equal((await a.request("/api/auth/login", userForm())).status, 401);
  assert.equal((await f.admin.request(`/api/admin/users/${f.admin.getId()}`, { disabled: true }, "PATCH")).status, 403);
  await f.admin.request(path, { disabled: false }, "PATCH");
  assert.equal((await a.request("/api/auth/login", userForm())).status, 200);
  const json = JSON.stringify((await f.admin.request("/api/admin/users")).body);
  assert.equal(json.includes("passwordHash"), false); assert.equal(json.includes("salt"), false);
});
test("foreign origins, missing request headers, weak passwords and brute-force attempts are rejected", async (t) => {
  const f = await fixture(t); const c = f.client();
  assert.equal((await c.request("/api/auth/register", userForm(), "POST", { Origin: "https://evil.example" })).status, 403);
  assert.equal((await c.request("/api/auth/register", userForm(), "POST", { "X-Guardian-Request": "" })).status, 403);
  assert.equal((await c.request("/api/auth/register", { ...userForm(), password: "123" })).status, 400);
  for (let i = 0; i < 8; i++) assert.equal((await c.request("/api/auth/login", { username: "unknown", password })).status, 401);
  assert.equal((await c.request("/api/auth/login", { username: "unknown", password })).status, 429);
});
test("expired sessions are rejected", async (t) => {
  const f = await fixture(t); const c = f.client(); await c.request("/api/auth/register", userForm());
  const db = new DatabaseSync(f.db); db.prepare("UPDATE sessions SET expiresAt=0").run(); db.close();
  assert.equal((await c.request("/api/workspace")).status, 401);
});
