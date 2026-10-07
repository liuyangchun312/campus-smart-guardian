import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const file = new URL("../.guardian/cloudflare-admin.json", import.meta.url);
if (process.argv[2] === "prepare") {
  await mkdir(new URL("../.guardian/", import.meta.url), { recursive: true });
  // Keep deployment credentials only in the ignored local data directory.
  await writeFile(file, JSON.stringify({ username: "guardian_admin", name: "管理员", password: randomBytes(24).toString("base64url"), setupCode: randomBytes(32).toString("base64url") }, null, 2), { flag: "wx" });
  console.log("Deployment credentials prepared in .guardian/cloudflare-admin.json");
} else {
  const base = process.argv[2];
  if (!base?.startsWith("https://")) throw new Error("Provide the HTTPS deployment URL.");
  const credentials = JSON.parse(await readFile(file, "utf8"));
  const response = await fetch(`${base}/api/auth/bootstrap`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json", "X-Guardian-Request": "1" }, body: JSON.stringify(credentials) });
  const result = await response.json();
  if (response.status !== 201 || result.user?.role !== "admin") throw new Error(`Admin initialization failed: ${response.status} ${result.error ?? ""}`);
  const session = await fetch(`${base}/api/auth/session`, { headers: { Cookie: response.headers.get("set-cookie").split(";")[0] } });
  const state = await session.json();
  if (state.setupRequired || state.user?.role !== "admin") throw new Error("Admin session verification failed.");
  delete credentials.setupCode;
  credentials.url = base;
  await writeFile(file, JSON.stringify(credentials, null, 2));
  console.log("Administrator initialized and verified. Credentials remain in the ignored local file.");
}
