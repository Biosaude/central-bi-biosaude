import { defineConfig } from "@playwright/test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const db = join(mkdtempSync(join(tmpdir(), "biosaude-e2e-")), "portal.sqlite");
export default defineConfig({
  testDir: "tests/e2e",
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
  ],
});
