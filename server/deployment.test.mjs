import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createGuardianServer } from "./app.mjs";

for (const deployment of ["local", "cloud"]) {
  test(`health identifies ${deployment} persistence independently of AI mode and localhost`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "guardian-deployment-test-"));
    const database = deployment === "cloud" ? new DatabaseSync(":memory:") : undefined;
    const server = await createGuardianServer({
      configFile: join(directory, "ai-config.json"),
      env: {},
      bootstrapToken: "deployment-test-setup",
      ...(database ? { database, configStore: { load: async () => null } } : {}),
    });
    t.after(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      database?.close();
      await rm(directory, { recursive: true, force: true });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.deployment, deployment);
    assert.equal(health.mode, "local");
    assert.equal(health.model, "");
    assert.equal(health.verifiedAt, null);
  });
}
