import { test, expect, Page } from "@playwright/test";

/**
 * Parcours E2E critiques de KOMPTA.
 * Nécessite : backend :8010 (seed démo) + frontend :3001 actifs.
 * Le formulaire de login est pré-rempli avec admin@kompta.local / kompta123.
 */

async function ensureLoggedIn(page: Page) {
  await page.goto("/");
  const pwd = page.locator('input[type="password"]').first();
  // Si pas de champ mot de passe rapidement → déjà authentifié.
  const onLogin = await pwd.isVisible().catch(() => false);
  if (!onLogin) return;
  // Champs pré-remplis ; on garantit les valeurs puis on soumet.
  const email = page.locator('input[type="text"], input:not([type])').first();
  await email.fill("admin@kompta.local").catch(() => {});
  await pwd.fill("kompta123");
  await page.getByRole("button", { name: /entrer dans kompta/i }).click();
  await expect(pwd).toBeHidden({ timeout: 12_000 });
}

test("login mène à l'application (plus de champ mot de passe)", async ({ page }) => {
  await ensureLoggedIn(page);
  await expect(page.locator("body")).toContainText(/KOMPTA/i, { timeout: 10_000 });
});

test("la section Groupes & Orgs est accessible", async ({ page }) => {
  await ensureLoggedIn(page);
  await page.goto("/groups");
  await expect(page.locator("body")).toContainText(/groupe|organisation/i, { timeout: 10_000 });
});

test("accès sans session → formulaire de login", async ({ page, context }) => {
  await context.clearCookies();
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/employees");
  await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 10_000 });
});

test("super-admin login → redirige sur /admin", async ({ page }) => {
  await page.goto("/");
  const pwd = page.locator('input[type="password"]').first();
  // Si déjà connecté en non-super-admin, on déconnecte d'abord
  if (!(await pwd.isVisible().catch(() => false))) {
    await page.evaluate(() => window.localStorage.clear());
    await page.goto("/");
  }
  await page.locator('input[type="text"], input:not([type])').first().fill("superadmin@kompta.io");
  await pwd.fill("super2026");
  await page.getByRole("button", { name: /entrer dans kompta/i }).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 12_000 });
  // Doit afficher l'interface admin (mot "SUPER ADMIN" présent dans le sidebar)
  await expect(page.locator("body")).toContainText(/super admin/i, { timeout: 5_000 });
});

test("URL inconnue → page 404", async ({ page }) => {
  await ensureLoggedIn(page);
  await page.goto("/cette-route-nexiste-pas-xyz");
  await expect(page.locator("body")).toContainText(/404|introuvable|not found|n'existe/i, { timeout: 10_000 });
});
