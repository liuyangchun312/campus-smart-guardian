import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { once } from "node:events";
import { createGuardianServer } from "./app.mjs";

test("cloud storage keeps accounts across server recreation and issues secure cookies", async () => {
  const db = new DatabaseSync(":memory:");
  const options = { database: db, configStore: { load: async () => null, save: async () => {} }, env: {}, bootstrapToken: "cloud-setup", secureCookies: true, requestAllowed: (req) => req.headers.origin === "https://guardian.example" };
  let server;
  const start = async () => {
    server = await createGuardianServer(options);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); };
  const headers = { Origin: "https://guardian.example", "Content-Type": "application/json", "X-Guardian-Request": "1" };
  try {
    let base = await start();
    const denied = await fetch(`${base}/api/auth/session`, { headers: { Origin: "https://foreign.example" } });
    assert.equal(denied.status, 403);
    const result = await fetch(`${base}/api/auth/register`, { method: "POST", headers, body: JSON.stringify({ username: "cloud_user", name: "Cloud user", password: "cloud-strong-password" }) });
    assert.equal(result.status, 201);
    assert.match(result.headers.get("set-cookie"), /; Secure/);
    const cookie = result.headers.get("set-cookie").split(";")[0];
    await stop();
    base = await start();
    const session = await fetch(`${base}/api/auth/session`, { headers: { ...headers, Cookie: cookie } });
    assert.equal((await session.json()).user.username, "cloud_user");
  } finally {
    if (server?.listening) await stop();
    db.close();
  }
});
