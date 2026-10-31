import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "speech-playback.spec.ts", fullyParallel: true,
  outputDir: "../output/tts-browser-tests",
  reporter: "list", use: { trace: "retain-on-failure" },
  projects: [
    { name: "speech-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "speech-mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "speech-webkit", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
});
