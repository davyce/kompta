import { test, expect, Page } from "@playwright/test";

/**
 * Smoke E2E — vérifie que l'app se charge sans erreur, que le login fonctionne
 * et qu'il n'y a pas d'écran blanc ni d'erreur console critique.
 *
 * Identifiants : compte démo seedé (SEED_DEMO=true) → admin@kompta.local / kompta123.
 * La base est éphémère (CI) : aucun impact sur des données réelles.
 */

const DEMO_EMAIL = "admin@kompta.local";
const DEMO_PASSWORD = "kompta123";

/** Collecte les erreurs console + exceptions JS d'une page. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/** Filtre le bruit non bloquant : favicon, ressources tierces, et surtout les
 * 401/403/404 de vérification de session (l'app teste l'auth au chargement → 401
 * attendu quand on n'est pas encore connecté). On ne garde que les vraies erreurs. */
function criticalErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !/favicon|manifest|service worker|ResizeObserver|net::ERR_/i.test(e) &&
      !/Failed to load resource/i.test(e) &&
      !/\b(401|403|404)\b/.test(e),
  );
}

test("la page de connexion se charge sans erreur", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/login");
  await expect(page).toHaveTitle(/KOMPTA/i);
  // Un champ de connexion est visible (app montée, pas d'écran blanc).
  // Bilingue : l'app peut s'afficher en FR ou EN selon la langue du navigateur.
  await expect(page.getByText(/Connexion|Sign in/i).first()).toBeVisible();
  expect(criticalErrors(errors), criticalErrors(errors).join("\n")).toEqual([]);
});

test("le login démo mène au tableau de bord", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/login");
  await page.getByLabel(/Email ou téléphone|Email or phone/i).fill(DEMO_EMAIL);
  await page.getByLabel(/Mot de passe|Password/i).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /Entrer dans KOMPTA|Enter KOMPTA/i }).click();

  // Après login, on quitte /login (URL change) et un contenu applicatif s'affiche.
  await expect(page).not.toHaveURL(/\/login\/?$/, { timeout: 15_000 });
  await expect(page.locator("body")).toBeVisible();
  expect(criticalErrors(errors), criticalErrors(errors).join("\n")).toEqual([]);
});

test("pas de débordement horizontal sur mobile (login)", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  // Tolérance 2px (arrondis sub-pixel).
  expect(overflow).toBeLessThanOrEqual(2);
});
