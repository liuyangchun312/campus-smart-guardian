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
async function fixture(t, { cloud = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "guardian-account-test-"));
  const options = { configFile: join(dir, "ai.json"), env: {}, bootstrapToken: "test-setup-code" };
  const cloudDb = cloud ? new DatabaseSync(":memory:") : null;
  if (cloudDb) {
    options.database = { exec: query => cloudDb.exec(query), prepare: query => cloudDb.prepare(query), transaction: callback => {
      cloudDb.exec("BEGIN");
      try { const result = callback(); cloudDb.exec("COMMIT"); return result; }
      catch (e) { cloudDb.exec("ROLLBACK"); throw e; }
    } };
    options.configStore = { load: async () => null, save: async () => {} };
  }
  let server;
  let base;
  const start = async () => { server = await createGuardianServer(options); server.listen(0, "127.0.0.1"); await once(server, "listening"); base = `http://127.0.0.1:${server.address().port}`; };
  const stop = async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); };
  await start();
  t.after(async () => { await stop(); cloudDb?.close(); assert.ok(resolve(dir).startsWith(resolve(tmpdir())) && dir.includes("guardian-account-test-")); await rm(dir, { recursive: true, force: true }); });
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

const repairDraft = (id = "BX-SCHOOL-1") => ({ id, category: "水电与暖通", location: "北区3号楼201室", description: "洗手池下面水管持续漏水", priority: "紧急", safety: "注意防滑", status: "draft", createdAt: "2026-10-08T00:00:00.000Z", history: [{ status: "draft", at: "2026-10-08T00:00:00.000Z" }] });
async function saveRepair(client, id = "BX-SCHOOL-1") {
  const snapshot = (await client.request("/api/workspace")).body;
  return client.request("/api/workspace", { data: { ...snapshot.data, orders: [repairDraft(id)], messages: [{ id: "private", role: "user", content: "不能提供给校方的私人咨询" }] }, revision: snapshot.revision }, "PUT");
}

test("only explicit repair submission enters the school queue, without private consultation", async (t) => {
  const f = await fixture(t); await f.bootstrap(); const user = f.client(); const other = f.client();
  await user.request("/api/auth/register", userForm()); await other.request("/api/auth/register", userForm("other_user"));
  await saveRepair(user);
  assert.equal((await f.admin.request("/api/admin/orders")).body.orders.length, 0);
  assert.equal((await user.request("/api/admin/orders")).status, 403);
  assert.equal((await other.request("/api/orders", { id: "BX-SCHOOL-1" })).status, 404);
  const submitted = await user.request("/api/orders", { id: "BX-SCHOOL-1" });
  assert.equal(submitted.status, 201); assert.equal(submitted.body.order.status, "submitted");
  assert.equal(submitted.body.order.school.ownerId, user.getId());
  assert.equal((await user.request("/api/orders", { id: "BX-SCHOOL-1" })).status, 200);
  const queue = await f.admin.request("/api/admin/orders");
  assert.equal(queue.body.orders.length, 1); assert.equal(JSON.stringify(queue.body).includes("私人咨询"), false);
  assert.equal((await other.request("/api/orders")).body.orders.length, 0);
  await f.restart(); assert.equal((await user.request("/api/orders")).body.orders[0].status, "submitted");
});

test("school repairs follow authenticated transitions with assignee, evidence and user confirmation", async (t) => {
  const f = await fixture(t); await f.bootstrap(); const user = f.client(); await user.request("/api/auth/register", userForm()); await saveRepair(user);
  let order = (await user.request("/api/orders", { id: "BX-SCHOOL-1" })).body.order;
  const path = `/api/admin/orders/${user.getId()}/${order.id}`;
  assert.equal((await user.request(path, { action: "accept", revision: 1, assignee: "维修组" }, "PATCH")).status, 403);
  assert.equal((await f.admin.request(path, { action: "complete", revision: 1, note: "已修复" }, "PATCH")).status, 409);
  assert.equal((await user.request(`/api/orders/${order.id}`, { action: "confirm", revision: 1 }, "PATCH")).status, 409);
  assert.equal((await f.admin.request(path, { action: "accept", revision: 1, assignee: " " }, "PATCH")).status, 400);
  order = (await f.admin.request(path, { action: "accept", revision: 1, assignee: "水电维修组", note: "已安排现场检查" }, "PATCH")).body.order;
  assert.equal(order.status, "accepted"); assert.equal(order.school.assignee, "水电维修组");
  order = (await f.admin.request(path, { action: "start", revision: order.school.revision, note: "正在更换水管" }, "PATCH")).body.order;
  assert.equal(order.status, "processing");
  assert.equal((await f.admin.request(path, { action: "complete", revision: order.school.revision, note: " " }, "PATCH")).status, 400);
  order = (await f.admin.request(path, { action: "complete", revision: order.school.revision, note: "更换接头后试水，无漏水" }, "PATCH")).body.order;
  assert.equal(order.status, "awaiting_confirmation");
  order = (await user.request(`/api/orders/${order.id}`, { action: "confirm", revision: order.school.revision }, "PATCH")).body.order;
  assert.equal(order.status, "resolved"); assert.equal(order.history.at(-1).actorRole, "user");
  assert.equal(order.history.at(-2).actorRole, "admin"); assert.equal(order.history.at(-2).note, "更换接头后试水，无漏水");
});

test("stale revisions and foreign owner actions cannot change a school repair", async (t) => {
  const f = await fixture(t); await f.bootstrap(); const user = f.client(); const other = f.client();
  await user.request("/api/auth/register", userForm()); await other.request("/api/auth/register", userForm("other_user")); await saveRepair(user);
  const order = (await user.request("/api/orders", { id: "BX-SCHOOL-1" })).body.order;
  const path = `/api/admin/orders/${user.getId()}/${order.id}`;
  const results = await Promise.all([f.admin.request(path, { action: "accept", revision: 1, assignee: "维修组甲" }, "PATCH"), f.admin.request(path, { action: "accept", revision: 1, assignee: "维修组乙" }, "PATCH")]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await other.request(`/api/orders/${order.id}`, { action: "reopen", revision: 2, note: "仍漏水", ownerId: user.getId() }, "PATCH")).status, 404);
  assert.equal((await user.request(`/api/orders/${order.id}`, { action: "accept", revision: 2, assignee: "冒充校方" }, "PATCH")).status, 403);
  assert.equal((await f.admin.request(path, { action: "start", revision: 1 }, "PATCH")).status, 409);
});

test("private workspace writes cannot overwrite or delete official school status", async (t) => {
  const f = await fixture(t); await f.bootstrap(); const user = f.client(); await user.request("/api/auth/register", userForm()); await saveRepair(user);
  await user.request("/api/orders", { id: "BX-SCHOOL-1" });
  await f.admin.request(`/api/admin/orders/${user.getId()}/BX-SCHOOL-1`, { action: "accept", revision: 1, assignee: "维修组" }, "PATCH");
  const snapshot = (await user.request("/api/workspace")).body;
  await user.request("/api/workspace", { data: { ...snapshot.data, orders: [] }, revision: snapshot.revision }, "PUT");
  assert.equal((await user.request("/api/orders")).body.orders[0].status, "accepted");
});

test("user feedback reopens processing and identical local IDs stay isolated by owner", async (t) => {
  const f = await fixture(t); await f.bootstrap(); const user = f.client(); const other = f.client();
  await user.request("/api/auth/register", userForm()); await other.request("/api/auth/register", userForm("other_user"));
  await saveRepair(user); await saveRepair(other);
  await user.request("/api/orders", { id: "BX-SCHOOL-1" }); await other.request("/api/orders", { id: "BX-SCHOOL-1" });
  assert.equal((await f.admin.request("/api/admin/orders")).body.orders.length, 2);
  const path = `/api/admin/orders/${user.getId()}/BX-SCHOOL-1`;
  await f.admin.request(path, { action: "accept", revision: 1, assignee: "维修组" }, "PATCH");
  await f.admin.request(path, { action: "start", revision: 2 }, "PATCH");
  await f.admin.request(path, { action: "complete", revision: 3, note: "已更换水管" }, "PATCH");
  assert.equal((await user.request("/api/orders/BX-SCHOOL-1", { action: "reopen", revision: 4, note: " " }, "PATCH")).status, 400);
  const reopened = await user.request("/api/orders/BX-SCHOOL-1", { action: "reopen", revision: 4, note: "接头仍然漏水，请复查" }, "PATCH");
  assert.equal(reopened.body.order.status, "processing"); assert.equal(reopened.body.order.history.at(-1).note, "接头仍然漏水，请复查");
  assert.equal((await other.request("/api/orders")).body.orders[0].status, "submitted");
});

test("school endpoints enforce session and mutation headers and derive emergency priority server-side", async (t) => {
  const f = await fixture(t); const user = f.client();
  assert.equal((await user.request("/api/orders")).status, 401);
  await user.request("/api/auth/register", userForm());
  const draft = { ...repairDraft(), description: "北区3号楼配电箱正在冒烟", priority: "普通", safety: "假的安全提示", history: [{ status: "draft", at: "2026-10-08T00:00:00Z", actorName: "伪造校方", actorRole: "admin" }] };
  await user.request("/api/workspace", { data: { messages: [], orders: [draft], inspections: [] }, revision: 0 }, "PUT");
  assert.equal((await user.request("/api/orders", { id: draft.id }, "POST", { "X-Guardian-Request": "" })).status, 403);
  assert.equal((await user.request("/api/orders", { id: draft.id }, "POST", { Origin: "https://foreign.example" })).status, 403);
  const result = await user.request("/api/orders", { id: draft.id });
  assert.equal(result.body.order.priority, "特急");
  assert.notEqual(result.body.order.safety, "假的安全提示");
  assert.equal(result.body.order.history[0].actorRole, "user");
  assert.equal(JSON.stringify(result.body.order).includes("伪造校方"), false);
});

test("school processing persists with the injected cloud transaction adapter", async (t) => {
  const f = await fixture(t, { cloud: true }); await f.bootstrap(); const user = f.client();
  await user.request("/api/auth/register", userForm()); await saveRepair(user);
  const submitted = await user.request("/api/orders", { id: "BX-SCHOOL-1" });
  assert.equal(submitted.status, 201);
  const accepted = await f.admin.request(`/api/admin/orders/${user.getId()}/BX-SCHOOL-1`, { action: "accept", revision: 1, assignee: "云端维修组" }, "PATCH");
  assert.equal(accepted.status, 200);
  await f.restart();
  const saved = (await user.request("/api/orders")).body.orders[0];
  assert.equal(saved.status, "accepted"); assert.equal(saved.school.assignee, "云端维修组"); assert.equal(saved.school.revision, 2);
});

test("deleting a submitted repair hides only its owner's copy and preserves school handling", async (t) => {
  const f = await fixture(t); await f.bootstrap(); const user = f.client(); const other = f.client();
  await user.request("/api/auth/register", userForm()); await other.request("/api/auth/register", userForm("other_user"));
  await saveRepair(user); await saveRepair(other);
  const submitted = (await user.request("/api/orders", { id: "BX-SCHOOL-1" })).body.order;
  await other.request("/api/orders", { id: "BX-SCHOOL-1" });
  const workspace = (await user.request("/api/workspace")).body;
  const deleted = await user.request("/api/orders/BX-SCHOOL-1", { revision: 1, ownerId: other.getId() }, "DELETE");
  assert.equal(deleted.status, 200); assert.equal(deleted.body.deletedId, "BX-SCHOOL-1");
  assert.deepEqual((await user.request("/api/orders")).body, { orders: [], deletedIds: ["BX-SCHOOL-1"] });
  assert.equal((await other.request("/api/orders")).body.orders.length, 1);
  assert.deepEqual((await other.request("/api/orders")).body.deletedIds, []);
  assert.deepEqual((await user.request("/api/workspace")).body, workspace);
  const queue = (await f.admin.request("/api/admin/orders")).body.orders;
  assert.equal(queue.length, 2);
  assert.deepEqual(queue.find(order => order.school.ownerId === user.getId()), submitted);
  const path = `/api/admin/orders/${user.getId()}/BX-SCHOOL-1`;
  const accepted = await f.admin.request(path, { action: "accept", revision: 1, assignee: "维修组" }, "PATCH");
  assert.equal(accepted.status, 200); assert.equal(accepted.body.order.status, "accepted");
  assert.equal(accepted.body.order.history.length, 2);
  assert.equal((await user.request("/api/orders/BX-SCHOOL-1", { revision: 1 }, "DELETE")).status, 200);
  assert.equal((await user.request("/api/orders", { id: "BX-SCHOOL-1" })).status, 409);
  assert.equal((await user.request("/api/orders/BX-SCHOOL-1", { action: "confirm", revision: 2 }, "PATCH")).status, 404);
  assert.equal((await user.request("/api/orders")).body.orders.length, 0);
  assert.equal((await f.admin.request(path, { revision: 2 }, "DELETE")).status, 405);
});

test("submitted repair deletion requires an authenticated owner, request header and current revision", async (t) => {
  const f = await fixture(t); await f.bootstrap(); const user = f.client(); const other = f.client();
  assert.equal((await user.request("/api/orders/BX-SCHOOL-1", { revision: 1 }, "DELETE")).status, 401);
  await user.request("/api/auth/register", userForm()); await other.request("/api/auth/register", userForm("other_user"));
  await saveRepair(user); await user.request("/api/orders", { id: "BX-SCHOOL-1" });
  assert.equal((await other.request("/api/orders/BX-SCHOOL-1", { revision: 1, ownerId: user.getId() }, "DELETE")).status, 404);
  assert.equal((await user.request("/api/orders/BX-SCHOOL-1", { revision: 1 }, "DELETE", { "X-Guardian-Request": "" })).status, 403);
  assert.equal((await user.request("/api/orders/BX-SCHOOL-1", { revision: 1 }, "DELETE", { Origin: "https://foreign.example" })).status, 403);
  assert.equal((await user.request("/api/orders/BX-SCHOOL-1", { revision: 1 }, "DELETE", { "X-Guardian-User": other.getId() })).status, 401);
  for (const revision of [undefined, "1", 0, -1, 1.5]) {
    assert.equal((await user.request("/api/orders/BX-SCHOOL-1", { revision }, "DELETE")).status, 400);
  }
  assert.equal((await user.request("/api/orders/BX-SCHOOL-1/extra", { revision: 1 }, "DELETE")).status, 400);
  assert.equal((await user.request("/api/orders/%ZZ", { revision: 1 }, "DELETE")).status, 400);
  assert.equal((await user.request("/api/orders/missing", { revision: 1 }, "DELETE")).status, 404);
  await f.admin.request(`/api/admin/orders/${user.getId()}/BX-SCHOOL-1`, { action: "accept", revision: 1, assignee: "维修组" }, "PATCH");
  assert.equal((await user.request("/api/orders/BX-SCHOOL-1", { revision: 1 }, "DELETE")).status, 409);
  assert.equal((await user.request("/api/orders")).body.orders[0].status, "accepted");
  assert.deepEqual((await user.request("/api/orders")).body.deletedIds, []);
  assert.equal((await user.request("/api/orders/BX-SCHOOL-1", { revision: 2 }, "DELETE")).status, 200);
});

for (const cloud of [false, true]) {
  test(`submitted repair deletion persists across restart with ${cloud ? "injected cloud" : "local"} storage`, async (t) => {
    const f = await fixture(t, { cloud }); await f.bootstrap(); const user = f.client();
    await user.request("/api/auth/register", userForm()); await saveRepair(user);
    await user.request("/api/orders", { id: "BX-SCHOOL-1" });
    assert.equal((await user.request("/api/orders/BX-SCHOOL-1", { revision: 1 }, "DELETE")).status, 200);
    await f.restart();
    assert.deepEqual((await user.request("/api/orders")).body, { orders: [], deletedIds: ["BX-SCHOOL-1"] });
    const schoolOrder = (await f.admin.request("/api/admin/orders")).body.orders[0];
    assert.equal(schoolOrder.id, "BX-SCHOOL-1"); assert.equal(schoolOrder.history.length, 1); assert.equal(schoolOrder.school.revision, 1);
    assert.equal((await user.request("/api/orders", { id: "BX-SCHOOL-1" })).status, 409);
    assert.equal((await user.request("/api/orders/BX-SCHOOL-1", { revision: 1 }, "DELETE")).status, 200);
  });
}
