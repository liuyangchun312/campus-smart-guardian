import assert from "node:assert/strict";

const base = process.env.SMOKE_URL ?? "http://127.0.0.1:8787";
const suffix = Date.now().toString(36);
const client = () => {
  let cookie = "";
  let userId = "";
  return async (path, body, method = body === undefined ? "GET" : "POST", extra = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: { Origin: base, "Content-Type": "application/json", "X-Guardian-Request": "1", "X-Guardian-Config": "1", "X-Guardian-User": userId, Cookie: cookie, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (response.headers.has("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
    const data = await response.json();
    if (data.user) userId = data.user.id;
    return { status: response.status, data, cookie: response.headers.get("set-cookie") };
  };
};
const user = client();
const other = client();
const password = "smoke-test-strong-password";
assert.equal((await fetch(base)).status, 200);
assert.equal((await user("/api/health")).status, 200);
assert.equal((await user("/api/auth/session", undefined, "GET", { Origin: "https://foreign.example" })).status, 403);
assert.equal((await user("/api/workspace")).status, 401);
const registration = await user("/api/auth/register", { username: `smoke_${suffix}`, name: "Smoke", password });
assert.equal(registration.status, 201);
assert.match(registration.cookie, /; Secure/);
assert.equal((await user("/api/admin/users")).status, 403);
const data = { messages: [{ id: "smoke-message", role: "user", content: "smoke test" }], orders: [], inspections: [] };
assert.equal((await user("/api/workspace", { revision: 0, data }, "PUT")).status, 200);
assert.equal((await user("/api/workspace")).data.data.messages[0].content, "smoke test");
assert.equal((await user("/api/workspace", { revision: 0, data }, "PUT")).status, 409);
assert.equal((await other("/api/auth/register", { username: `other_${suffix}`, name: "Other", password })).status, 201);
assert.equal((await other("/api/workspace")).data.data.messages.length, 0);
assert.equal((await user("/api/auth/logout", {})).status, 200);
assert.equal((await user("/api/workspace")).status, 401);
assert.equal((await user("/api/auth/login", { username: `smoke_${suffix}`, password })).status, 200);
assert.equal((await user("/api/workspace")).data.data.messages.length, 1);
console.log("Cloudflare smoke passed: assets, health, origin checks, registration, secure cookies, account isolation, revisions, logout and login.");
