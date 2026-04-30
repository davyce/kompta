export type User = {
  id: number;
  email: string;
  phone: string;
  full_name: string;
  role: string;
  department: string;
  branch: string;
  company_id: number;
  employee_id: number | null;
  must_change_password: boolean;
  account_status: string;
};

export type Company = {
  id: number;
  name: string;
  legal_name: string;
  industry: string;
  organization_type: string;
  country: string;
  primary_color: string;
  accent_color: string;
  completion_score: number;
  teras_score: number;
};

export type Employee = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  job_title: string;
  employment_type: string;
  department: string;
  branch: string;
  manager_name: string;
  salary: number;
  status: string;
  account_status: string;
  access_role: string;
  access_scope: string;
  payout_method: string;
  payout_phone: string;
  payout_bank_name: string;
  payout_account_number: string;
  payout_paypal_email: string;
  user_id: number | null;
  last_login_at: string | null;
  invited_at: string | null;
  activated_at: string | null;
  badge_color: string;
  created_at: string;
};

export type EmployeeProvisioningResult = {
  employee: Employee;
  login_identifier: string;
  temporary_password: string;
  account_status: string;
  must_change_password: boolean;
  access_note: string;
};

export type CompanyDocument = {
  id: number;
  title: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  document_type: string;
  source_module: string;
  status: string;
  ai_summary: string;
  ai_tags: string;
  confidence: number;
  employee_id: number | null;
  created_at: string;
};

export type EmployabilityCheck = {
  id: number;
  employee_id: number;
  status: string;
  score: number;
  teras_reference: string;
  payload_snapshot: string;
  result_summary: string;
  submitted_at: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export type AccountInfo = {
  employee_id: number;
  user_id: number | null;
  login_identifier: string;
  phone: string;
  role: string;
  account_status: string;
  must_change_password: boolean;
  last_login_at: string | null;
  invited_at: string | null;
  activated_at: string | null;
  has_active_temporary_credential: boolean;
};

export type Product = {
  id: number;
  name: string;
  sku: string;
  category: string;
  brand: string;
  variant: string;
  price: number;
  stock_quantity: number;
  reorder_level: number;
  qr_code: string;
  qr_generated: boolean;
  created_at: string;
  images: Array<{
    id: number;
    filename: string;
    storage_path: string;
    mime_type: string;
    is_primary: boolean;
    sort_order: number;
    created_at: string;
  }>;
};

export type Invoice = {
  id: number;
  number: string;
  customer_name: string;
  status: string;
  total_amount: number;
  due_date: string | null;
  created_at: string;
  lines: Array<{ id: number; description: string; quantity: number; unit_price: number; total: number }>;
};

export type Task = {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string | null;
  assignee_name: string;
  source: string;
  proof_required: boolean;
  created_at: string;
};

export type Channel = {
  id: number;
  name: string;
  topic: string;
  company_id: number;
};

export type ChatMember = {
  id: number;
  name: string;
  role: string;
  department: string;
  branch: string;
  avatar: string;
  status: string;
};

export type ChatChannelDetail = {
  channel: Channel;
  members: ChatMember[];
  tasks: Task[];
  member_count: number;
  online_count: number;
};

export type Message = {
  id: number;
  channel_id: number;
  author_id: number;
  author_name: string;
  body: string;
  mentions: string;
  ai_suggestion: string;
  created_at: string;
};

export type Payslip = {
  id: number;
  employee_id: number;
  employee_name: string;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  reference: string;
  payout_method: string;
  payout_destination: string;
  payout_status: string;
};

export type PayrollRun = {
  id: number;
  period: string;
  status: string;
  gross_total: number;
  net_total: number;
  payment_account_id: number | null;
  payment_account_label: string;
  created_at: string;
  payslips: Payslip[];
};

export type PaymentAccount = {
  id: number;
  provider: "mobile_money" | "zola" | "bank" | "paypal" | "card" | "cash" | string;
  label: string;
  account_name: string;
  phone_number: string;
  account_number: string;
  bank_name: string;
  bank_code: string;
  paypal_email: string;
  currency: string;
  instructions: string;
  enabled: boolean;
  use_for_pos: boolean;
  use_for_payroll: boolean;
  is_default_pos: boolean;
  is_default_payroll: boolean;
  masked_identifier: string;
  company_id: number;
  created_at: string;
};

export type TerasAlert = {
  id: number;
  title: string;
  severity: string;
  module: string;
  status: string;
  confidence: number;
  recommendation: string;
  created_at: string;
};

export type TerasAnalysisJob = {
  id: number;
  domain: string;
  target_type: string;
  target_id: number | null;
  status: string;
  result_snapshot: string;
  teras_reference: string;
  created_at: string;
};

export type TerasScoreSnapshot = {
  id: number;
  domain: string;
  score: number;
  confidence: number;
  maturity_level: string;
  summary: string;
  recommendations: string;
  created_at: string;
};

export type TerasRecommendation = {
  domain: string;
  score: number;
  confidence: number;
  summary: string;
  recommendations: string[];
};

export type SaleRecord = {
  id: number;
  receipt_number: string;
  payment_method: string;
  payment_account_id: number | null;
  payment_account_label: string;
  total_amount: number;
  status: string;
  created_at: string;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

export type InventoryMovement = {
  id: number;
  product_id: number;
  movement_type: "in" | "out" | string;
  quantity: number;
  reason: string;
  reference: string;
  created_at: string;
};

export type AIRouterDecision = {
  route: string;
  deepseek_role: string;
  teras_role: string;
  reason: string;
  suggested_endpoint: string | null;
};

export type DeclarationRecord = {
  id: number;
  period: string;
  declaration_type: string;
  case_reference: string;
  status: string;
  confidence: number;
  missing_documents: string;
  checklist: string;
  provider: string;
  created_by_user_id: number | null;
  company_id: number;
  created_at: string;
  updated_at: string;
};

/* ── New domain types (Lot A) ─────────────────────────────────────── */

export type Meeting = {
  id: number;
  title: string;
  start_at: string;
  end_at: string;
  tag: string;
  tag_color: string;
  location: string;
  join_url: string;
  attendees: string[];
  ai_summary: string;
  ai_points: string[];
  teras_flags: string[];
  status: "scheduled" | "done" | "canceled" | string;
  created_by_user_id: number | null;
  created_at: string;
};

export type AIGeneration = {
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

export type DailyNote = {
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

export type CompanyModuleToggle = {
  id: number;
  module_key: string;
  enabled: boolean;
};

export type UserPreference = {
  notify_chat: boolean;
  notify_teras: boolean;
  notify_payroll: boolean;
  notify_email: boolean;
  digest_frequency: "off" | "daily" | "weekly" | string;
  language: string;
  theme: "auto" | "light" | "dark" | string;
};

export type CashFlowPoint = {
  label: string;
  inflow: number;
  outflow: number;
};

export type ExpenseCategory = {
  name: string;
  amount: number;
  color: string;
};

export type RevenueSeriesPoint = {
  label: string;
  revenue: number;
  margin: number;
};

export type SyscohadaJournal = {
  code: string;
  label: string;
  status: "ready" | "empty" | "draft" | string;
  count: number;
};
