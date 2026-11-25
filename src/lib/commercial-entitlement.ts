import { decodeProtectedHeader, importSPKI, jwtVerify } from "jose";
import { z } from "zod";
import { entraIdPattern } from "./entra";
import { commercialDashboardSlug, type CommercialEntitlementAssertion } from "./postgres/commercial-entitlement";

const services = {
  commercial: { path: "/api/internal/commercial-entitlement", issuer: "movopainelcomercial",
    slug: commercialDashboardSlug, prefix: "CENTRAL_BI_" },
  retention: { path: "/api/internal/retention-entitlement", issuer: "biosaude-retention",
    slug: "retencao-faturamento", prefix: "RETENTION_CENTRAL_BI_" },
  globalLimit: { path: "/api/internal/global-limit-entitlement", issuer: "biosaude-global-limit",
    slug: "limite-global-cliente", prefix: "GLOBAL_LIMIT_CENTRAL_BI_" },
} as const;
type Service = (typeof services)[keyof typeof services];
const algorithm = "EdDSA";
const lifetimeSeconds = 30;

const claimsSchema = z.object({
  tid: z.string().regex(entraIdPattern).toLowerCase(),
  oid: z.string().regex(entraIdPattern).toLowerCase(),
  dashboard: z.string(),
  permission: z.literal("dashboard:read"),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.uuidv4(),
});
const headerSchema = z.object({
  alg: z.literal(algorithm),
  typ: z.literal("JWT"),
  kid: z.string(),
}).strict();

type Lookup = (assertion: CommercialEntitlementAssertion, dashboardSlug: string) => Promise<{ accepted: boolean; allowed: boolean }>;

const respond = (status: number, body: { allowed: boolean } | { error: string }) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const unauthorized = () => respond(401, { error: "invalid_assertion" });

function logEntitlementFailure(service: Service, reason: "configuration" | "origin" | "key_id" | "assertion" | "database") {
  console.warn(JSON.stringify({ event: "central_dashboard_entitlement_failure", service: service.issuer, reason }));
}

async function settings(env: Record<string, string | undefined>, service: Service) {
  const audience = new URL(env[service.prefix + "ENTITLEMENT_URL"] ?? "");
  const local = !["preview", "production"].includes(env.VERCEL_ENV ?? "") &&
    audience.hostname === "localhost" && audience.protocol === "http:";
  const tenantId = env.ENTRA_TENANT_ID?.toLowerCase();
  const keyId = env[service.prefix + "ASSERTION_KEY_ID"];
  const publicKey = env[service.prefix + "ASSERTION_PUBLIC_KEY"]?.trim();
  if ((audience.protocol !== "https:" && !local) || audience.pathname !== service.path ||
      audience.search || audience.hash || audience.username || audience.password ||
      !tenantId || !entraIdPattern.test(tenantId) ||
      !keyId || !publicKey?.startsWith("-----BEGIN PUBLIC KEY-----")) {
    throw new Error("Configuração de concessão comercial inválida.");
  }

  if (env.VERCEL_ENV === "production") {
    const callback = new URL(env.ENTRA_REDIRECT_URI ?? "");
    if (callback.href !== new URL("/api/auth/callback", audience).href)
      throw new Error("A audiência de Production deve usar a origem canônica do portal.");
  }

  const key = await importSPKI(publicKey, algorithm);
  if (key.algorithm.name !== "Ed25519") throw new Error("A chave comercial deve ser Ed25519.");
  return { audience, tenantId, keyId, key };
}

async function handleEntitlement(
  service: Service,
  request: Request,
  lookup: Lookup,
  env: Record<string, string | undefined> = process.env,
): Promise<Response> {
  if (env.PORTAL_AUTH_MODE !== "entra" || !env[service.prefix + "ENTITLEMENT_URL"]) {
    return respond(404, { error: "not_found" });
  }

  const authorization = request.headers.get("authorization");
  const token = authorization && authorization.length <= 4096
    ? /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization)?.[1]
    : undefined;
  if (!token) return unauthorized();

  let config: Awaited<ReturnType<typeof settings>>;
  try {
    config = await settings(env, service);
  } catch {
    logEntitlementFailure(service, "configuration");
    return respond(503, { error: "unavailable" });
  }
  const target = new URL(request.url);
  if (target.origin !== config.audience.origin || target.pathname !== service.path) {
    logEntitlementFailure(service, "origin");
    return unauthorized();
  }
  if (target.search) return respond(400, { error: "invalid_request" });

  let assertion: CommercialEntitlementAssertion;
  try {
    const header = headerSchema.parse(decodeProtectedHeader(token));
    if (header.kid !== config.keyId) {
      logEntitlementFailure(service, "key_id");
      return unauthorized();
    }
    const { payload } = await jwtVerify(token, config.key, {
      algorithms: [algorithm],
      issuer: service.issuer,
      subject: service.issuer,
      audience: config.audience.href,
      maxTokenAge: lifetimeSeconds,
      requiredClaims: ["exp"],
    });
    const claims = claimsSchema.parse(payload);
    if (payload.aud !== config.audience.href || claims.tid !== config.tenantId || claims.dashboard !== service.slug ||
        claims.exp - claims.iat !== lifetimeSeconds) return unauthorized();
    assertion = {
      tenantId: claims.tid,
      objectId: claims.oid,
      jti: claims.jti,
      expiresAt: claims.exp,
    };
  } catch {
    logEntitlementFailure(service, "assertion");
    return unauthorized();
  }

  try {
    // Next.js can provide an empty stream for a POST without a body.
    const reader = request.body?.getReader();
    if (reader && !(await reader.read()).done) {
      void reader.cancel().catch(() => undefined);
      return respond(400, { error: "invalid_request" });
    }
  } catch {
    return respond(400, { error: "invalid_request" });
  }

  try {
    const decision = await lookup(assertion, service.slug);
    if (!decision.accepted) return unauthorized();
    return respond(200, { allowed: decision.allowed });
  } catch {
    logEntitlementFailure(service, "database");
    return respond(503, { error: "unavailable" });
  }
}

export function handleCommercialEntitlement(request: Request, lookup: Lookup, env: Record<string, string | undefined> = process.env) {
  return handleEntitlement(services.commercial, request, lookup, env);
}

export function handleRetentionEntitlement(request: Request, lookup: Lookup, env: Record<string, string | undefined> = process.env) {
  return handleEntitlement(services.retention, request, lookup, env);
}

export function handleGlobalLimitEntitlement(request: Request, lookup: Lookup, env: Record<string, string | undefined> = process.env) {
  return handleEntitlement(services.globalLimit, request, lookup, env);
}
