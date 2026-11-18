import { readEntraSettings } from "./entra";
import { createPostgresPool } from "./postgres/connection";
import { PostgresDashboardRepository } from "./postgres/dashboards";
import { PostgresIdentity } from "./postgres/identity";

export const corporateEnabled = () => process.env.PORTAL_AUTH_MODE === "entra";

export function corporateSettings() {
  const settings = readEntraSettings();
  const redirect = new URL(settings.redirectUri);
  const secure = redirect.protocol === "https:";
  if ((!secure && !(redirect.protocol === "http:" && redirect.hostname === "localhost")) ||
      redirect.pathname !== "/api/auth/callback" ||
      redirect.username || redirect.password || redirect.search || redirect.hash) {
    throw new Error("Configure a URI de retorno do portal para /api/auth/callback.");
  }
  return {
    ...settings,
    tenantId: settings.tenantId.toLowerCase(),
    redirect,
    sessionCookie: secure ? "__Host-central-bi-session" : "central-bi-local-session",
    attemptCookie: secure ? "__Host-central-bi-login" : "central-bi-local-login",
    cookie: { httpOnly: true, secure, sameSite: "lax" as const, path: "/" },
  };
}

export function isPortalOrigin(request: Request): boolean {
  return request.headers.get("origin") === corporateSettings().redirect.origin;
}

let services: ReturnType<typeof buildServices> | undefined;
function buildServices() {
  const pool = createPostgresPool();
  pool.on("error", () => console.error("Falha na conexão PostgreSQL do portal."));
  return { pool, identity: new PostgresIdentity(pool), dashboards: new PostgresDashboardRepository(pool) };
}

export function corporateServices() {
  return services ??= buildServices();
}
