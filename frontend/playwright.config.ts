import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E — KOMPTA
 * Pré-requis : backend sur :8010 et frontend dev sur :3001 (ou BASE_URL).
 * En CI, on lance le frontend via webServer ci-dessous.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
