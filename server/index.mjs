import { createGuardianServer } from "./app.mjs";
const server = await createGuardianServer();
server.requestTimeout = 55000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.listen(3001, "127.0.0.1", () =>
  console.log("校园智能管家 API：http://127.0.0.1:3001"),
);
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE" ? "端口 3001 已被占用。" : "API 服务启动失败。",
  );
  process.exitCode = 1;
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
