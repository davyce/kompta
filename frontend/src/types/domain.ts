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
  onboarding_done?: boolean;
  /** Permissions effectives issues du rôle personnalisé (allowlist de modules). */
  permissions?: string[];
  custom_role?: { id: number; name: string; scope: string; color?: string } | null;
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
  /** Seuil d'alerte trésorerie (Limule), en centimes. Défaut 5 000 000 (= 50 000). */
  cash_low_threshold_cents?: number;
  loyalty_enabled?: boolean;
  loyalty_points_per_1000?: number;
  // Mentions légales (entreprise réelle CEMAC / OHADA)
  legal_form?: string;
  rccm?: string;
  niu?: string;
  cnss_number?: string;
  patente_number?: string;
  tax_regime?: string;
  share_capital?: string;
  founded_date?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  manager_name?: string;
  manager_title?: string;
  bank_name?: string;
  bank_account?: string;
  // Taux de paie configurables (défauts = anciennes constantes en dur)
  cnss_employee_rate?: number;
  cnss_employer_rate?: number;
  family_allowance_rate?: number;
  work_accident_rate?: number;
  is_public_sector?: boolean;
  has_logo?: boolean;
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
  cnss_number?: string;
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
  // Champs intelligence documentaire (v2)
  raw_text?: string;
  extracted_data?: string;       // JSON string
  text_length?: number;
  parse_method?: string;
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
  customer_email?: string | null;
  client_id?: number | null;
  status: string;
  total_amount: number;
  subtotal?: number;
  tax_amount?: number;
  due_date: string | null;
  payment_method: string;
  payment_account_id: number | null;
  payment_account_label: string;
  paid_at: string | null;
  created_at: string;
  lines: Array<{ id: number; description: string; quantity: number; unit_price: number; total: number }>;
  relance_count?: number;
  last_relance_at?: string;
};

export type Opportunity = {
  id: number;
  company_id: number;
  client_id: number | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  title: string;
  stage: string;
  estimated_amount_cents: number;
  probability_percent: number;
  expected_close_date: string | null;
  notes: string;
  assigned_to_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export type PipelineStageSummary = {
  stage: string;
  count: number;
  total_estimated_amount_cents: number;
};

export type PipelineSummary = {
  stages: PipelineStageSummary[];
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
  proof_url: string | null;
  due_time: string | null;
  created_at: string;
  updated_at: string;
  assigned_to_me: boolean;
  can_update: boolean;
  can_delete: boolean;
  tags: string;
  project: string;
  order_index: number;
};

export type Channel = {
  id: number;
  name: string;
  topic: string;
  company_id: number;
  is_restricted?: boolean;
  member_ids?: number[];
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

export type LimuleAction = {
  detected: boolean;
  type: "task" | "meeting" | "document" | "approval" | "payment" | "reminder";
  title: string;
  description: string;
  priority: "high" | "normal" | "low";
  due_date: string | null;
  due_time: string | null;
  assignee: string;
  confidence: number; // 0.0 – 1.0
};

export type Message = {
  id: number;
  channel_id: number;
  author_id: number;
  author_name: string;
  body: string;
  mentions: string;
  ai_suggestion: string;
  ai_action: LimuleAction | null;  // action structurée Limule
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
  bonus: number;
  overtime_pay: number;
  absence_deduction: number;
  cnss_employee_cents?: number;
  cnss_employer_cents?: number;
  irpp_cents?: number;
  family_allowance_cents?: number;
  work_accident_cents?: number;
  paid_at?: string | null;
};

export type EmployeePayrollOverride = {
  employee_id: number;
  overtime_hours: number;
  bonus: number;
  absence_days: number;
  notes?: string;
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

export type OpeningBalanceDto = {
  id: number;
  payment_account_id: number | null;
  amount: number;
  currency: string;
  date: string;
  label: string;
};

export type OpeningBalancePayload = {
  payment_account_id: number | null;
  amount: number;
  entry_date?: string;
  label?: string;
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
  client_id?: number | null;
  client_name?: string;
  loyalty_points_earned?: number;
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
  generated_text?: string;
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

export type SyscemacJournal = {
  code: string;
  label: string;
  status: "ready" | "empty" | "draft" | string;
  count: number;
};

/* ── Module Groupes & Organisations ──────────────────────────────────── */

export type OrganizationGroup = {
  id: number;
  name: string;
  type: string;
  description: string;
  country: string;
  city: string;
  address: string;
  currency: string;
  linked_company_id?: number | null;
  status: string;
  is_active: boolean;
  created_at: string;
  member_count?: number;
  my_roles?: string[];
  can_manage?: boolean;
};

export type GroupMember = {
  id: number;
  full_name: string;
  phone: string;
  email: string;
  date_of_birth: string | null;
  zone: string;
  profession: string;
  member_number: string;
  status: string;
  is_active: boolean;
  roles: string[];
};

export type GroupRole = {
  id: number;
  name: string;
  permissions: string[];
};

/** Rôle personnalisé d'entreprise (scope "company"). */
export type CustomRole = {
  id: number;
  name: string;
  description: string;
  scope: string;
  permissions: string[];
  color: string;
  company_id: number | null;
  group_id: number | null;
  member_count: number;
};

export type RolePermissionItem = { key: string; label: string; scopes: string[] };

export type CompanyUserRow = {
  id: number;
  full_name: string;
  email: string;
  role: string;
  custom_role_id: number | null;
  custom_role_name: string | null;
  has_avatar: boolean;
};

export type GroupLeadershipHistory = {
  id: number;
  president_member_id: number | null;
  vice_president_member_id: number | null;
  secretary_member_id: number | null;
  treasurer_member_id: number | null;
  mandate_start: string | null;
  mandate_end: string | null;
  elected_by: string;
  is_current: boolean;
};

export type ContributionPlan = {
  id: number;
  title: string;
  amount: number;
  currency: string;
  frequency: string;
  due_day: number | null;
  start_date: string | null;
  end_date: string | null;
  is_mandatory: boolean;
  status: string;
  target_amount: number;
};

export type ContributionPayment = {
  id: number;
  member_id: number;
  member_name: string;
  plan_id: number;
  plan_title: string;
  amount_due: number;
  amount_paid: number;
  late_fee: number;
  payment_date: string | null;
  due_date: string | null;
  payment_method: string;
  status: string;
  validated_at: string | null;
  journal_entry_id: number | null;
};

export type GroupTransaction = {
  id: number;
  type: string;
  category: string;
  amount: number;
  currency: string;
  description: string;
  transaction_date: string;
  payment_method: string;
  status: string;
};

export type GroupExpense = {
  id: number;
  title: string;
  category: string;
  amount: number;
  currency: string;
  expense_date: string;
  paid_to: string;
  payment_method: string;
  status: string;
  approved_at: string | null;
  journal_entry_id: number | null;
};

export type GroupMeeting = {
  id: number;
  title: string;
  description: string;
  location: string;
  start_datetime: string;
  end_datetime: string | null;
  meeting_type: string;
  agenda: string;
  minutes: string;
  status: string;
  reminder_enabled: boolean;
  created_at: string;
};

export type GroupActivity = {
  id: number;
  title: string;
  activity_type: string;
  location: string;
  start_datetime: string;
  end_datetime: string | null;
  budget: number;
  status: string;
  created_at: string;
};

export type GroupVote = {
  id: number;
  title: string;
  options: string[];
  start_datetime: string;
  end_datetime: string;
  status: string;
  created_at: string;
};

export type GroupChatRoom = {
  id: number;
  name: string;
  type: string;
  created_at: string;
};

export type GroupChatMessage = {
  id: number;
  room_id: number;
  sender_name: string;
  content: string;
  message_type: string;
  ai_suggestion?: string;
  ai_action?: LimuleAction | null;
  created_at: string;
  deleted_at: string | null;
};

export type GroupDocument = {
  id: number;
  title: string;
  filename: string;
  category: string;
  visibility: string;
  size_bytes: number;
  mime_type: string;
  created_at: string;
};

export type GroupFinanceDashboard = {
  balance: number;
  total_contributions_expected: number;
  total_contributions_received: number;
  total_expenses: number;
  members_count: number;
  members_up_to_date: number;
  members_late: number;
  pending_expenses: number;
};

export type GroupCalendarEvent = {
  type: "meeting" | "activity" | "vote" | "birthday" | string;
  id?: number;
  member_id?: number;
  member_name?: string;
  title: string;
  start: string;
  end?: string;
  status?: string;
  location?: string;
  days_until?: number;
};

export type CollectionMethod = {
  id: number;
  provider: "cash" | "momo_mtn" | "momo_airtel" | "momo_moov" | "bank_transfer" | "card_stripe";
  label: string;
  enabled: boolean;
  merchant_number: string;
  account_name: string;
  bank_name: string;
  bank_account: string;
  instructions: string;
  verified: boolean;
  verified_at: string | null;
  last_test_status: string;
};
