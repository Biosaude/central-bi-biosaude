import { defineConfig } from "@playwright/test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clientId, tenantId } from "./tests/fixtures/corporate";
const corporateDb = process.env.PG_CORPORATE_E2E_DATABASE_URL;
const db = join(mkdtempSync(join(tmpdir(), "biosaude-e2e-")), "portal.sqlite");
export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: corporateDb ? undefined : "**/corporate.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    },
  },
  webServer: [
    {
      command: "npm run dev",
      url: "http://127.0.0.1:3000",
      env: { LOCAL_DEMO_ENABLED: "true", LOCAL_SQLITE_PATH: db, PORT: "3000" },
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: "npm run start -- --port 3002",
      url: "http://127.0.0.1:3002",
      env: { LOCAL_DEMO_ENABLED: "true", LOCAL_GATE_TOKEN: "b".repeat(64) },
      reuseExistingServer: false,
      timeout: 120000,
    },
    ...(corporateDb ? [{
      command: "npm run start -- --port 3004",
      url: "http://localhost:3004",
      env: {
        PORTAL_AUTH_MODE: "entra",
        DATABASE_URL: corporateDb,
        ENTRA_TENANT_ID: tenantId,
        ENTRA_CLIENT_ID: clientId,
        ENTRA_CLIENT_SECRET: "fixture-only",
        ENTRA_REDIRECT_URI: "http://localhost:3004/api/auth/callback",
      },
      reuseExistingServer: false,
      timeout: 120000,
    }] : []),
  ],
});
