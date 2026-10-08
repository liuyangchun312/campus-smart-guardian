import { setTimeout as pause } from "node:timers/promises";

export async function recoverModel(call, primary, backup, { delayMs = 300 } = {}) {
  const deadline = AbortSignal.timeout(44000);
  let attempts = 0;
  let issue;
  let attemptedModel = primary.model;
  let fallbackAttempted = false;
  const invoke = async (config) => {
    attempts++;
    attemptedModel = config.model;
    const timeout = backup?.enabled ? attempts === 1 ? 20000 : attempts === 2 ? 10000 : 12000 : attempts === 1 ? 30000 : 13000;
    return call(config, AbortSignal.any([deadline, AbortSignal.timeout(timeout)]));
  };
  try {
    return { text: await invoke(primary), model: primary.model, attempts, fallback: false };
  } catch (error) {
    issue = error;
    if (error.status >= 500 || error.status === 429 || ["TypeError", "TimeoutError", "AbortError"].includes(error.name)) {
      await pause(delayMs);
      try {
        return { text: await invoke(primary), model: primary.model, attempts, fallback: false, issue };
      } catch (retryError) { issue = retryError; }
    }
  }
  if (backup?.enabled && !deadline.aborted) {
    fallbackAttempted = true;
    try {
      return { text: await invoke(backup), model: backup.model, attempts, fallback: true, issue };
    } catch (error) { issue = error; }
  }
  issue.attempts = attempts;
  issue.model = attemptedModel;
  issue.fallback = fallbackAttempted;
  throw issue;
}

export function createAiRuntime(db, transaction, { dailyLimit = 60, now = Date.now } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_daily_usage (userId TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(userId, day));
    CREATE TABLE IF NOT EXISTS ai_events (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL);`);
  const limit = Number.isInteger(Number(dailyLimit)) && Number(dailyLimit) >= 1 && Number(dailyLimit) <= 10000 ? Number(dailyLimit) : 60;
  const day = () => new Date(now() + 8 * 3600000).toISOString().slice(0, 10);
  return {
    consume(userId) {
      return transaction(() => {
        const today = day();
        db.prepare("DELETE FROM ai_daily_usage WHERE day < ?").run(today);
        const count = db.prepare("SELECT count FROM ai_daily_usage WHERE userId=? AND day=?").get(userId, today)?.count ?? 0;
        if (count >= limit) return { allowed: false, remaining: 0, limit };
        db.prepare("INSERT INTO ai_daily_usage VALUES (?, ?, 1) ON CONFLICT(userId, day) DO UPDATE SET count=count+1").run(userId, today);
        return { allowed: true, remaining: limit - count - 1, limit };
      });
    },
    record(event) {
      transaction(() => {
        const data = { at: new Date(now()).toISOString(), ok: event.ok, model: event.model, durationMs: event.durationMs, attempts: event.attempts, fallback: event.fallback, issue: event.issue ?? null };
        db.prepare("INSERT INTO ai_events(data) VALUES (?)").run(JSON.stringify(data));
        db.exec("DELETE FROM ai_events WHERE id NOT IN (SELECT id FROM ai_events ORDER BY id DESC LIMIT 100)");
      });
    },
    stats() {
      const events = db.prepare("SELECT data FROM ai_events ORDER BY id DESC").all().map((row) => JSON.parse(row.data));
      return {
        dailyLimit: limit,
        total: events.length,
        success: events.filter((event) => event.ok).length,
        recovered: events.filter((event) => event.ok && event.attempts > 1).length,
        fallback: events.filter((event) => event.fallback).length,
        averageMs: events.length ? Math.round(events.reduce((sum, event) => sum + event.durationMs, 0) / events.length) : 0,
        lastIssue: events.find((event) => event.issue) ?? null,
        recent: events.slice(0, 10),
      };
    },
  };
}
