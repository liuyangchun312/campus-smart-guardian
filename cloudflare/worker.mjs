import { DurableObject } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import { createGuardianServer } from "../server/app.mjs";

export class Guardian extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      const database = {
        exec: (query) => sql.exec(query),
        prepare: (query) => ({
          get: (...args) => sql.exec(query, ...args).toArray()[0],
          all: (...args) => sql.exec(query, ...args).toArray(),
          run: (...args) => sql.exec(query, ...args).toArray(),
        }),
        transaction: (callback) => ctx.storage.transactionSync(callback),
      };
      sql.exec("CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
      const configStore = {
        load: async () => {
          const row = sql.exec("SELECT data FROM settings WHERE id='ai'").toArray()[0];
          return row ? JSON.parse(row.data) : null;
        },
        save: async (value) => { sql.exec("INSERT INTO settings VALUES ('ai', ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data", JSON.stringify(value)); },
      };
      const server = await createGuardianServer({ database, configStore, env, bootstrapToken: env.ADMIN_SETUP_CODE, secureCookies: true, requestAllowed: () => true, clientAddress: (req) => req.headers["x-guardian-ip"] ?? "unknown" });
      server.listen(0);
      this.handler = httpServerHandler(server);
    });
  }
  async fetch(request) {
    return this.handler.fetch(request, this.env, this.ctx);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const origin = request.headers.get("Origin");
      if (request.headers.get("Sec-Fetch-Site") === "cross-site" || (origin && origin !== url.origin)) {
        return Response.json({ error: "请从本站页面提交请求。" }, { status: 403 });
      }
      const headers = new Headers(request.headers);
      // Never trust a client-supplied proxy address for authentication throttling.
      headers.set("X-Guardian-IP", request.headers.get("CF-Connecting-IP") ?? "unknown");
      return env.GUARDIAN.getByName("primary").fetch(new Request(request, { headers }));
    }
    return env.ASSETS.fetch(request);
  },
};
