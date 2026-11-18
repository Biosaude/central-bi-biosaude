import { createSign, generateKeyPairSync } from "node:crypto";
import type { CustomFetchOptions } from "openid-client";
import { describe, expect, it, vi } from "vitest";
import { createEntraClient } from "../../src/lib/entra";

const tenantId = "11111111-1111-1111-1111-111111111111";
const clientId = "22222222-2222-2222-2222-222222222222";
const objectId = "33333333-3333-3333-3333-333333333333";
const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
const authorizationEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
const keysEndpoint = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
const redirectUri = "http://localhost:3000/auth/callback";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const enc = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

async function setup() {
  let idToken: string;
  const fetcher = vi.fn(async (url: string, init: CustomFetchOptions) => {
    if (String(url).includes("/.well-known/openid-configuration")) {
      return Response.json({
        issuer,
        authorization_endpoint: authorizationEndpoint,
        token_endpoint: tokenEndpoint,
        jwks_uri: keysEndpoint,
        response_types_supported: ["code"],
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
      });
    }
    if (String(url) === keysEndpoint) {
      return Response.json({
        keys: [{ ...keys.publicKey.export({ format: "jwk" }), kid: "example", alg: "RS256" }],
      });
    }
    if (String(url) === tokenEndpoint) {
      expect(new URLSearchParams(String(init?.body)).get("grant_type")).toBe("authorization_code");
      return Response.json({ id_token: idToken, access_token: "fictional", token_type: "Bearer" });
    }
    throw new Error("URL inesperada durante o teste.");
  });
  const client = await createEntraClient({
    tenantId, clientId, clientSecret: "somente-para-teste", redirectUri,
  }, fetcher);
  const { authorizationUrl, attempt } = await client.start();
  const callback = new URL(redirectUri);
  callback.searchParams.set("code", "fictional-code");
  callback.searchParams.set("state", attempt.state);

  function sign(overrides = {}, validSignature = true) {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = [
      enc({ alg: "RS256", kid: "example" }),
      enc({
        iss: issuer, aud: clientId, sub: "fictional-subject", tid: tenantId, oid: objectId,
        nonce: attempt.nonce, iat: now, exp: now + 60, ...overrides,
      }),
    ].join(".");
    const signature = validSignature
      ? createSign("RSA-SHA256").update(unsigned).sign(keys.privateKey, "base64url")
      : Buffer.from("invalid").toString("base64url");
    idToken = `${unsigned}.${signature}`;
  }
  return { authorizationUrl, attempt, callback, client, sign, fetcher };
}

describe("Microsoft Entra ID", () => {
  it("usa PKCE S256 e retorna apenas a identidade verificada", async () => {
    const { authorizationUrl, attempt, callback, client, sign, fetcher } = await setup();
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(authorizationEndpoint);
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("code_challenge")).not.toBe(attempt.codeVerifier);
    expect(authorizationUrl.searchParams.get("state")).toBe(attempt.state);
    expect(authorizationUrl.searchParams.get("nonce")).toBe(attempt.nonce);
    sign();
    await expect(client.finish(callback, attempt)).resolves.toEqual({
      issuer, subject: "fictional-subject", tenantId, objectId,
    });
    const tokenRequest = fetcher.mock.calls.find(([url]) => String(url) === tokenEndpoint);
    expect(new URLSearchParams(String(tokenRequest?.[1]?.body)).get("code_verifier")).toBe(attempt.codeVerifier);
  });

  it("rejeita state incorreto antes de trocar o código", async () => {
    const { attempt, callback, client, fetcher } = await setup();
    callback.searchParams.set("state", "incorrect");
    await expect(client.finish(callback, attempt)).rejects.toThrow();
    expect(fetcher.mock.calls.some(([url]) => String(url) === tokenEndpoint)).toBe(false);
  });

  it.each([
    ["nonce", { nonce: "incorrect" }],
    ["tenant", { tid: "another-tenant" }],
    ["objeto", { oid: undefined }],
    ["issuer", { iss: "https://example.invalid" }],
    ["audience", { aud: "another-client" }],
    ["expiração", { exp: 1 }],
  ])("rejeita token com %s inválido", async (_field, claims) => {
    const { attempt, callback, client, sign } = await setup();
    sign(claims);
    await expect(client.finish(callback, attempt)).rejects.toThrow();
  });

  it("rejeita assinatura inválida mesmo com as claims esperadas", async () => {
    const { attempt, callback, client, sign } = await setup();
    sign({}, false);
    await expect(client.finish(callback, attempt)).rejects.toThrow();
  });
});
