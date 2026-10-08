import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createAiRuntime, recoverModel } from "./ai-runtime.mjs";

test("recovery retries transient failures and then uses the configured backup", async () => {
  const calls = [];
  const result = await recoverModel(async (config) => {
    calls.push(config.model);
    if (config.model === "primary") throw Object.assign(new Error("unavailable"), { status: 502 });
    return "backup answer";
  }, { model: "primary" }, { model: "backup", enabled: true }, { delayMs: 0 });
  assert.deepEqual(calls, ["primary", "primary", "backup"]);
  assert.equal(result.text, "backup answer");
  assert.equal(result.model, "backup");
  assert.equal(result.attempts, 3);
  assert.equal(result.fallback, true);
});

test("permission errors skip same-service retry and disabled backups are never called", async () => {
  let calls = 0;
  await assert.rejects(recoverModel(async () => {
    calls++;
    throw Object.assign(new Error("permission"), { status: 400 });
  }, { model: "primary" }, { model: "backup", enabled: false }, { delayMs: 0 }), { status: 400 });
  assert.equal(calls, 1);
});

test("failed backup reports the last attempted model for administrator diagnostics", async () => {
  await assert.rejects(recoverModel(async () => {
    throw Object.assign(new Error("unavailable"), { status: 502 });
  }, { model: "primary" }, { model: "backup", enabled: true }, { delayMs: 0 }), error => {
    assert.equal(error.model, "backup");
    assert.equal(error.fallback, true);
    assert.equal(error.attempts, 3);
    return true;
  });
});

test("daily quotas are account-isolated and survive runtime recreation", () => {
  const db = new DatabaseSync(":memory:");
  const transaction = (fn) => fn();
  const now = () => Date.parse("2026-10-08T10:00:00Z");
  const runtime = createAiRuntime(db, transaction, { dailyLimit: 2, now });
  assert.equal(runtime.consume("one").remaining, 1);
  assert.equal(runtime.consume("one").remaining, 0);
  assert.equal(runtime.consume("one").allowed, false);
  assert.equal(runtime.consume("two").allowed, true);
  assert.equal(createAiRuntime(db, transaction, { dailyLimit: 2, now }).consume("one").allowed, false);
  assert.equal(createAiRuntime(db, transaction, { dailyLimit: 2, now: () => Date.parse("2026-10-08T16:00:00Z") }).consume("one").allowed, true);
  db.close();
});

test("monitor persists a bounded sample without consultation content", () => {
  const db = new DatabaseSync(":memory:");
  const runtime = createAiRuntime(db, (fn) => fn());
  for (let i = 0; i < 102; i++) runtime.record({ ok: i % 2 === 0, model: "test", durationMs: 100, attempts: 1, fallback: false, issue: i % 2 ? "服务暂不可用" : null });
  const stats = createAiRuntime(db, (fn) => fn()).stats();
  assert.equal(stats.total, 100);
  assert.equal(stats.success, 50);
  assert.equal(stats.averageMs, 100);
  assert.equal(stats.recent.length, 10);
  assert.equal(stats.lastIssue.issue, "服务暂不可用");
  db.close();
});
