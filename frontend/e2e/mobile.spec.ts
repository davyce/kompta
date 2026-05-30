import { test, expect } from "@playwright/test";

/**
 * Tests mobile (viewport iPhone-like sur Chromium — pas besoin de WebKit installé).
 * Vérifie l'absence de chevauchements et la cohérence du layout sur petit viewport.
 */
test.use({
  viewport: { width: 390, height: 844 },          // iPhone 14 / 15 dimensions
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  hasTouch: true,
  isMobile: true,
});

async function loginAs(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/");
  const pwd = page.locator('input[type="password"]').first();
  await page.locator('input[type="text"], input:not([type])').first().fill(email);
  await pwd.fill(password);
  await page.getByRole("button", { name: /entrer dans kompta/i }).click();
}

test("mobile : bottom-nav visible et FAB Limule ne la cache pas", async ({ page }) => {
  await loginAs(page, "admin@kompta.local", "kompta123");
  await expect(page).not.toHaveURL(/login/i, { timeout: 10_000 });

  // La bottom-nav doit être visible sur la page d'accueil
  const nav = page.locator("nav.fixed.bottom-0").first();
  await expect(nav).toBeVisible();

  // Le bouton Copilot/FAB ne doit pas chevaucher la nav (sa position bottom doit être >= 80px)
  const fabBox = await page.locator('[class*="z-30"]').first().boundingBox().catch(() => null);
  const navBox = await nav.boundingBox();
  if (fabBox && navBox) {
    // Le FAB doit être au-dessus de la nav (sa base finit avant le haut de la nav)
    expect(fabBox.y + fabBox.height).toBeLessThanOrEqual(navBox.y + 5);
  }
});

test("mobile : super-admin → AdminShell rendu avec hamburger menu", async ({ page }) => {
  await loginAs(page, "superadmin@kompta.io", "super2026");
  await expect(page).toHaveURL(/\/admin/, { timeout: 12_000 });

  // Le hamburger menu doit être visible sur mobile
  const hamburger = page.getByRole("button", { name: /ouvrir le menu/i });
  await expect(hamburger).toBeVisible();

  // Le contenu principal doit être lisible (pas masqué par la sidebar)
  const main = page.locator("main").first();
  await expect(main).toBeVisible();
});

test("mobile : navigation Groupes ne casse pas le layout (pas de scroll horizontal)", async ({ page }) => {
  await loginAs(page, "admin@kompta.local", "kompta123");
  // Attendre la fin du login avant de naviguer
  await page.waitForURL((u) => !/login/i.test(u.toString()), { timeout: 12_000 });
  await page.goto("/groups");
  // Attendre que React monte la page
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});

  // Pas de débordement horizontal (le vrai indicateur d'un layout mobile correct)
  const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(scrollX).toBeLessThanOrEqual(5);   // tolérance 5px
});
