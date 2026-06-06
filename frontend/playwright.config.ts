import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke E2E minimal — tourne UNIQUEMENT en CI contre une base éphémère jetable.
 * Objectif : attraper écrans blancs, erreurs console et routes cassées avant release.
 * Volontairement réduit (login + routes clés) pour rester rapide et non-flaky.
 */
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    actionTimeout: 10_000,
  },
  // Un seul moteur (Chromium) pour rester rapide et non-flaky en CI.
  // Le mobile réutilise Chromium avec un viewport iPhone (pas WebKit) → 1 seul navigateur à installer.
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
