import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3003",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "tablet", use: { ...devices["iPad (gen 7)"], browserName: "chromium" } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "mobile-320", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 320, height: 800 } } },
  ],
  webServer: [
    {
      command: "SOYLE_DB_PATH=/tmp/soyle-playwright.db SOYLE_SEED_DEMO_DATA=true SOYLE_ALLOW_UNREVIEWED_DEMO_CONTENT=true SOYLE_SECRET_KEY=soyle-playwright-secret-key-at-least-32-bytes SOYLE_ALLOWED_ORIGINS=http://localhost:3003 PYTHONPATH=. .venv/bin/python -m app.e2e_server",
      cwd: "../backend",
      url: "http://localhost:8011/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "SOYLE_E2E_BUILD=true npm run dev -- --hostname localhost --port 3003",
      url: "http://localhost:3003/app",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
