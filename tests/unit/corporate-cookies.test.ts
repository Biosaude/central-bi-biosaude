import { afterEach, expect, it, vi } from "vitest";
import { corporateSettings, isPortalOrigin } from "../../src/lib/corporate";

afterEach(() => vi.unstubAllEnvs());

it("protege os cookies em HTTPS e exige origem exata nas escritas", () => {
  vi.stubEnv("ENTRA_REDIRECT_URI", "https://homologacao.example.invalid/api/auth/callback");
  expect(corporateSettings()).toMatchObject({
    sessionCookie: "__Host-central-bi-session",
    attemptCookie: "__Host-central-bi-login",
    cookie: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
  });
  const destination = "https://homologacao.example.invalid/api/auth/logout";
  expect(isPortalOrigin(new Request(destination, { headers: { Origin: "https://homologacao.example.invalid" } }))).toBe(true);
  expect(isPortalOrigin(new Request(destination, { headers: { Origin: "https://other.example.invalid" } }))).toBe(false);
  expect(isPortalOrigin(new Request(destination))).toBe(false);
});

it("aceita HTTP apenas em localhost e exige o caminho fixo de callback", () => {
  vi.stubEnv("ENTRA_REDIRECT_URI", "http://localhost:3004/api/auth/callback");
  expect(corporateSettings()).toMatchObject({
    sessionCookie: "central-bi-local-session", cookie: { secure: false },
  });
  vi.stubEnv("ENTRA_REDIRECT_URI", "http://homologacao.example.invalid/api/auth/callback");
  expect(() => corporateSettings()).toThrow();
  vi.stubEnv("ENTRA_REDIRECT_URI", "https://homologacao.example.invalid/callback");
  expect(() => corporateSettings()).toThrow();
});
