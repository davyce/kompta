/**
 * portalApi.ts — Client API du Portail client (auth séparée de l'app principale).
 *
 * Le token du portail est stocké dans une clé localStorage DISTINCTE de
 * l'app principale (`kompta_portal_token` vs le token en mémoire de
 * services/api.ts), pour qu'un admin connecté à l'app et un client connecté
 * au portail dans le même navigateur ne se marchent pas dessus.
 */

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8010/api";
const PORTAL_TOKEN_KEY = "kompta_portal_token";

export class PortalApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getPortalToken(): string | null {
  try {
    return localStorage.getItem(PORTAL_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setPortalToken(token: string): void {
  try {
    localStorage.setItem(PORTAL_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearPortalToken(): void {
  try {
    localStorage.removeItem(PORTAL_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export type PortalClient = {
  client_id: number;
  client_name: string;
};

export type PortalInvoice = {
  id: number;
  number: string;
  status: string;
  total_amount: number;
  currency: string;
  due_date: string | null;
  payment_requested_at: string | null;
  created_at: string | null;
};

export type PortalCompany = {
  id: number;
  name: string;
  logo_path: string | null;
};

export type PortalPaymentInstructions = {
  invoice_number: string;
  amount: number;
  currency: string;
  reference: string;
  provider: string | null;
  phone_number: string | null;
  account_name: string | null;
  instructions: string | null;
  requested_at: string;
};

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data?.detail ?? `Erreur ${response.status}`;
  } catch {
    return `Erreur ${response.status}`;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getPortalToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new PortalApiError(0, `API indisponible sur ${API_URL}.`);
  }
  if (!response.ok) {
    throw new PortalApiError(response.status, await readError(response));
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function requestBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  const token = getPortalToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { headers });
  if (!response.ok) throw new PortalApiError(response.status, await readError(response));
  return response.blob();
}

export const portalApi = {
  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: string; client_id: number; client_name: string }>(
      "/portal/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) }
    ),

  myCompany: () => request<PortalCompany>("/portal/me/company"),

  myInvoices: () => request<PortalInvoice[]>("/portal/me/invoices"),

  downloadInvoicePdf: async (invoiceId: number, filename: string) => {
    const blob = await requestBlob(`/portal/me/invoices/${invoiceId}/pdf`);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  requestPayment: (invoiceId: number) =>
    request<PortalPaymentInstructions>(`/portal/me/invoices/${invoiceId}/request-payment`, {
      method: "POST",
    }),
};
