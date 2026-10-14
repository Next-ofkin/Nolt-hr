import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore:
    process.env.AUTH_LIVE_TESTS === "true" ? [] : ["**/*.live.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: process.env.AUTH_LIVE_TESTS === "true" ? 180000 : 60000,
  // Hosted Auth round trips are functional checks; performance targets are verified separately.
  expect: { timeout: process.env.AUTH_LIVE_TESTS === "true" ? 45000 : 5000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    channel: "chromium",
    trace: "retain-on-failure",
  },
  reporter: "list",
});
