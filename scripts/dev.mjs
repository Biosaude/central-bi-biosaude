// The socket boundary is essential: Host/Origin headers alone do not prove locality.
import http from "node:http";
import { randomBytes } from "node:crypto";

if (process.env.NODE_ENV && process.env.NODE_ENV !== "development") {
  throw new Error("O servidor demonstrativo só permite NODE_ENV=development.");
}
process.env.NODE_ENV = "development";
process.env.LOCAL_GATE_TOKEN = randomBytes(32).toString("hex");
const { default: next } = await import("next");
const { isLocalRequest } = await import("./local-boundary.mjs");
const port = Number(process.env.PORT || 3000);
const app = next({ dev: true, hostname: "127.0.0.1", port, webpack: true });
await app.prepare();
const handle = app.getRequestHandler();
const server = http.createServer((req, res) => {
  delete req.headers["x-local-demo-gate"];
  if (process.env.LOCAL_DEMO_ENABLED === "true" && isLocalRequest(req, port)) {
    req.headers["x-local-demo-gate"] = process.env.LOCAL_GATE_TOKEN;
  }
  res.setHeader("Cache-Control", "no-store");
  handle(req, res);
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Central de BI: servidor local na porta ${port}. Demonstração: ${process.env.LOCAL_DEMO_ENABLED === "true" ? "ativa" : "desativada"}.`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
