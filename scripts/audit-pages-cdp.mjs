import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(new URL("../frontend/package.json", import.meta.url));
const WebSocket = require("ws");

const FE = process.env.AUDIT_FE_URL || "http://127.0.0.1:3001";
const API = process.env.AUDIT_API_URL || "http://127.0.0.1:8010/api";
const CDP = process.env.AUDIT_CDP_URL || "http://127.0.0.1:9223";

const companyEmail = process.env.AUDIT_COMPANY_EMAIL;
const groupEmail = process.env.AUDIT_GROUP_EMAIL;
const auditPassword = process.env.AUDIT_PASSWORD;
const groupId = process.env.AUDIT_GROUP_ID;

if (!companyEmail || !groupEmail || !auditPassword || !groupId) {
  throw new Error("Missing AUDIT_COMPANY_EMAIL, AUDIT_GROUP_EMAIL, AUDIT_PASSWORD or AUDIT_GROUP_ID");
}

function parseEnv(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    values[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

async function loadSuperAdminCreds() {
  try {
    const env = parseEnv(await readFile(new URL("../backend/.env", import.meta.url), "utf8"));
    if (env.SUPER_ADMIN_EMAIL && env.SUPER_ADMIN_PASSWORD) {
      return { email: env.SUPER_ADMIN_EMAIL, password: env.SUPER_ADMIN_PASSWORD };
    }
  } catch {
    // Keep admin audit marked as skipped if .env is not readable.
  }
  return null;
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.ws.on("message", (raw) => this._onMessage(raw));
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
  }

  on(method, handler) {
    const list = this.handlers.get(method) || [];
    list.push(handler);
    this.handlers.set(method, list);
  }

  _onMessage(raw) {
    const msg = JSON.parse(raw.toString());
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message}: ${msg.error.data || ""}`));
      else resolve(msg.result);
      return;
    }
    if (msg.method && this.handlers.has(msg.method)) {
      for (const handler of this.handlers.get(msg.method)) handler(msg.params || {});
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 12_000);
    });
  }
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getPageWsUrl() {
  let targets = await fetch(`${CDP}/json/list`).then((r) => r.json());
  let page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  if (!page) {
    await fetch(`${CDP}/json/new?about:blank`);
    targets = await fetch(`${CDP}/json/list`).then((r) => r.json());
    page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  }
  if (!page) throw new Error("No Chrome page target available");
  return page.webSocketDebuggerUrl;
}

function jsString(value) {
  return JSON.stringify(value);
}

async function main() {
  const wsUrl = await getPageWsUrl();
  const client = new CDPClient(wsUrl);
  await client.ready();

  const events = {
    apiErrors: [],
    consoleErrors: [],
    exceptions: [],
  };

  client.on("Network.responseReceived", ({ response }) => {
    if (!response?.url) return;
    if (response.url.includes("/api") && response.status >= 400) {
      events.apiErrors.push({ url: response.url, status: response.status, statusText: response.statusText });
    }
  });
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    events.exceptions.push({
      text: exceptionDetails?.text,
      url: exceptionDetails?.url,
      lineNumber: exceptionDetails?.lineNumber,
    });
  });
  client.on("Runtime.consoleAPICalled", ({ type, args }) => {
    if (type !== "error") return;
    const text = (args || []).map((arg) => arg.value || arg.description || "").join(" ").trim();
    events.consoleErrors.push(text);
  });

  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Network.enable");
  await client.send("Log.enable").catch(() => {});

  const results = [];
  const screenshots = [];

  async function evaluate(expression) {
    const result = await client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
    }
    return result.result?.value;
  }

  async function navigate(route) {
    await client.send("Page.navigate", { url: `${FE}${route}` });
    await delay(600);
    for (let i = 0; i < 10; i += 1) {
      const ready = await evaluate(`(() => {
        const text = document.body?.innerText || "";
        const loading = ["Chargement du module KOMPTA en cours", "Restauration de la session", "Chargement des groupes KOMPTA", "Chargement du groupe"].some((needle) => text.includes(needle));
        return { enough: text.trim().length > 80, loading };
      })()`);
      if (ready.enough && !ready.loading) break;
      await delay(300);
    }
  }

  async function health(route, area) {
    const state = await evaluate(`(() => {
      const text = document.body?.innerText || "";
      const headings = Array.from(document.querySelectorAll("h1,h2"))
        .map((n) => (n.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 8);
      const loadingTexts = ["Chargement du module KOMPTA en cours", "Restauration de la session", "Chargement des groupes KOMPTA", "Chargement du groupe"];
      return {
        href: location.href,
        textLength: text.trim().length,
        sample: text.replace(/\\s+/g, " ").trim().slice(0, 260),
        headings,
        buttons: document.querySelectorAll("button").length,
        links: document.querySelectorAll("a").length,
        inputs: document.querySelectorAll("input,textarea,select").length,
        errorBoundary: text.includes("Une erreur s'est produite"),
        notFound: text.includes("Page introuvable") || text.includes("404"),
        loginText: text.includes("Connexion") && text.includes("Entrer dans KOMPTA"),
        stillLoading: loadingTexts.some((needle) => text.includes(needle)),
        overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        viewport: { width: innerWidth, height: innerHeight },
      };
    })()`);
    const issues = [];
    if (area !== "public" && state.href.includes("/login")) issues.push("redirected_to_login");
    if (area !== "public" && state.loginText && !route.includes("login")) issues.push("login_visible_on_protected_route");
    if (state.errorBoundary) issues.push("error_boundary");
    if (state.stillLoading) issues.push("still_loading_after_wait");
    if (state.textLength < 80) issues.push("thin_or_blank_render");
    if (state.overflowX > 8) issues.push(`horizontal_overflow_${state.overflowX}px`);
    const record = { area, route, ok: issues.length === 0, issues, ...state };
    results.push(record);
    return record;
  }

  async function auditRoute(route, area) {
    const beforeApiErrors = events.apiErrors.length;
    const beforeConsoleErrors = events.consoleErrors.length;
    const beforeExceptions = events.exceptions.length;
    await navigate(route);
    const record = await health(route, area);
    record.newApiErrors = events.apiErrors
      .slice(beforeApiErrors)
      .filter((error) => !(area === "public" && error.status === 401 && error.url.includes("/auth/refresh")));
    record.newConsoleErrors = events.consoleErrors.slice(beforeConsoleErrors);
    record.newExceptions = events.exceptions.slice(beforeExceptions);
    if (record.newApiErrors.length) record.issues.push("api_errors");
    if (record.newConsoleErrors.length || record.newExceptions.length) record.issues.push("browser_errors");
    record.ok = record.issues.length === 0;
    return record;
  }

  async function loginViaUi(email, password, label) {
    await navigate("/login");
    const clicked = await evaluate(`(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const emailInput = inputs[0];
      const passInput = inputs[1];
      const button = Array.from(document.querySelectorAll("button")).find((b) => (b.innerText || "").includes("Entrer dans KOMPTA"));
      const setValue = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      if (!emailInput || !passInput || !button) return { ok: false, inputs: inputs.length, hasButton: Boolean(button) };
      setValue(emailInput, ${jsString(email)});
      setValue(passInput, ${jsString(password)});
      button.click();
      return { ok: true, inputs: inputs.length, hasButton: true };
    })()`);
    await delay(1_800);
    const record = await health(`/login submit ${label}`, `${label}-login`);
    if (!clicked.ok || record.href.includes("/login") || record.loginText) {
      record.ok = false;
      record.issues.push("ui_login_failed");
    }
    return record;
  }

  async function loginByApi(email, password, label) {
    await navigate("/login");
    const login = await evaluate(`(async () => {
      const response = await fetch(${jsString(`${API}/auth/login`)}, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ${jsString(email)}, password: ${jsString(password)} }),
      });
      const text = await response.text();
      return { ok: response.ok, status: response.status, text };
    })()`);
    const record = await health(`/api login ${label}`, `${label}-api-login`);
    if (!login.ok) {
      record.ok = false;
      record.issues.push(`api_login_failed_${login.status}`);
      record.sample = login.text.slice(0, 260);
    }
    return record;
  }

  async function screenshot(name) {
    const dir = path.resolve("audit_artifacts");
    await mkdir(dir, { recursive: true });
    const shot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const file = path.join(dir, `${name}.png`);
    await writeFile(file, Buffer.from(shot.data, "base64"));
    screenshots.push(file);
  }

  async function setViewport(width, height, mobile = false) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
  }

  async function clearViewport() {
    await client.send("Emulation.clearDeviceMetricsOverride");
  }

  const enterpriseRoutes = [
    "/", "/workspace", "/company", "/employees", "/documents", "/payroll", "/billing", "/pos",
    "/inventory", "/inventory-pos", "/chat", "/work", "/calendar", "/notes", "/reports",
    "/reports-teras", "/assistants", "/declarations", "/settings", "/accounting", "/projects",
    "/meetings", "/help", "/safe-mode", "/clients", "/investments", "/budget", "/transactions",
    "/legislation", "/audit", "/analytics", "/fiscal",
  ];
  const adminRoutes = [
    "/admin", "/admin/companies", "/admin/users", "/admin/tickets", "/admin/limule", "/admin/logs",
    "/admin/analytics", "/admin/broadcast", "/admin/system", "/admin/onboarding", "/admin/subscriptions",
  ];
  const groupRoutes = [
    "/groups", `/groups/${groupId}`, `/groups/${groupId}/dashboard`, `/groups/${groupId}/members`,
    `/groups/${groupId}/contributions`, `/groups/${groupId}/transactions`, `/groups/${groupId}/expenses`,
    `/groups/${groupId}/calendar`, `/groups/${groupId}/meetings`, `/groups/${groupId}/birthdays`,
    `/groups/${groupId}/chat`, `/groups/${groupId}/documents`, `/groups/${groupId}/votes`,
    `/groups/${groupId}/leadership`, `/groups/${groupId}/ai-assistant`, `/groups/${groupId}/reports`,
    `/groups/${groupId}/settings`,
  ];

  await setViewport(1440, 1000, false);
  await auditRoute("/login", "public");
  await auditRoute("/register-group", "public");

  const enterpriseUiLogin = await loginViaUi(companyEmail, auditPassword, "enterprise-ui");
  if (!enterpriseUiLogin.ok) {
    await loginByApi(companyEmail, auditPassword, "enterprise");
  }
  for (const route of enterpriseRoutes) {
    await auditRoute(route, "enterprise");
    if (route === "/") await screenshot("kompta-enterprise-dashboard");
  }

  await setViewport(390, 844, true);
  for (const route of ["/pos", "/inventory", "/workspace"]) {
    await auditRoute(route, "enterprise-mobile");
    if (route === "/pos") await screenshot("kompta-mobile-pos");
  }
  await setViewport(1440, 1000, false);

  const adminCreds = await loadSuperAdminCreds();
  if (adminCreds) {
    const adminUiLogin = await loginViaUi(adminCreds.email, adminCreds.password, "admin-ui");
    if (!adminUiLogin.ok) {
      await loginByApi(adminCreds.email, adminCreds.password, "admin");
    }
    for (const route of adminRoutes) await auditRoute(route, "admin");
    await setViewport(390, 844, true);
    for (const route of ["/admin", "/admin/companies", "/admin/users", "/admin/tickets"]) {
      await auditRoute(route, "admin-mobile");
      if (route === "/admin/users") await screenshot("kompta-mobile-admin-users");
    }
    await setViewport(1440, 1000, false);
  } else {
    results.push({ area: "admin", route: "(all)", ok: false, issues: ["admin_credentials_unavailable"], sample: "" });
  }

  const groupsUiLogin = await loginViaUi(groupEmail, auditPassword, "groups-ui");
  if (!groupsUiLogin.ok) {
    await loginByApi(groupEmail, auditPassword, "groups");
  }
  for (const route of groupRoutes) await auditRoute(route, "groups");
  await setViewport(390, 844, true);
  for (const route of [`/groups/${groupId}/dashboard`, `/groups/${groupId}/members`, `/groups/${groupId}/settings`]) {
    await auditRoute(route, "groups-mobile");
    if (route.endsWith("/dashboard")) await screenshot("kompta-mobile-group-dashboard");
  }
  await clearViewport();

  const failures = results.filter((r) => !r.ok).map((r) => ({
    area: r.area,
    route: r.route,
    href: r.href,
    issues: r.issues,
    apiErrors: r.newApiErrors,
    consoleErrors: r.newConsoleErrors,
    exceptions: r.newExceptions,
    sample: r.sample,
    headings: r.headings,
  }));

  const payload = {
    checkedAt: new Date().toISOString(),
    totalRoutesChecked: results.length,
    okRoutes: results.filter((r) => r.ok).length,
    failedRoutes: failures.length,
    results,
    failures,
    apiErrorCount: events.apiErrors.length,
    apiErrors: events.apiErrors.slice(-30),
    consoleErrorCount: events.consoleErrors.length,
    consoleErrors: events.consoleErrors.slice(-20),
    exceptionCount: events.exceptions.length,
    exceptions: events.exceptions.slice(-20),
    screenshots,
  };
  const artifactDir = path.resolve("audit_artifacts");
  await mkdir(artifactDir, { recursive: true });
  const jsonPath = path.join(artifactDir, "kompta-page-audit.json");
  await writeFile(jsonPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({
    checkedAt: payload.checkedAt,
    totalRoutesChecked: payload.totalRoutesChecked,
    okRoutes: payload.okRoutes,
    failedRoutes: payload.failedRoutes,
    auditJson: jsonPath,
    failures: payload.failures.slice(0, 20),
    apiErrorCount: payload.apiErrorCount,
    consoleErrorCount: payload.consoleErrorCount,
    exceptionCount: payload.exceptionCount,
    screenshots,
  }, null, 2));
  client.ws.close();
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
});
