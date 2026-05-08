import type {
  Channel,
  Company,
  CompanyDocument,
  AIRouterDecision,
  ChatChannelDetail,
  DeclarationRecord,
  Employee,
  EmployeePayrollOverride,
  EmployeeProvisioningResult,
  EmployabilityCheck,
  InventoryMovement,
  Invoice,
  Message,
  PaymentAccount,
  Payslip,
  PayrollRun,
  Product,
  SaleRecord,
  Task,
  TerasAlert,
  TerasAnalysisJob,
  TerasRecommendation,
  TerasScoreSnapshot,
  User
} from "../types/domain";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8010/api";
const TOKEN_KEY = "kompta_access_token";

export type LoginResponse = {
  access_token: string;
  token_type: string;
  user: User;
  must_change_password: boolean;
};

export type CompanyRegistrationPayload = {
  company_name: string;
  legal_name: string;
  industry: string;
  organization_type: string;
  country: string;
  admin_full_name: string;
  admin_email: string;
  admin_phone: string;
  password: string;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// 401 auto-logout callback — set by AuthContext so api.ts can trigger logout outside React
let _onUnauthorized: (() => void) | null = null;
export function setUnauthorizedCallback(cb: () => void) { _onUnauthorized = cb; }

type ApiRequestOptions = RequestInit & {
  skipUnauthorizedLogout?: boolean;
};

function formatApiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== "object") return String(item);
        const record = item as { msg?: unknown; loc?: unknown };
        const msg = typeof record.msg === "string" ? record.msg : "";
        const loc = Array.isArray(record.loc) ? record.loc.filter((part) => part !== "body").join(".") : "";
        return [loc, msg].filter(Boolean).join(" : ");
      })
      .filter(Boolean);
    return messages.length ? messages.join(" · ") : fallback;
  }
  return fallback;
}

async function readApiError(response: Response): Promise<string> {
  const fallback = response.statusText || `HTTP ${response.status}`;
  const text = await response.text();
  if (!text) return fallback;
  try {
    return formatApiError(JSON.parse(text), fallback);
  } catch {
    return text;
  }
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { skipUnauthorizedLogout = false, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  const isFormData = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  // Ne pas forcer JSON si le body est un FormData (multipart géré par le navigateur).
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...fetchOptions, headers });
  } catch {
    throw new ApiError(
      0,
      `API indisponible sur ${API_URL}. Lance le backend sur le port 8010 avant de te connecter.`
    );
  }
  if (!response.ok) {
    const message = await readApiError(response);
    const isSessionProbe = path === "/auth/me" || path === "/auth/refresh";
    if (response.status === 401 && !skipUnauthorizedLogout && isSessionProbe) {
      _onUnauthorized?.();
    }
    throw new ApiError(response.status, message);
  }
  return readJsonResponse<T>(response);
}

async function requestBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    throw new ApiError(response.status, await readApiError(response));
  }
  return response.blob();
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  firstLoginChangePassword: (payload: { current_password: string; new_password: string }) =>
    request<User>("/auth/first-login-change-password", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  registerCompany: (payload: CompanyRegistrationPayload) =>
    request<LoginResponse>("/auth/register-company", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  me: () => request<User>("/auth/me"),
  company: () => request<Company>("/company/profile"),
  updateCompany: (payload: Partial<Company>) =>
    request<Company>("/company/profile", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  resetWorkspace: () => request<{ status: string; message: string }>("/workspace/reset", { method: "POST" }),
  paymentAccounts: () => request<PaymentAccount[]>("/payment-accounts"),
  createPaymentAccount: (payload: Partial<PaymentAccount>) =>
    request<PaymentAccount>("/payment-accounts", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updatePaymentAccount: (id: number, payload: Partial<PaymentAccount>) =>
    request<PaymentAccount>(`/payment-accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deletePaymentAccount: (id: number) =>
    request<void>(`/payment-accounts/${id}`, { method: "DELETE" }),
  onboarding: () =>
    request<{ completion_score: number; steps: Array<{ key: string; label: string; done: boolean }> }>("/onboarding"),
  overview: (branch?: string) =>
    request<{
      company: string;
      branch: string | null;
      branches: string[];
      kpis: Record<string, number>;
      low_stock: Array<{ id: number; name: string; stock_quantity: number }>;
      compliance: { checks: Array<{ label: string; status: string }> };
    }>(branch ? `/reports/overview?branch=${encodeURIComponent(branch)}` : "/reports/overview"),
  employees: () => request<Employee[]>("/employees"),
  myEmployeePayout: () => request<Employee>("/employees/me/payout"),
  updateMyEmployeePayout: (payload: {
    payout_method: string;
    payout_phone?: string;
    payout_bank_name?: string;
    payout_account_number?: string;
    payout_paypal_email?: string;
    confirm?: boolean;
  }) =>
    request<Employee>("/employees/me/payout", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  createEmployee: (payload: Partial<Employee>) =>
    request<Employee>("/employees", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  quickCreateEmployee: (payload: {
    first_name: string;
    last_name: string;
    job_title: string;
    phone: string;
    email: string;
    employment_type: string;
    department: string;
    branch: string;
    salary: number;
    access_role: string;
    payout_method?: string;
    payout_phone?: string;
    payout_bank_name?: string;
    payout_account_number?: string;
    payout_paypal_email?: string;
  }) =>
    request<EmployeeProvisioningResult>("/employees/quick-create", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  resetEmployeeAccess: (employeeId: number) =>
    request<EmployeeProvisioningResult>(`/employees/${employeeId}/reset-access`, {
      method: "POST"
    }),
  updateEmployeeAccountStatus: (employeeId: number, account_status: string) =>
    request<Employee>(`/employees/${employeeId}/account-status`, {
      method: "PATCH",
      body: JSON.stringify({ account_status })
    }),
  downloadEmployeeContract: (employeeId: number) => requestBlob(`/employees/${employeeId}/contract`),
  documents: () => request<CompanyDocument[]>("/documents"),
  uploadDocument: (payload: { title: string; file: File; employee_id?: number }) => {
    const form = new FormData();
    form.append("title", payload.title);
    if (payload.employee_id) {
      form.append("employee_id", String(payload.employee_id));
    }
    form.append("file", payload.file);
    const token = getToken();
    const headers = new Headers();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return request<CompanyDocument>("/documents/upload", { method: "POST", headers, body: form });
  },
  analyzeDocument: (documentId: number) =>
    request<CompanyDocument>(`/documents/${documentId}/analyze`, {
      method: "POST"
    }),
  downloadDocument: (documentId: number) => requestBlob(`/documents/${documentId}/download`),
  submitEmployability: (employee_id: number) =>
    request<EmployabilityCheck>("/teras/employability", {
      method: "POST",
      body: JSON.stringify({ employee_id, include_documents: true })
    }),
  employabilityChecks: () => request<EmployabilityCheck[]>("/teras/employability"),
  terasScores: () => request<TerasScoreSnapshot[]>("/teras/scores"),
  terasRecommendations: () => request<TerasRecommendation[]>("/teras/recommendations"),
  analyzeTerasCompany: () =>
    request<TerasAnalysisJob>("/teras/analyze/company", {
      method: "POST"
    }),
  analyzeTerasRh: () =>
    request<TerasAnalysisJob>("/teras/analyze/rh", {
      method: "POST"
    }),
  analyzeTerasPayroll: () =>
    request<TerasAnalysisJob>("/teras/analyze/payroll", {
      method: "POST"
    }),
  analyzeTerasDeclaration: () =>
    request<TerasAnalysisJob>("/teras/analyze/declaration", {
      method: "POST"
    }),
  analyzeTerasDocuments: () =>
    request<TerasAnalysisJob>("/teras/analyze/documents", {
      method: "POST"
    }),
  analyzeTerasDocument: (documentId: number) =>
    request<TerasAnalysisJob>(`/teras/analyze/document/${documentId}`, {
      method: "POST"
    }),
  routeAi: (payload: { prompt: string; context_domain: string }) =>
    request<AIRouterDecision>("/ai/router", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  products: () => request<Product[]>("/products"),
  createProduct: (payload: Partial<Product>) =>
    request<Product>("/products", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  qrLabel: (id: number) =>
    request<{ product: Product; label: Record<string, string | number> }>(`/products/${id}/qr-label`, {
      method: "POST"
    }),
  createSale: (payload: { payment_method: string; payment_account_id?: number | null; items: Array<{ product_id: number; quantity: number }> }) =>
    request<{ receipt_number: string; total_amount: number; payment_method: string; payment_account_label?: string; items: Array<{ product_id: number; name: string; quantity: number; total: number }> }>(
      "/pos/sales",
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    ),
  posSales: (limit = 50) => request<SaleRecord[]>(`/pos/sales?limit=${limit}`),
  inventoryMovements: () => request<InventoryMovement[]>("/inventory/movements"),
  invoices: () => request<Invoice[]>("/invoices"),
  createInvoice: (payload: {
    customer_name: string;
    status: string;
    lines: Array<{ description: string; quantity: number; unit_price: number }>;
  }) =>
    request<Invoice>("/invoices", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateInvoice: (id: number, payload: Partial<Invoice>) =>
    request<Invoice>(`/invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  payInvoice: (id: number, payload: { payment_method: string; payment_account_id?: number | null }) =>
    request<Invoice>(`/invoices/${id}/pay`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  tasks: () => request<Task[]>("/tasks"),
  createTask: (payload: Partial<Task>) =>
    request<Task>("/tasks", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateTask: (id: number, payload: Partial<Task>) =>
    request<Task>(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteTask: (id: number) =>
    request<{ status: string; task: Partial<Task> }>(`/tasks/${id}`, {
      method: "DELETE"
    }),
  uploadTaskProof: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Task>(`/tasks/${id}/proof`, { method: "POST", body: form });
  },
  updateProduct: (id: number, payload: Partial<Product>) =>
    request<Product>(`/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteProduct: (id: number) =>
    request<void>(`/products/${id}`, { method: "DELETE" }),
  importProductsCsv: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const token = getToken();
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return request<{ imported: number; errors: string[] }>("/products/import-csv", { method: "POST", headers, body: form });
  },
  importEmployeesCsv: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const token = getToken();
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return request<{ imported: number; errors: string[] }>("/employees/import-csv", { method: "POST", headers, body: form });
  },
  refreshToken: () => request<{ access_token: string; token_type: string; user: User; must_change_password: boolean }>("/auth/refresh", { method: "POST" }),
  createMovement: (payload: { product_id: number; movement_type: "in" | "out"; quantity: number; reason?: string; reference?: string }) =>
    request<{ id: number; product_id: number; movement_type: string; quantity: number; reason: string; reference: string; created_at: string; new_stock: number }>(
      "/inventory/movements", { method: "POST", body: JSON.stringify(payload) }
    ),
  scanProductQr: (qr: string) => request<Product>(`/products/scan/${encodeURIComponent(qr)}`),
  uploadProductImages: (productId: number, files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    const token = getToken();
    const headers = new Headers();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return request<Product>(`/products/${productId}/images`, { method: "POST", headers, body: form });
  },
  channels: () => request<Channel[]>("/chat/channels"),
  createChannel: (payload: { name: string; topic?: string }) =>
    request<Channel>("/chat/channels", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  channelDetail: (channelId: number) => request<ChatChannelDetail>(`/chat/channels/${channelId}/detail`),
  messages: (channelId: number) => request<Message[]>(`/chat/channels/${channelId}/messages`),
  sendMessage: (channelId: number, body: string) =>
    request<Message>(`/chat/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body })
    }),
  payrollRuns: () => request<PayrollRun[]>("/payroll/runs"),
  createPayrollRun: (payload: { period: string; payment_account_id?: number | null; overrides?: EmployeePayrollOverride[] }) =>
    request<PayrollRun>("/payroll/runs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updatePayrollRunStatus: (id: number, status: string) =>
    request<PayrollRun>(`/payroll/runs/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  updatePayslip: (id: number, payload: Partial<{
    gross_pay: number; deductions: number; net_pay: number;
    payout_status: string; payout_destination: string; payout_method: string;
    bonus: number; overtime_pay: number; absence_deduction: number;
  }>) =>
    request<Payslip>(`/payroll/payslips/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  exportInvoice: (id: number, format: "html" | "pdf" = "html") => requestBlob(`/invoices/${id}/export?format=${format}`),
  exportPayrollRun: (id: number, format: "html" | "pdf" = "html") => requestBlob(`/payroll/runs/${id}/export?format=${format}`),
  terasAlerts: () => request<TerasAlert[]>("/teras/alerts"),
  createTaskFromTeras: (id: number) =>
    request<Task>(`/teras/alerts/${id}/create-task`, {
      method: "POST"
    }),
  writing: (payload: { content_type: string; tone: string; audience: string; notes: string }) =>
    request<{ draft: string; confidence: number; sources: string[] }>("/assistants/writing", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  declaration: (payload: { period: string; declaration_type: string }) =>
    request<{ case: string; status: string; confidence: number; missing_documents: string[]; checklist: string[] }>(
      "/assistants/declarations",
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    ),
  declarations: () => request<DeclarationRecord[]>("/declarations"),
  prepareDeclaration: (payload: { period: string; declaration_type: string }) =>
    request<DeclarationRecord>("/declarations/prepare", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  generateDeclaration: (payload: { period: string; declaration_type: string }) =>
    request<DeclarationRecord>("/declarations/generate", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  downloadDeclarationPdf: (id: number) =>
    requestBlob(`/declarations/${id}/pdf`),

  /* ── Super-Admin (cross-tenant) ── */
  adminOverview: () =>
    request<{
      companies: number;
      users: number;
      employees: number;
      invoices: number;
      tickets_open: number;
      tickets_critical: number;
      alerts_open: number;
      sales_total: number;
    }>("/admin/overview"),
  adminCompanies: () =>
    request<Array<{
      id: number; name: string; legal_name: string; industry: string; country: string;
      completion_score: number; teras_score: number; users_count: number;
      employees_count: number; created_at: string | null;
    }>>("/admin/companies"),
  adminCompanyDetail: (id: number) =>
    request<{
      company: { id: number; name: string; legal_name: string; industry: string; country: string; completion_score: number; teras_score: number };
      users: Array<{ id: number; email: string; full_name: string; role: string; account_status: string }>;
      stats: { invoices: number; sales_total: number; users_count: number };
      alerts: Array<{ id: number; title: string; severity: string; status: string; module: string }>;
    }>(`/admin/companies/${id}`),
  adminUsers: (params: { company_id?: number; search?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.company_id) qs.set("company_id", String(params.company_id));
    if (params.search) qs.set("search", params.search);
    const q = qs.toString();
    return request<Array<{
      id: number; email: string; full_name: string; role: string;
      department: string; branch: string; account_status: string;
      company_id: number; company_name: string;
      last_login_at: string | null; created_at: string | null;
    }>>(`/admin/users${q ? `?${q}` : ""}`);
  },
  adminUpdateUserStatus: (userId: number, account_status: string) =>
    request<{ id: number; account_status: string }>(`/admin/users/${userId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ account_status })
    }),
  adminTickets: (params: { status?: string; priority?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.priority) qs.set("priority", params.priority);
    const q = qs.toString();
    return request<TicketDto[]>(`/admin/tickets${q ? `?${q}` : ""}`);
  },
  adminTicket: (id: number) => request<TicketDto>(`/admin/tickets/${id}`),
  adminUpdateTicket: (id: number, payload: { status?: string; priority?: string; category?: string; assignee_user_id?: number }) =>
    request<TicketDto>(`/admin/tickets/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminReplyTicket: (id: number, body: string) =>
    request<TicketDto>(`/admin/tickets/${id}/reply`, { method: "POST", body: JSON.stringify({ body }) }),
  adminAuditLogs: (limit = 100) =>
    request<Array<{
      id: number; actor_user_id: number | null; actor_name: string;
      target_user_id: number | null; target_name: string;
      action: string; details: string; company_id: number;
      created_at: string | null;
    }>>(`/admin/audit-logs?limit=${limit}`),
  adminLimuleInsights: () => request<AdminLimuleInsights>("/admin/limule/insights"),
  adminLimuleDataset: (params: { limit?: number; company_id?: number; module?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.company_id) qs.set("company_id", String(params.company_id));
    if (params.module) qs.set("module", params.module);
    const q = qs.toString();
    return request<LimuleTrainingRecord[]>(`/admin/limule/dataset${q ? `?${q}` : ""}`);
  },
  adminLimuleDatasetExport: (limit = 500) => requestBlob(`/admin/limule/dataset/export?limit=${limit}`),
  adminLimuleChat: (prompt: string) =>
    request<AdminLimuleChatResponse>("/admin/limule/chat", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }),

  /* ── User-side tickets (for tenants to open support tickets) ── */
  myTickets: () => request<TicketDto[]>("/tickets"),
  createTicket: (payload: { subject: string; body: string; priority?: string; category?: string }) =>
    request<TicketDto>("/tickets", { method: "POST", body: JSON.stringify(payload) }),

  /* ── Meetings (Lot A) ──────────────────────────────────────── */
  meetings: () => request<MeetingDto[]>("/meetings"),
  createMeeting: (payload: {
    title: string; start_at: string; end_at: string;
    tag?: string; tag_color?: string; location?: string; join_url?: string;
    agenda?: string; attendees?: string[];
  }) => request<MeetingDto>("/meetings", { method: "POST", body: JSON.stringify(payload) }),
  updateMeeting: (id: number, payload: Partial<MeetingDto>) =>
    request<MeetingDto>(`/meetings/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteMeeting: (id: number) =>
    request<void>(`/meetings/${id}`, { method: "DELETE" }),
  generateMeetingSummary: (id: number) =>
    request<MeetingDto>(`/meetings/${id}/generate-summary`, { method: "POST" }),

  /* ── AI Generations / Limule history ──────────────────────── */
  aiHistory: (limit = 50) => request<AIGenerationDto[]>(`/ai/history?limit=${limit}`),
  aiGenerate: (payload: { kind: string; title?: string; prompt: string; context?: string }) =>
    request<AIGenerationDto>("/ai/generate", { method: "POST", body: JSON.stringify(payload) }),
  aiDownload: (id: number) => requestBlob(`/ai/history/${id}/download`),
  aiContentPdf: (payload: { title: string; content: string; prompt?: string; kind?: string }) =>
    requestBlob("/ai/content/pdf", { method: "POST", body: JSON.stringify(payload) }),
  aiDelete: (id: number) =>
    request<void>(`/ai/history/${id}`, { method: "DELETE" }),

  /** Variables dynamiques Limule — catalogue + valeurs résolues depuis la DB */
  aiVariables: () =>
    request<{ catalogue: Record<string, string>; resolved: Record<string, string> }>("/ai/variables"),
  aiStatus: () =>
    request<{ provider: string; model: string; key_configured: boolean; user: string }>("/ai/status"),
  limuleContext: (params?: { page_path?: string; module?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page_path) qs.set("page_path", params.page_path);
    if (params?.module) qs.set("module", params.module);
    const q = qs.toString();
    return request<LimuleContextDto>(`/limule/context${q ? `?${q}` : ""}`);
  },
  limuleChat: (payload: {
    prompt: string;
    page_path?: string;
    module?: string;
    conversation_history?: Array<{ role: "user" | "assistant"; content: string }>;
  }) =>
    request<LimuleChatResponse>("/limule/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /**
   * Streaming SSE du chat Limule (multi-tour).
   * onChunk(partialText) : appelé à chaque token avec le texte cumulé.
   * onDone(fullText, meta) : appelé à la fin avec le texte complet et les métadonnées.
   */
  limuleChatStream: async (
    payload: {
      prompt: string;
      page_path?: string;
      conversation_history?: Array<{ role: "user" | "assistant"; content: string }>;
    },
    onChunk: (partial: string) => void,
    onDone: (final: string, meta: {
      interactionId: number | null;
      intent: string;
      module: string;
      sources: string[];
      signals: LimuleSignal[];
    }) => void,
    onError?: (err: Error) => void,
  ): Promise<void> => {
    const token = getToken();
    let text = "";
    let meta = { interactionId: null as number | null, intent: "question", module: "global", sources: [] as string[], signals: [] as LimuleSignal[] };
    try {
      const response = await fetch(`${API_URL}/limule/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new ApiError(response.status, `HTTP ${response.status}`);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") { onDone(text, meta); return; }
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            if (typeof parsed.delta === "string") { text += parsed.delta; onChunk(text); }
            if (parsed.done === true) {
              meta = {
                interactionId: typeof parsed.interaction_id === "number" ? parsed.interaction_id : null,
                intent: typeof parsed.intent === "string" ? parsed.intent : "question",
                module: typeof parsed.module === "string" ? parsed.module : "global",
                sources: Array.isArray(parsed.sources) ? parsed.sources as string[] : [],
                signals: Array.isArray(parsed.signals) ? parsed.signals as LimuleSignal[] : [],
              };
            }
            if (parsed.error) throw new Error(String(parsed.error));
          } catch (pe) { if (pe instanceof ApiError) throw pe; }
        }
      }
      onDone(text, meta);
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  },

  limuleChatHistory: (limit = 12) => request<LimuleChatHistoryItem[]>(`/limule/chat/history?limit=${limit}`),
  limuleFeedback: (interactionId: number, payload: { rating?: number; feedback?: string }) =>
    request<{ id: number; rating: number | null; feedback: string }>(
      `/limule/interactions/${interactionId}/feedback`,
      { method: "PATCH", body: JSON.stringify(payload) }
    ),
  limuleDeleteInteraction: (interactionId: number) =>
    request<void>(`/limule/interactions/${interactionId}`, { method: "DELETE" }),
  limuleClearHistory: () =>
    request<void>("/limule/chat/history", { method: "DELETE" }),

  /**
   * Génération Limule en streaming (SSE).
   * onChunk(partial) est appelé à chaque token reçu avec le texte cumulé.
   * onDone(final, id) est appelé à la fin avec le texte complet et l'ID persisté.
   * onError(err) est appelé en cas d'erreur.
   */
  aiGenerateStream: async (
    payload: { kind: string; title?: string; prompt: string; context?: string },
    onChunk: (partial: string) => void,
    onDone: (final: string, id: number | null) => void,
    onError?: (err: Error) => void,
  ): Promise<void> => {
    const token = getToken();
    let text = "";
    try {
      const response = await fetch(`${API_URL}/ai/generate/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new ApiError(response.status, `HTTP ${response.status}`);
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let genId: number | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            onDone(text, genId);
            return;
          }
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            if (typeof parsed.delta === "string") {
              text += parsed.delta;
              onChunk(text);
            }
            if (parsed.done === true) {
              genId = typeof parsed.id === "number" ? parsed.id : null;
            }
            if (parsed.error) {
              throw new Error(String(parsed.error));
            }
          } catch (parseErr) {
            if (parseErr instanceof ApiError) throw parseErr;
            // JSON parse errors for non-JSON lines → ignore
          }
        }
      }
      onDone(text, genId);
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  },

  /* ── Daily Notes ──────────────────────────────────────────── */
  notes: () => request<DailyNoteDto[]>("/notes"),
  createNote: (payload: { note_date: string; title?: string; body: string; pinned?: boolean }) =>
    request<DailyNoteDto>("/notes", { method: "POST", body: JSON.stringify(payload) }),
  updateNote: (id: number, payload: { title?: string; body?: string; pinned?: boolean }) =>
    request<DailyNoteDto>(`/notes/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteNote: (id: number) =>
    request<void>(`/notes/${id}`, { method: "DELETE" }),
  generateDailyNote: () => request<DailyNoteDto>("/notes/generate", { method: "POST" }),

  /* ── Company Modules ──────────────────────────────────────── */
  modules: () => request<CompanyModuleDto[]>("/company/modules"),
  toggleModule: (key: string, enabled: boolean) =>
    request<CompanyModuleDto>(`/company/modules/${key}`, {
      method: "PATCH", body: JSON.stringify({ enabled }),
    }),

  /* ── User Preferences ─────────────────────────────────────── */
  preferences: () => request<UserPreferenceDto>("/me/preferences", { skipUnauthorizedLogout: true }),
  updatePreferences: (payload: Partial<UserPreferenceDto>) =>
    request<UserPreferenceDto>("/me/preferences", {
      method: "PATCH", body: JSON.stringify(payload), skipUnauthorizedLogout: true,
    }),

  /* ── Accounting aggregates ────────────────────────────────── */
  cashflow: (period = "month") =>
    request<CashFlowDto[]>(`/accounting/cashflow?period=${period}`),
  expenses: () => request<ExpenseDto[]>("/accounting/expenses"),
  syscemac: () => request<SyscemacDto[]>("/accounting/syscemac-status"),

  /* ── Reports revenue series ───────────────────────────────── */
  revenueSeries: (period = "month") =>
    request<RevenueSeriesDto[]>(`/reports/revenue-series?period=${period}`),

  /* ── Password reset ───────────────────────────────────────── */
  requestPasswordReset: (identifier: string) =>
    request<{ message: string; reset_token?: string; expires_in_minutes?: number; note?: string }>(
      "/auth/request-reset",
      { method: "POST", body: JSON.stringify({ identifier }) }
    ),
  resetPassword: (token: string, new_password: string) =>
    request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    }),

  /* ── AI Health ────────────────────────────────────────────── */
  aiHealth: () =>
    request<{ status: string; provider: string; latency_ms: number | null; model?: string | null; models?: string[] }>(
      "/ai/health"
    ),

  /* ── Payslip PDF download ─────────────────────────────────── */
  downloadPayslip: (payslipId: number) =>
    requestBlob(`/payroll/payslips/${payslipId}/download`),

  /* ── TERAS PDF export ─────────────────────────────────────── */
  terasExportReport: () =>
    fetch(`${API_URL}/teras/export-report`, {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    }),

  /* ── Audit logs ───────────────────────────────────────────── */
  auditLogs: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    return request<AuditLogDto[]>(`/audit-logs?${qs.toString()}`);
  },

  /* ── Meeting agenda ───────────────────────────────────────── */
  updateMeetingAgenda: (meetingId: number, agenda: string) =>
    request<{ id: number; agenda: string; updated: boolean }>(
      `/meetings/${meetingId}/agenda`,
      { method: "PATCH", body: JSON.stringify({ agenda }) }
    ),

  /* ── POS CSV export ───────────────────────────────────────── */
  posExportCsv: (params?: { date_from?: string; date_to?: string; product_id?: number }) => {
    const qs = new URLSearchParams();
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    if (params?.product_id) qs.set("product_id", String(params.product_id));
    return fetch(`${API_URL}/pos/sales/export-csv?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    });
  },

  /* ── Inventory low stock ──────────────────────────────────── */
  lowStockProducts: () =>
    request<LowStockProductDto[]>("/inventory/low-stock"),

  /* ── Limule document intelligence ────────────────────────── */
  limuleAnalyzeDocument: (documentId: number) =>
    request<{
      id: number;
      title: string;
      document_type: string;
      ai_summary: string;
      ai_tags: string;
      confidence: number;
      text_length: number;
      parse_method: string;
      extracted: Record<string, unknown>;
    }>(`/limule/documents/${documentId}/analyze`, { method: "POST" }),

  limuleDocumentChat: (
    documentId: number,
    payload: { prompt: string; conversation_history?: Array<{ role: "user" | "assistant"; content: string }> },
  ) =>
    request<{
      interaction_id: number | null;
      response: string;
      document: { id: number; title: string; type: string; confidence: number; text_length: number };
      intent: string;
      module: string;
      sources: string[];
    }>(`/limule/documents/${documentId}/chat`, { method: "POST", body: JSON.stringify(payload) }),

  /* ── Investments ─────────────────────────────────────────── */
  investments: () => request<InvestmentDto[]>("/investments"),
  createInvestment: (payload: InvestmentCreateDto) =>
    request<InvestmentDto>("/investments", { method: "POST", body: JSON.stringify(payload) }),
  updateInvestment: (id: number, payload: Partial<InvestmentCreateDto>) =>
    request<InvestmentDto>(`/investments/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteInvestment: (id: number) =>
    request<void>(`/investments/${id}`, { method: "DELETE" }),
  searchTickers: (q: string) =>
    request<TickerSearchResult[]>(`/investments/search?q=${encodeURIComponent(q)}`),
  stockQuote: (ticker: string) =>
    request<StockQuoteDto>(`/investments/quote/${ticker}`),
  stockHistory: (ticker: string, period = "1y") =>
    request<StockHistoryPoint[]>(`/investments/history/${ticker}?period=${period}`),
  stockNews: (ticker: string) =>
    request<StockNewsItem[]>(`/investments/news/${ticker}`),
  stockNewsFr: (ticker: string) =>
    request<StockNewsItem[]>(`/investments/news-fr/${ticker}`),
  analyzeInvestment: (ticker: string, invId?: number) =>
    request<InvestmentAnalysisDto>(
      `/investments/analyze/${ticker}${invId ? `?inv_id=${invId}` : ""}`,
      { method: "POST" },
    ),
  analyzePortfolio: () =>
    request<{ analysis: string; generated_at: string; portfolio_snapshot: Record<string, number> }>(
      `/investments/analyze/portfolio`,
      { method: "POST" },
    ),
  downloadAnalysisPdf: (invId: number) =>
    fetch(`${API_URL}/investments/${invId}/analysis/pdf`, {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    }),

  /* ── Budget ──────────────────────────────────────────────── */
  budgetCategories: () => request<BudgetCategoryDto[]>("/budget/categories"),
  budgetSummary: (period?: string) =>
    request<BudgetSummaryDto[]>(`/budget/summary${period ? `?period=${period}` : ""}`),
  createBudgetCategory: (payload: BudgetCategoryCreateDto) =>
    request<BudgetCategoryDto>("/budget/categories", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateBudgetCategory: (id: number, payload: Partial<BudgetCategoryCreateDto>) =>
    request<BudgetCategoryDto>(`/budget/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteBudgetCategory: (id: number) =>
    request<void>(`/budget/categories/${id}`, { method: "DELETE" }),

  /* ── Clients / CRM ───────────────────────────────────────── */
  clients: (params?: { status?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.search) qs.set("search", params.search);
    const q = qs.toString();
    return request<ClientDto[]>(`/clients${q ? `?${q}` : ""}`);
  },
  clientStats: (id: number) => request<ClientStatsDto>(`/clients/${id}/stats`),
  createClient: (payload: Omit<ClientDto, "id" | "company_id" | "created_at" | "updated_at">) =>
    request<ClientDto>("/clients", { method: "POST", body: JSON.stringify(payload) }),
  updateClient: (id: number, payload: Partial<Omit<ClientDto, "id" | "company_id" | "created_at" | "updated_at">>) =>
    request<ClientDto>(`/clients/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteClient: (id: number) =>
    request<void>(`/clients/${id}`, { method: "DELETE" }),

  /* ── Transactions ─────────────────────────────────────────── */
  transactions: (params?: { category?: string; source_type?: string; date_from?: string; date_to?: string }) => {
    const q = new URLSearchParams();
    if (params?.category)    q.set("category",    params.category);
    if (params?.source_type) q.set("source_type", params.source_type);
    if (params?.date_from)   q.set("date_from",   params.date_from);
    if (params?.date_to)     q.set("date_to",     params.date_to);
    const qs = q.toString();
    return request<BankTransactionDto[]>(`/transactions${qs ? `?${qs}` : ""}`);
  },
  transactionStats: () => request<TransactionStatsDto>("/transactions/stats"),
  createTransaction: (payload: BankTransactionCreateDto) =>
    request<BankTransactionDto>("/transactions", { method: "POST", body: JSON.stringify(payload) }),
  updateTransaction: (id: number, payload: BankTransactionUpdateDto) =>
    request<BankTransactionDto>(`/transactions/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteTransaction: (id: number) =>
    request<void>(`/transactions/${id}`, { method: "DELETE" }),
  importTransactions: (file: File, sourceType?: string): Promise<TransactionImportResult> => {
    const form = new FormData();
    form.append("file", file);
    if (sourceType) form.append("source_type", sourceType);
    const token = getToken();
    return fetch(`${API_URL}/transactions/import`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(res.status, (err as { detail: string }).detail ?? res.statusText);
      }
      return res.json() as Promise<TransactionImportResult>;
    });
  },
  exportTransactionsCsv: () =>
    fetch(`${API_URL}/transactions/export`, {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    }),

  /* ── Safe Mode ────────────────────────────────────────────── */
  safeMode: {
    export: async (): Promise<void> => {
      const token = getToken() ?? "";
      const res = await fetch(`${API_URL}/safe-mode/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erreur lors de la génération du pack");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename=(.+)/);
      a.download = match ? match[1] : "kompta_safe_mode.pdf";
      a.href = url;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    },
    analyze: (file: File): Promise<{ status: string; preview?: SafeModePreview; snapshot?: object; message?: string }> => {
      const form = new FormData();
      form.append("file", file);
      return request("/safe-mode/analyze", { method: "POST", body: form });
    },
    restore: (snapshot: object, sections: string[]): Promise<{ status: string; restored: Record<string, number> }> =>
      request("/safe-mode/restore", { method: "POST", body: JSON.stringify({ snapshot, sections }) }),
  },

  limuleDocumentChatStream: async (
    documentId: number,
    payload: { prompt: string; conversation_history?: Array<{ role: "user" | "assistant"; content: string }> },
    onChunk: (partial: string) => void,
    onDone: (final: string, meta: { interactionId: number | null; intent: string; module: string; sources: string[]; signals: LimuleSignal[] }) => void,
    onError?: (err: Error) => void,
  ): Promise<void> => {
    const token = getToken();
    let text = "";
    let meta = { interactionId: null as number | null, intent: "question", module: "documents", sources: [] as string[], signals: [] as LimuleSignal[] };
    try {
      const response = await fetch(`${API_URL}/limule/documents/${documentId}/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new ApiError(response.status, `HTTP ${response.status}`);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") { onDone(text, meta); return; }
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            if (typeof parsed.delta === "string") { text += parsed.delta; onChunk(text); }
            if (parsed.done === true) {
              meta = {
                interactionId: typeof parsed.interaction_id === "number" ? parsed.interaction_id : null,
                intent: typeof parsed.intent === "string" ? parsed.intent : "question",
                module: typeof parsed.module === "string" ? parsed.module : "documents",
                sources: Array.isArray(parsed.sources) ? parsed.sources as string[] : [],
                signals: Array.isArray(parsed.signals) ? parsed.signals as LimuleSignal[] : [],
              };
            }
            if (parsed.error) throw new Error(String(parsed.error));
          } catch (pe) { if (pe instanceof ApiError) throw pe; }
        }
      }
      onDone(text, meta);
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  },
};

export type MeetingDto = {
  id: number;
  title: string;
  start_at: string;
  end_at: string;
  tag: string;
  tag_color: string;
  location: string;
  join_url: string;
  agenda: string;
  attendees: string[];
  ai_summary: string;
  ai_points: string[];
  teras_flags: string[];
  status: string;
  created_by_user_id: number | null;
  created_at: string;
};

export type AIGenerationDto = {
  id: number;
  kind: string;
  title: string;
  prompt: string;
  content: string;
  model: string;
  teras_used: boolean;
  user_id: number | null;
  created_at: string;
};

export type LimuleSignal = {
  type: string;
  severity: string;
  label: string;
  module: string;
};

export type LimuleContextDto = {
  module: string;
  page_path: string;
  summary: string;
  kpis: Record<string, number>;
  signals: LimuleSignal[];
  sources: string[];
  modules: Record<string, unknown>;
};

export type LimuleChatResponse = {
  interaction_id: number;
  answer: string;
  module: string;
  intent: string;
  sources: string[];
  signals: LimuleSignal[];
  training_tags: string[];
  context_summary: string;
  confidence: number;
};

export type LimuleChatHistoryItem = {
  id: number;
  prompt: string;
  response: string;
  module: string;
  intent: string;
  page_path: string;
  sources: string[];
  signals: LimuleSignal[];
  rating: number | null;
  created_at: string | null;
};

export type DailyNoteDto = {
  id: number;
  note_date: string;
  title: string;
  body: string;
  ai_generated: boolean;
  pinned: boolean;
  user_id: number | null;
  created_at: string;
  updated_at: string;
};

export type CompanyModuleDto = {
  id: number;
  module_key: string;
  enabled: boolean;
};

export type UserPreferenceDto = {
  notify_chat: boolean;
  notify_teras: boolean;
  notify_payroll: boolean;
  notify_email: boolean;
  digest_frequency: string;
  language: string;
  theme: string;
  currency: string;
};

export type CashFlowDto = { label: string; inflow: number; outflow: number };
export type ExpenseDto = { name: string; amount: number; color: string };
export type SyscemacDto = { code: string; label: string; status: string; count: number };
export type RevenueSeriesDto = { label: string; revenue: number; margin: number };

export type TicketDto = {
  id: number;
  subject: string;
  body: string;
  status: string;
  priority: string;
  category: string;
  company_id: number | null;
  company_name: string;
  requester_user_id: number | null;
  requester_name: string;
  assignee_user_id: number | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  messages: Array<{
    id: number;
    ticket_id: number;
    author_user_id: number;
    author_name: string;
    body: string;
    is_staff: boolean;
    created_at: string;
  }>;
};

export type AdminLimuleInsights = {
  total_interactions: number;
  last_7_days: number;
  rated: number;
  avg_rating: number;
  training_ready: number;
  by_module: Array<{ module: string; count: number }>;
  by_intent: Array<{ intent: string; count: number }>;
  recent: Array<{
    id: number;
    company: string;
    module: string;
    intent: string;
    prompt: string;
    tags: string[];
    created_at: string | null;
  }>;
};

export type AdminLimuleChatResponse = {
  interaction_id: number;
  answer: string;
  sources: string[];
  signals: LimuleSignal[];
  kpis: Record<string, number>;
};

export type LimuleTrainingRecord = {
  id: number;
  company: { id: number; name: string; industry: string; country: string };
  module: string;
  intent: string;
  input: string;
  output: string;
  context: Record<string, unknown>;
  sources: string[];
  signals: LimuleSignal[];
  tags: string[];
  rating: number | null;
  feedback: string;
  created_at: string | null;
  privacy_note: string;
};

export type AuditLogDto = {
  id: number;
  action: string;
  details: string;
  actor: string | null;
  employee: string | null;
  created_at: string;
};

export type LowStockProductDto = {
  id: number;
  name: string;
  sku: string;
  category: string;
  stock_quantity: number;
  reorder_level: number;
  deficit: number;
  price: number;
};

export type SafeModePreview = {
  company_name: string;
  exported_at: string;
  version: string;
  counts: Record<string, number>;
};

/* ── Investments ──────────────────────────────────────────────── */
export type InvestmentDto = {
  id: number;
  ticker: string;
  display_name: string;
  exchange: string;
  currency_stock: string;
  shares: number;
  invested_amount: number;
  purchase_price_ref: number;
  purchase_date: string | null;
  notes: string | null;
  last_analysis: string | null;
  last_analysis_at: string | null;
};

export type InvestmentCreateDto = Omit<InvestmentDto, "id" | "last_analysis" | "last_analysis_at">;

export type TickerSearchResult = {
  ticker: string;
  name: string;
  exchange: string;
  exchange_code?: string;
  type: string;
  currency?: string;
};

export type StockQuoteDto = {
  ticker: string;
  name: string;
  exchange: string;
  currency: string;
  price: number | null;
  prev_close: number | null;
  change: number;
  change_pct: number;
  market_cap: number | null;
  market_cap_fmt: string;
  pe_ratio: number | null;
  eps: number | null;
  dividend_yield: number | null;
  week52_high: number | null;
  week52_low: number | null;
  volume: number | null;
  avg_volume: number | null;
  open: number | null;
  day_high: number | null;
  day_low: number | null;
  beta: number | null;
  sector: string;
  industry: string;
  country: string;
  website: string;
  description: string;
};

export type StockHistoryPoint = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type StockNewsItem = {
  title: string;
  summary: string;
  provider: string;
  published: string;
  url: string;
};

export type InvestmentAnalysisDto = {
  ticker: string;
  name: string;
  analysis: string;
  generated_at: string;
  context_snapshot: {
    price: number | null;
    change_pct: number;
    market_cap: string;
    pe: number | null;
    sector: string;
    perf_1y: string;
  };
};

/* ── Clients / CRM ────────────────────────────────────────────── */
export type ClientDto = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  status: string;
  company_id: number;
  created_at: string;
  updated_at: string;
};

export type ClientStatsDto = {
  client_id: number;
  invoice_count: number;
  total_revenue: number;
  unpaid_count: number;
  last_invoice_date: string | null;
};

/* ── Budget ───────────────────────────────────────────────────── */
export type BudgetCategoryDto = {
  id: number;
  name: string;
  icon: string;
  color: string;
  planned_amount: number;
  period: string;
  category_type: string;
  company_id: number;
  created_at: string;
  updated_at: string;
};

export type BudgetCategoryCreateDto = {
  name: string;
  icon?: string;
  color?: string;
  planned_amount?: number;
  period?: string;
  category_type?: string;
};

export type BudgetSummaryDto = {
  id: number;
  name: string;
  icon: string;
  color: string;
  planned_amount: number;
  period: string;
  category_type: string;
  spent: number;
  remaining: number;
  progress_pct: number;
};

/* ── Transactions ──────────────────────────────────────────── */
export type BankTransactionDto = {
  id: number;
  company_id: number;
  document_id: number | null;
  date: string;
  label: string;
  amount: number;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  currency: string;
  category: string;
  sub_category: string | null;
  counterpart: string | null;
  reference: string | null;
  source_type: string;
  source_file: string | null;
  status: string;
  notes: string | null;
  raw_line: string | null;
  created_at: string;
  updated_at: string;
};

export type BankTransactionCreateDto = {
  date: string;
  label: string;
  amount?: number;
  debit?: number | null;
  credit?: number | null;
  balance?: number | null;
  currency?: string;
  category?: string;
  sub_category?: string | null;
  counterpart?: string | null;
  reference?: string | null;
  source_type?: string;
  source_file?: string | null;
  status?: string;
  notes?: string | null;
  raw_line?: string | null;
  document_id?: number | null;
};

export type BankTransactionUpdateDto = Partial<BankTransactionCreateDto>;

export type TransactionImportResult = {
  imported: number;
  source_file: string;
  source_type: string;
  parse_method: string;
  text_length: number;
  transactions: BankTransactionDto[];
};

export type TransactionStatsDto = {
  count: number;
  total_credits: number;
  total_debits: number;
  balance: number;
  by_category: Record<string, number>;
};
