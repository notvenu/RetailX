import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// every run gets its own empty database, so tests never touch real data
const db = path.join(os.tmpdir(), `retailx-e2e-${Date.now()}.db`);

export default defineConfig({
  testDir: "tests",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } },
  webServer: {
    command: "npx next build && npx next start -p 3100",
    url: "http://localhost:3100",
    timeout: 240_000,
    reuseExistingServer: false,
    env: { RETAILX_DB: db, AUTH_TRUST_HOST: "true", ANTHROPIC_API_KEY: "", AI_API_KEY: "",RESEND_API_KEY: "", CRON_SECRET: "e2e-secret" },
  },
});
