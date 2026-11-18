import * as oidc from "openid-client";

export type LoginAttempt = { state: string; nonce: string; codeVerifier: string };
type EntraSettings = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export const entraIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export function readEntraSettings(env = process.env): EntraSettings {
  return {
    tenantId: env.ENTRA_TENANT_ID ?? "",
    clientId: env.ENTRA_CLIENT_ID ?? "",
    clientSecret: env.ENTRA_CLIENT_SECRET ?? "",
    redirectUri: env.ENTRA_REDIRECT_URI ?? "",
  };
}

export type VerifiedEntraIdentity = {
  issuer: string;
  subject: string;
  tenantId: string;
  objectId: string;
};

export async function createEntraClient(
  settings = readEntraSettings(),
  fetcher?: oidc.CustomFetch,
) {
  if (
    !entraIdPattern.test(settings.tenantId) || !entraIdPattern.test(settings.clientId) ||
    !settings.clientSecret || !URL.canParse(settings.redirectUri)
  ) {
    throw new Error("Configuração do Microsoft Entra ID incompleta ou inválida.");
  }
  const redirect = new URL(settings.redirectUri);
  const localHttp = redirect.protocol === "http:" && redirect.hostname === "localhost";
  if (
    (redirect.protocol !== "https:" && !localHttp) ||
    redirect.search || redirect.hash || redirect.username || redirect.password
  ) {
    throw new Error("A URI de retorno do Entra ID deve usar HTTPS ou HTTP em localhost.");
  }
  const tenantId = settings.tenantId.toLowerCase();
  const config = await oidc.discovery(
    new URL(`https://login.microsoftonline.com/${tenantId}/v2.0`),
    settings.clientId,
    { id_token_signed_response_alg: "RS256" },
    oidc.ClientSecretPost(settings.clientSecret),
    { [oidc.customFetch]: fetcher, execute: [oidc.enableNonRepudiationChecks] },
  );

  return {
    async start() {
      const attempt: LoginAttempt = {
        state: oidc.randomState(),
        nonce: oidc.randomNonce(),
        codeVerifier: oidc.randomPKCECodeVerifier(),
      };
      const authorizationUrl = oidc.buildAuthorizationUrl(config, {
        redirect_uri: redirect.href,
        scope: "openid profile",
        state: attempt.state,
        nonce: attempt.nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(attempt.codeVerifier),
        code_challenge_method: "S256",
      });
      return { authorizationUrl, attempt };
    },

    // The caller must retrieve and consume the attempt from trusted session state.
    async finish(callback: URL, attempt: LoginAttempt): Promise<VerifiedEntraIdentity> {
      const target = new URL(callback);
      target.search = "";
      if (target.href !== redirect.href || !attempt.state || !attempt.nonce || !attempt.codeVerifier) {
        throw new Error("Retorno de autenticação do Entra ID inválido.");
      }
      const tokens = await oidc.authorizationCodeGrant(config, callback, {
        expectedState: attempt.state,
        expectedNonce: attempt.nonce,
        pkceCodeVerifier: attempt.codeVerifier,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (
        !claims || claims.tid !== tenantId ||
        typeof claims.sub !== "string" || !claims.sub ||
        typeof claims.oid !== "string" || !entraIdPattern.test(claims.oid)
      ) {
        throw new Error("Identidade do Entra ID inválida para o tenant configurado.");
      }
      return {
        issuer: claims.iss, subject: claims.sub, tenantId, objectId: claims.oid.toLowerCase(),
      };
    },
  };
}
