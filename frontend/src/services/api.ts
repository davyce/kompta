import type {
  Channel,
  Company,
  CompanyDocument,
  AIRouterDecision,
  ChatChannelDetail,
  DeclarationRecord,
  Employee,
  EmployeeProvisioningResult,
  EmployabilityCheck,
  InventoryMovement,
  Invoice,
  Message,
  PaymentAccount,
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      0,
      `API indisponible sur ${API_URL}. Lance le backend sur le port 8010 avant de te connecter.`
    );
  }
  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = await response.json();
      message = payload.detail ?? message;
    } catch {
      // The fallback status text is enough for network and empty-body errors.
    }
    throw new ApiError(response.status, message);
  }
  return response.json() as Promise<T>;
}

async function requestBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
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
    fetch(`${API_URL}/payment-accounts/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    }).then(() => undefined),
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
    return fetch(`${API_URL}/documents/upload`, { method: "POST", headers, body: form }).then(async (response) => {
      if (!response.ok) {
        throw new ApiError(response.status, response.statusText);
      }
      return response.json() as Promise<CompanyDocument>;
    });
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
    request<{ receipt_number: string; total_amount: number; payment_account_label?: string; items: Array<{ name: string; quantity: number }> }>(
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
  updateProduct: (id: number, payload: Partial<Product>) =>
    request<Product>(`/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  scanProductQr: (qr: string) => request<Product>(`/products/scan/${encodeURIComponent(qr)}`),
  uploadProductImages: (productId: number, files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    const token = getToken();
    const headers = new Headers();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(`${API_URL}/products/${productId}/images`, { method: "POST", headers, body: form }).then(async (response) => {
      if (!response.ok) {
        throw new ApiError(response.status, response.statusText);
      }
      return response.json() as Promise<Product>;
    });
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
  createPayrollRun: (payload: string | { period: string; payment_account_id?: number | null }) =>
    request<PayrollRun>("/payroll/runs", {
      method: "POST",
      body: JSON.stringify(typeof payload === "string" ? { period: payload } : payload)
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
    fetch(`${API_URL}/meetings/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    }).then(() => undefined),
  generateMeetingSummary: (id: number) =>
    request<MeetingDto>(`/meetings/${id}/generate-summary`, { method: "POST" }),

  /* ── AI Generations / Limule history ──────────────────────── */
  aiHistory: (limit = 50) => request<AIGenerationDto[]>(`/ai/history?limit=${limit}`),
  aiGenerate: (payload: { kind: string; title?: string; prompt: string; context?: string }) =>
    request<AIGenerationDto>("/ai/generate", { method: "POST", body: JSON.stringify(payload) }),
  aiDownload: (id: number) => requestBlob(`/ai/history/${id}/download`),
  aiDelete: (id: number) =>
    fetch(`${API_URL}/ai/history/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    }).then(() => undefined),

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
  limuleChat: (payload: { prompt: string; page_path?: string; module?: string }) =>
    request<LimuleChatResponse>("/limule/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  limuleChatHistory: (limit = 12) => request<LimuleChatHistoryItem[]>(`/limule/chat/history?limit=${limit}`),
  limuleFeedback: (interactionId: number, payload: { rating?: number; feedback?: string }) =>
    request<{ id: number; rating: number | null; feedback: string }>(
      `/limule/interactions/${interactionId}/feedback`,
      { method: "PATCH", body: JSON.stringify(payload) }
    ),

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
    fetch(`${API_URL}/notes/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    }).then(() => undefined),
  generateDailyNote: () => request<DailyNoteDto>("/notes/generate", { method: "POST" }),

  /* ── Company Modules ──────────────────────────────────────── */
  modules: () => request<CompanyModuleDto[]>("/company/modules"),
  toggleModule: (key: string, enabled: boolean) =>
    request<CompanyModuleDto>(`/company/modules/${key}`, {
      method: "PATCH", body: JSON.stringify({ enabled }),
    }),

  /* ── User Preferences ─────────────────────────────────────── */
  preferences: () => request<UserPreferenceDto>("/me/preferences"),
  updatePreferences: (payload: Partial<UserPreferenceDto>) =>
    request<UserPreferenceDto>("/me/preferences", {
      method: "PATCH", body: JSON.stringify(payload),
    }),

  /* ── Accounting aggregates ────────────────────────────────── */
  cashflow: (period = "month") =>
    request<CashFlowDto[]>(`/accounting/cashflow?period=${period}`),
  expenses: () => request<ExpenseDto[]>("/accounting/expenses"),
  syscohada: () => request<SyscohadaDto[]>("/accounting/syscohada-status"),

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
    fetch(`${API_URL}/payroll/payslips/${payslipId}/download`, {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    }),

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
};

export type CashFlowDto = { label: string; inflow: number; outflow: number };
export type ExpenseDto = { name: string; amount: number; color: string };
export type SyscohadaDto = { code: string; label: string; status: string; count: number };
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
