import { expect, Page, test } from "@playwright/test";

const COMPANY_EMAIL = "admin@kompta.local";
const COMPANY_PASSWORD = "kompta123";
const ADMIN_EMAIL = "superadmin@kompta.io";
const ADMIN_PASSWORD = "super2026";

const COMPANY_ROUTES = [
  "/", "/workspace", "/company", "/employees", "/documents", "/payroll",
  "/billing", "/pos", "/inventory", "/inventory-pos", "/purchases", "/chat", "/work",
  "/calendar", "/notes", "/reports", "/reports-teras", "/assistants",
  "/declarations", "/settings", "/accounting", "/projects", "/kanban",
  "/meetings", "/help", "/safe-mode", "/clients", "/crm", "/investments",
  "/budget", "/transactions", "/bank-reconciliation", "/legislation",
  "/audit", "/analytics", "/fiscal",
] as const;

const ADMIN_ROUTES = [
  "/admin", "/admin/companies", "/admin/subscriptions", "/admin/users",
  "/admin/tickets", "/admin/limule", "/admin/logs", "/admin/analytics",
  "/admin/broadcast", "/admin/system", "/admin/onboarding",
] as const;

const GROUP_SUFFIXES = [
  "", "/dashboard", "/members", "/contributions", "/transactions", "/expenses",
  "/calendar", "/meetings", "/birthdays", "/chat", "/documents", "/votes",
  "/leadership", "/ai-assistant", "/reports", "/settings",
] as const;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  const result = await page.evaluate(async ({ email, password }) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  }, { email, password });
  expect(result.ok, `${result.status}: ${result.body}`).toBeTruthy();
}

async function apiJson<T>(page: Page, path: string, options: RequestInit = {}): Promise<T> {
  return page.evaluate(async ({ path, options }) => {
    const response = await fetch(`/api${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    });
    if (!response.ok) throw new Error(`${response.status} ${path}: ${await response.text()}`);
    return response.json();
  }, { path, options });
}

async function auditRoute(page: Page, path: string) {
  const publicRoute = ["/login", "/register-group", "/privacy", "/terms", "/portal", "/portal/login"].includes(path);
  const problems: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const apiErrors: string[] = [];

  const onConsole = (message: import("@playwright/test").ConsoleMessage) => {
    if (message.type() !== "error") return;
    if (publicRoute && /401 \(Unauthorized\)/i.test(message.text())) return;
    if (path === "/settings" && /404 \(Not Found\)/i.test(message.text())) return;
    consoleErrors.push(message.text());
  };
  const onPageError = (error: Error) => pageErrors.push(error.message);
  const onResponse = (response: import("@playwright/test").Response) => {
    if (publicRoute && response.url().includes("/api/auth/refresh") && response.status() === 401) return;
    if (publicRoute && response.url().includes("/api/portal/me") && response.status() === 401) return;
    if (path === "/settings" && response.url().endsWith("/api/company/logo") && response.status() === 404) return;
    if (response.url().includes("/api/") && response.status() >= 400) {
      apiErrors.push(`${response.status()} ${response.url()}`);
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);
  try {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => {
      const text = document.body?.innerText.trim() ?? "";
      return {
        textLength: text.length,
        text,
        overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - window.innerWidth,
        href: location.href,
      };
    });
    if (state.textLength < 30) problems.push("page quasi vide");
    if (/Une erreur s'est produite|An error occurred|TypeError|ReferenceError/i.test(state.text)) problems.push("boundary ou erreur visible");
    if (state.overflow > 8) problems.push(`overflow horizontal ${state.overflow}px`);
    if (!publicRoute && /\/login\/?$/.test(new URL(state.href).pathname)) problems.push("session perdue");
    if (consoleErrors.length) problems.push(`console: ${consoleErrors.join(" | ")}`);
    if (pageErrors.length) problems.push(`page: ${pageErrors.join(" | ")}`);
    if (apiErrors.length) problems.push(`api: ${apiErrors.join(" | ")}`);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
  return { path, problems };
}

test.describe.serial("audit de déploiement de toutes les pages", () => {
  test("routes publiques desktop et mobile", async ({ page }) => {
    const failures: Array<{ path: string; problems: string[] }> = [];
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const route of ["/login", "/register-group", "/privacy", "/terms", "/portal", "/portal/login"]) {
        const result = await auditRoute(page, route);
        if (result.problems.length) failures.push(result);
      }
    }
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });

  test("routes entreprise et groupes desktop et mobile", async ({ page }) => {
    test.setTimeout(180_000);
    const failures: Array<{ path: string; problems: string[] }> = [];
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await login(page, COMPANY_EMAIL, COMPANY_PASSWORD);
      for (const route of COMPANY_ROUTES) {
        const result = await auditRoute(page, route);
        if (result.problems.length) failures.push(result);
      }
      const employees = await apiJson<Array<{ id: number }> | { items: Array<{ id: number }> }>(page, "/employees?per_page=1");
      const employeeItems = Array.isArray(employees) ? employees : employees.items;
      if (employeeItems.length) {
        const result = await auditRoute(page, `/employees/${employeeItems[0].id}`);
        if (result.problems.length) failures.push(result);
      }

      let groups = await apiJson<Array<{ id: number }>>(page, "/groups");
      if (!groups.length) {
        await apiJson(page, "/groups", {
          method: "POST",
          body: JSON.stringify({ name: "Groupe audit E2E", type: "association", city: "Brazzaville" }),
        });
        groups = await apiJson<Array<{ id: number }>>(page, "/groups");
      }
      expect(groups.length).toBeGreaterThan(0);
      for (const suffix of GROUP_SUFFIXES) {
        const result = await auditRoute(page, `/groups/${groups[0].id}${suffix}`);
        if (result.problems.length) failures.push(result);
      }
      const notFound = await auditRoute(page, "/route-404-audit");
      if (notFound.problems.length) failures.push(notFound);
    }
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });

  test("routes super-admin desktop et mobile", async ({ page }) => {
    test.setTimeout(90_000);
    const failures: Array<{ path: string; problems: string[] }> = [];
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      for (const route of ADMIN_ROUTES) {
        const result = await auditRoute(page, route);
        if (result.problems.length) failures.push(result);
      }
      const companies = await apiJson<Array<{ id: number }>>(page, "/admin/companies");
      if (companies.length) {
        const result = await auditRoute(page, `/admin/companies/${companies[0].id}`);
        if (result.problems.length) failures.push(result);
      }
      const tickets = await apiJson<Array<{ id: number }>>(page, "/admin/tickets");
      if (tickets.length) {
        const result = await auditRoute(page, `/admin/tickets/${tickets[0].id}`);
        if (result.problems.length) failures.push(result);
      }
    }
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });
});
