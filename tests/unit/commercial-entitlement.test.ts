import { generateKeyPairSync, randomUUID } from "node:crypto";
import { SignJWT, type JWTPayload } from "jose";
import { describe, expect, it, vi } from "vitest";
import { handleCommercialEntitlement, handleRetentionEntitlement, handleGlobalLimitEntitlement } from "../../src/lib/commercial-entitlement";
import { firstObjectId, tenantId } from "../fixtures/corporate";

const endpoint = "https://central-preview.example.invalid/api/internal/commercial-entitlement";
const service = "movopainelcomercial";
const keyId = "commercial-test";
const keys = generateKeyPairSync("ed25519");
const env = {
  PORTAL_AUTH_MODE: "entra",
  VERCEL_ENV: "preview",
  ENTRA_TENANT_ID: tenantId,
  CENTRAL_BI_ENTITLEMENT_URL: endpoint,
  CENTRAL_BI_ASSERTION_KEY_ID: keyId,
  CENTRAL_BI_ASSERTION_PUBLIC_KEY: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
};

async function signAssertion(
  overrides: JWTPayload = {},
  privateKey = keys.privateKey,
  kid = keyId,
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: service, sub: service, aud: endpoint, iat: now, exp: now + 30, jti: randomUUID(),
    tid: tenantId, oid: firstObjectId, dashboard: "painel-comercial-r1",
    permission: "dashboard:read", ...overrides,
  }).setProtectedHeader({ alg: "EdDSA", typ: "JWT", kid }).sign(privateKey);
}

function request(assertion?: string, url = endpoint, body?: string) {
  return new Request(url, {
    method: "POST",
    headers: assertion ? { Authorization: `Bearer ${assertion}` } : {},
    body,
  });
}

describe("endpoint interno de concessão do Comercial", () => {
  it("devolve somente a decisão e consulta a concessão novamente para cada asserção", async () => {
    const lookup = vi.fn()
      .mockResolvedValueOnce({ accepted: true, allowed: true })
      .mockResolvedValueOnce({ accepted: true, allowed: false });
    for (const allowed of [true, false]) {
      const response = await handleCommercialEntitlement(request(await signAssertion()), lookup, env);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toEqual({ allowed });
    }
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(lookup.mock.calls[0][0]).toMatchObject({ tenantId, objectId: firstObjectId });
    expect(lookup.mock.calls[0][0].jti).not.toBe(lookup.mock.calls[1][0].jti);
  });

  it("rejeita asserções ausentes, não confiáveis ou de outro escopo", async () => {
    const now = Math.floor(Date.now() / 1000);
    const invalid = [
      undefined, "bad-token",
      await signAssertion({}, generateKeyPairSync("ed25519").privateKey),
      await signAssertion({}, keys.privateKey, "different-key"),
      await signAssertion({ iss: "other-service" }),
      await signAssertion({ sub: "other-service" }),
      await signAssertion({ aud: "https://other-preview.example.invalid" }),
      await signAssertion({ aud: [endpoint] }),
      await signAssertion({ tid: firstObjectId }),
      await signAssertion({ oid: "someone" }),
      await signAssertion({ dashboard: "acesso-alfa" }),
      await signAssertion({ permission: "dashboard:manage" }),
      await signAssertion({ iat: now - 35, exp: now - 5 }),
      await signAssertion({ iat: now + 5, exp: now + 35 }),
      await signAssertion({ iat: now, exp: now + 120 }),
      await signAssertion({ jti: undefined }),
    ];
    const lookup = vi.fn();
    for (const token of invalid) {
      const response = await handleCommercialEntitlement(request(token), lookup, env);
      expect(response.status).toBe(401);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("recusa replay, URL divergente, corpo e indisponibilidade sem vazar detalhes", async () => {
    const token = await signAssertion();
    const replay = vi.fn().mockResolvedValue({ accepted: false, allowed: false });
    expect((await handleCommercialEntitlement(request(token), replay, env)).status).toBe(401);
    const lookup = vi.fn().mockRejectedValue(new Error("detalhe interno do PostgreSQL"));
    expect((await handleCommercialEntitlement(request(token, endpoint.replace("central-preview", "other")), lookup, env)).status).toBe(401);
    expect((await handleCommercialEntitlement(request(token, endpoint + "?oid=other"), lookup, env)).status).toBe(400);
    expect((await handleCommercialEntitlement(request(token, endpoint, '{"oid":"other"}'), lookup, env)).status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();

    const response = await handleCommercialEntitlement(request(token), lookup, env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(lookup).toHaveBeenCalledOnce();
  });

  it("mantém o endpoint desligado em Production, no modo local e sem configuração", async () => {
    const token = await signAssertion();
    const lookup = vi.fn();
    for (const settings of [
      { ...env, VERCEL_ENV: "production" },
      { ...env, PORTAL_AUTH_MODE: undefined },
      { ...env, CENTRAL_BI_ENTITLEMENT_URL: undefined },
    ]) {
      expect((await handleCommercialEntitlement(request(token), lookup, settings)).status).toBe(404);
    }
    expect((await handleCommercialEntitlement(request(token), lookup,
      { ...env, CENTRAL_BI_ASSERTION_PUBLIC_KEY: undefined },
    )).status).toBe(503);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("isolamento de concessões entre serviços", () => {
  it.each([
    ["RETENTION", "retention", "biosaude-retention", "retencao-faturamento", handleRetentionEntitlement],
    ["GLOBAL_LIMIT", "global-limit", "biosaude-global-limit", "limite-global-cliente", handleGlobalLimitEntitlement],
  ] as const)("valida apenas o escopo de %s", async (prefix, path, issuer, slug, handle) => {
    const newKeys = generateKeyPairSync("ed25519");
    const audience = new URL("/api/internal/" + path + "-entitlement", endpoint).href;
    const config = { ...env,
      [prefix + "_CENTRAL_BI_ENTITLEMENT_URL"]: audience,
      [prefix + "_CENTRAL_BI_ASSERTION_KEY_ID"]: "another-kid",
      [prefix + "_CENTRAL_BI_ASSERTION_PUBLIC_KEY"]: newKeys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    };
    const claims = { aud: audience, iss: issuer, sub: issuer, dashboard: slug };
    const lookup = vi.fn().mockResolvedValue({ accepted: true, allowed: true });
    const invalid = [
      await signAssertion(claims, keys.privateKey, "another-kid"),
      await signAssertion({ ...claims, dashboard: "painel-comercial-r1" }, newKeys.privateKey, "another-kid"),
      await signAssertion({ ...claims, iss: service }, newKeys.privateKey, "another-kid"),
    ];
    for (const token of invalid) expect((await handle(request(token, audience), lookup, config)).status).toBe(401);
    expect(lookup).not.toHaveBeenCalled();
    const valid = await signAssertion(claims, newKeys.privateKey, "another-kid");
    expect((await handle(request(valid, audience), lookup, config)).status).toBe(200);
    expect(lookup).toHaveBeenCalledWith(expect.objectContaining({ tenantId, objectId: firstObjectId }), slug);
  });
});
