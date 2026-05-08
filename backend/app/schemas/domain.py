from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserRead"
    must_change_password: bool = False


class LoginRequest(BaseModel):
    email: str
    password: str


class CompanyRegistrationRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=160)
    legal_name: str = ""
    industry: str = "Services"
    organization_type: str = "PME"
    country: str = "Congo"
    admin_full_name: str = Field(min_length=2, max_length=160)
    admin_email: str
    admin_phone: str = ""
    password: str = Field(min_length=8)


class FirstLoginChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class CompanyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    legal_name: str
    industry: str
    organization_type: str
    country: str
    primary_color: str
    accent_color: str
    completion_score: int
    teras_score: int


class CompanyUpdate(BaseModel):
    name: str | None = None
    legal_name: str | None = None
    industry: str | None = None
    organization_type: str | None = None
    country: str | None = None
    primary_color: str | None = None
    accent_color: str | None = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    phone: str = ""
    full_name: str
    role: str
    department: str
    branch: str
    company_id: int
    employee_id: int | None = None
    must_change_password: bool = False
    account_status: str = "active"


class EmployeeBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: str
    phone: str = ""
    job_title: str
    employment_type: str = "CDI"
    department: str = "Operations"
    branch: str = "Siege"
    manager_name: str = ""
    salary: float = 0
    status: str = "active"
    account_status: str = "draft"
    access_role: str = "employe"
    access_scope: str = "self"
    payout_method: str = "mobile_money"
    payout_phone: str = ""
    payout_bank_name: str = ""
    payout_account_number: str = ""
    payout_paypal_email: str = ""
    badge_color: str = "#2563eb"


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeRead(EmployeeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    user_id: int | None = None
    last_login_at: datetime | None = None
    invited_at: datetime | None = None
    activated_at: datetime | None = None
    created_at: datetime


class EmployeePayoutUpdate(BaseModel):
    payout_method: str = "mobile_money"
    payout_phone: str = ""
    payout_bank_name: str = ""
    payout_account_number: str = ""
    payout_paypal_email: str = ""
    confirm: bool = True


class EmployeeQuickCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    job_title: str
    phone: str = ""
    email: str = ""
    employment_type: str = "CDI"
    department: str = "Operations"
    branch: str = "Siege"
    salary: float = 0
    access_role: str = "employe"
    payout_method: str = "mobile_money"
    payout_phone: str = ""
    payout_bank_name: str = ""
    payout_account_number: str = ""
    payout_paypal_email: str = ""


class EmployeeCreateWithAccount(EmployeeBase):
    create_user_account: bool = True


class EmployeeProvisioningResult(BaseModel):
    employee: EmployeeRead
    login_identifier: str
    temporary_password: str
    account_status: str
    must_change_password: bool
    access_note: str


class AccountInfoRead(BaseModel):
    employee_id: int
    user_id: int | None
    login_identifier: str
    phone: str
    role: str
    account_status: str
    must_change_password: bool
    last_login_at: datetime | None = None
    invited_at: datetime | None = None
    activated_at: datetime | None = None
    has_active_temporary_credential: bool


class AccountStatusUpdate(BaseModel):
    account_status: str


class PermissionsUpdate(BaseModel):
    access_role: str
    access_scope: str = "self"


class SecurityAuditRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_user_id: int | None
    employee_id: int | None
    target_user_id: int | None
    action: str
    details: str
    created_at: datetime


class CompanyDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    filename: str
    mime_type: str
    size_bytes: int
    document_type: str
    source_module: str
    status: str
    ai_summary: str
    ai_tags: str
    confidence: int
    raw_text: str = ""
    extracted_data: str = "{}"
    text_length: int = 0
    parse_method: str = ""
    employee_id: int | None = None
    created_at: datetime


class DocumentAnalyzeRequest(BaseModel):
    title: str = ""
    content: str = ""


class EmployabilitySubmitRequest(BaseModel):
    employee_id: int
    include_documents: bool = True


class EmployabilityCheckRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    status: str
    score: int
    teras_reference: str
    payload_snapshot: str
    result_summary: str
    submitted_at: datetime | None = None
    confirmed_at: datetime | None = None
    created_at: datetime


class TerasAnalysisJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    domain: str
    target_type: str
    target_id: int | None
    status: str
    result_snapshot: str
    teras_reference: str
    created_at: datetime


class TerasScoreSnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    domain: str
    score: int
    confidence: int
    maturity_level: str
    summary: str
    recommendations: str
    created_at: datetime


class AIRouterRequest(BaseModel):
    prompt: str
    context_domain: str = "general"


class AIRouterDecision(BaseModel):
    route: str
    deepseek_role: str
    teras_role: str
    reason: str
    suggested_endpoint: str | None = None


class ProductBase(BaseModel):
    name: str
    sku: str
    category: str = "General"
    brand: str = "KOMPTA"
    variant: str = "Standard"
    price: float = Field(default=0, ge=0)
    stock_quantity: int = Field(default=0, ge=0)
    reorder_level: int = Field(default=5, ge=0)


class ProductCreate(ProductBase):
    pass


class ProductImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    storage_path: str
    mime_type: str
    is_primary: bool
    sort_order: int
    created_at: datetime


class ProductRead(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    qr_code: str
    qr_generated: bool
    company_id: int
    created_at: datetime
    images: list[ProductImageRead] = []


class InvoiceLineCreate(BaseModel):
    description: str
    quantity: int = Field(default=1, gt=0)
    unit_price: float = Field(default=0, ge=0)


class InvoiceCreate(BaseModel):
    customer_name: str
    status: str = "draft"
    due_date: date | None = None
    lines: list[InvoiceLineCreate]


class InvoiceLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    description: str
    quantity: int
    unit_price: float
    total: float


class InvoiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: str
    customer_name: str
    status: str
    total_amount: float
    due_date: date | None
    payment_method: str = ""
    payment_account_id: int | None = None
    payment_account_label: str = ""
    paid_at: datetime | None = None
    created_at: datetime
    lines: list[InvoiceLineRead] = []


class InvoicePaymentCreate(BaseModel):
    payment_method: str = "cash"
    payment_account_id: int | None = None


class SaleItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(default=1, gt=0)


class SaleCreate(BaseModel):
    payment_method: str = "cash"
    payment_account_id: int | None = None
    items: list[SaleItemCreate]


class PaymentAccountBase(BaseModel):
    provider: str = Field(default="mobile_money", max_length=40)
    label: str = Field(min_length=1, max_length=160)
    account_name: str = ""
    phone_number: str = ""
    account_number: str = ""
    bank_name: str = ""
    bank_code: str = ""
    paypal_email: str = ""
    currency: str = "XAF"
    instructions: str = ""
    enabled: bool = True
    use_for_pos: bool = True
    use_for_payroll: bool = False
    is_default_pos: bool = False
    is_default_payroll: bool = False


class PaymentAccountCreate(PaymentAccountBase):
    pass


class PaymentAccountUpdate(BaseModel):
    provider: str | None = None
    label: str | None = None
    account_name: str | None = None
    phone_number: str | None = None
    account_number: str | None = None
    bank_name: str | None = None
    bank_code: str | None = None
    paypal_email: str | None = None
    currency: str | None = None
    instructions: str | None = None
    enabled: bool | None = None
    use_for_pos: bool | None = None
    use_for_payroll: bool | None = None
    is_default_pos: bool | None = None
    is_default_payroll: bool | None = None


class PaymentAccountRead(PaymentAccountBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    masked_identifier: str = ""
    created_at: datetime


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    status: str = "todo"
    priority: str = "normal"
    due_date: date | None = None
    due_time: str | None = None
    assignee_name: str = ""
    source: str = "manual"
    proof_required: bool = False


class TaskRead(TaskCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime
    assigned_to_me: bool = False
    can_update: bool = False
    can_delete: bool = False
    proof_url: str | None = None
    due_time: str | None = None


class ChatChannelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    topic: str
    company_id: int


class ChatChannelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    topic: str = Field(default="", max_length=180)


class ChatMemberRead(BaseModel):
    id: int
    name: str
    role: str = ""
    department: str = ""
    branch: str = ""
    avatar: str = ""
    status: str = "active"


class ChatChannelDetail(BaseModel):
    channel: ChatChannelRead
    members: list[ChatMemberRead] = []
    tasks: list[TaskRead] = []
    member_count: int = 0
    online_count: int = 0


class MessageCreate(BaseModel):
    body: str


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    channel_id: int
    author_id: int
    author_name: str = ""
    body: str
    mentions: str
    ai_suggestion: str
    company_id: int
    created_at: datetime


class EmployeePayrollOverride(BaseModel):
    """Ajustements variables par employé pour un cycle de paie."""
    employee_id: int
    overtime_hours: float = 0        # heures supplémentaires
    bonus: float = 0                 # prime / gratification
    absence_days: int = 0            # jours d'absence non rémunérés
    notes: str = ""


class PayrollRunCreate(BaseModel):
    period: str
    payment_account_id: int | None = None
    overrides: list[EmployeePayrollOverride] = []


class PayslipUpdate(BaseModel):
    """Mise à jour partielle d'un bulletin de paie."""
    gross_pay: float | None = None
    deductions: float | None = None
    net_pay: float | None = None
    payout_status: str | None = None
    payout_destination: str | None = None
    payout_method: str | None = None
    bonus: float | None = None
    overtime_pay: float | None = None
    absence_deduction: float | None = None


class PayrollRunStatusUpdate(BaseModel):
    status: str


class PayslipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    employee_name: str
    gross_pay: float
    deductions: float
    net_pay: float
    reference: str
    payout_method: str = ""
    payout_destination: str = ""
    payout_status: str = "pending"
    bonus: float = 0
    overtime_pay: float = 0
    absence_deduction: float = 0


class PayrollRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    period: str
    status: str
    gross_total: float
    net_total: float
    payment_account_id: int | None = None
    payment_account_label: str = ""
    created_at: datetime
    payslips: list[PayslipRead] = []


class TerasAlertRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    severity: str
    module: str
    status: str
    confidence: int
    recommendation: str
    created_at: datetime


class WritingRequest(BaseModel):
    content_type: str = "email"
    tone: str = "professionnel"
    audience: str = "interne"
    notes: str


class DeclarationRequest(BaseModel):
    period: str
    declaration_type: str = "fiscale"


class DeclarationRecordCreate(BaseModel):
    period: str
    declaration_type: str = "fiscale"


class DeclarationRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    period: str
    declaration_type: str
    case_reference: str
    status: str
    confidence: int
    missing_documents: str
    checklist: str
    generated_text: str = ""
    provider: str
    created_by_user_id: int | None = None
    company_id: int
    created_at: datetime
    updated_at: datetime


class TicketMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticket_id: int
    author_user_id: int
    author_name: str = ""
    body: str
    is_staff: bool
    created_at: datetime


class TicketRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    body: str
    status: str
    priority: str
    category: str
    company_id: int | None
    company_name: str = ""
    requester_user_id: int | None
    requester_name: str = ""
    assignee_user_id: int | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime
    messages: list[TicketMessageRead] = []


class TicketCreate(BaseModel):
    subject: str
    body: str = ""
    priority: str = "medium"
    category: str = "general"


class TicketUpdate(BaseModel):
    status: str | None = None
    priority: str | None = None
    category: str | None = None
    assignee_user_id: int | None = None


class TicketReplyCreate(BaseModel):
    body: str


# ─────────────────────────────────────────────────────────────────────────
# Meetings, AI Generations, Daily Notes, Company Modules, User Preferences
# ─────────────────────────────────────────────────────────────────────────

class MeetingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    start_at: datetime
    end_at: datetime
    tag: str
    tag_color: str
    location: str
    join_url: str
    agenda: str = ""
    attendees: list[str] = []
    ai_summary: str
    ai_points: list[str] = []
    teras_flags: list[str] = []
    status: str
    created_by_user_id: int | None
    created_at: datetime


class MeetingCreate(BaseModel):
    title: str
    start_at: datetime
    end_at: datetime
    tag: str = 'Direction'
    tag_color: str = 'violet'
    location: str = ''
    join_url: str = ''
    agenda: str = ''
    attendees: list[str] = []


class MeetingUpdate(BaseModel):
    title: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    tag: str | None = None
    tag_color: str | None = None
    location: str | None = None
    join_url: str | None = None
    agenda: str | None = None
    attendees: list[str] | None = None
    ai_summary: str | None = None
    ai_points: list[str] | None = None
    status: str | None = None


class AIGenerationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    title: str
    prompt: str
    content: str
    model: str
    teras_used: bool
    user_id: int | None
    created_at: datetime


class AIGenerationCreate(BaseModel):
    kind: str = 'text'
    title: str = ''
    prompt: str
    context: str = ''  # optional extra context (e.g. employee_id, declaration_id)


class DailyNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    note_date: date
    title: str
    body: str
    ai_generated: bool
    pinned: bool
    user_id: int | None
    created_at: datetime
    updated_at: datetime


class DailyNoteCreate(BaseModel):
    note_date: date
    title: str = ''
    body: str
    pinned: bool = False


class DailyNoteUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    pinned: bool | None = None


class CompanyModuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    module_key: str
    enabled: bool


class CompanyModuleUpdate(BaseModel):
    enabled: bool


class InvestmentCreate(BaseModel):
    ticker: str
    display_name: str
    exchange: str = ""
    currency_stock: str = "USD"
    shares: float
    invested_amount: float
    purchase_price_ref: float
    purchase_date: str | None = None
    notes: str | None = None


class InvestmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ticker: str
    display_name: str
    exchange: str
    currency_stock: str
    shares: float
    invested_amount: float
    purchase_price_ref: float
    purchase_date: str | None
    notes: str | None
    last_analysis: str | None
    last_analysis_at: str | None


class InvestmentUpdate(BaseModel):
    shares: float | None = None
    invested_amount: float | None = None
    purchase_price_ref: float | None = None
    purchase_date: str | None = None
    notes: str | None = None


class UserPreferenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    notify_chat: bool
    notify_teras: bool
    notify_payroll: bool
    notify_email: bool
    digest_frequency: str
    language: str
    theme: str
    currency: str = "XAF"


class UserPreferenceUpdate(BaseModel):
    notify_chat: bool | None = None
    notify_teras: bool | None = None
    notify_payroll: bool | None = None
    notify_email: bool | None = None
    digest_frequency: str | None = None
    language: str | None = None
    theme: str | None = None
    currency: str | None = None


class CashFlowPoint(BaseModel):
    label: str
    inflow: float
    outflow: float


class ExpenseCategory(BaseModel):
    name: str
    amount: float
    color: str


class RevenueSeriesPoint(BaseModel):
    label: str
    revenue: float
    margin: float


# ─────────────────────────────────────────────────────────────────────────
# Clients / CRM
# ─────────────────────────────────────────────────────────────────────────

class ClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = "Congo"
    notes: str | None = None
    status: str = "active"


class ClientUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None
    notes: str | None = None
    status: str | None = None


class ClientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str | None
    phone: str | None
    address: str | None
    city: str | None
    country: str | None
    notes: str | None
    status: str
    company_id: int
    created_at: datetime
    updated_at: datetime


class ClientStatsRead(BaseModel):
    client_id: int
    invoice_count: int
    total_revenue: float
    unpaid_count: int
    last_invoice_date: str | None


# ─────────────────────────────────────────────────────────────────────────
# Budget
# ─────────────────────────────────────────────────────────────────────────

class BudgetCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    icon: str = "circle"
    color: str = "#059669"
    planned_amount: float = 0
    period: str = "monthly"  # monthly | quarterly | yearly
    category_type: str = "expense"  # expense | income | investment


class BudgetCategoryUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    color: str | None = None
    planned_amount: float | None = None
    period: str | None = None
    category_type: str | None = None


class BudgetCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    icon: str
    color: str
    planned_amount: float
    period: str
    category_type: str
    company_id: int
    created_at: datetime
    updated_at: datetime


class BudgetSummaryItem(BaseModel):
    id: int
    name: str
    icon: str
    color: str
    planned_amount: float
    period: str
    category_type: str
    spent: float
    remaining: float
    progress_pct: float


# ─────────────────────────────────────────────────────────────────────────
# Transactions bancaires
# ─────────────────────────────────────────────────────────────────────────

class BankTransactionCreate(BaseModel):
    date: str
    label: str
    amount: float = 0
    debit: float | None = None
    credit: float | None = None
    balance: float | None = None
    currency: str = "XAF"
    category: str = ""
    sub_category: str | None = None
    counterpart: str | None = None
    reference: str | None = None
    source_type: str = "manual"
    source_file: str | None = None
    status: str = "confirmed"
    notes: str | None = None
    raw_line: str | None = None
    document_id: int | None = None


class BankTransactionUpdate(BaseModel):
    date: str | None = None
    label: str | None = None
    amount: float | None = None
    debit: float | None = None
    credit: float | None = None
    balance: float | None = None
    currency: str | None = None
    category: str | None = None
    sub_category: str | None = None
    counterpart: str | None = None
    reference: str | None = None
    status: str | None = None
    notes: str | None = None


class BankTransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    document_id: int | None
    date: str
    label: str
    amount: float
    debit: float | None
    credit: float | None
    balance: float | None
    currency: str
    category: str
    sub_category: str | None
    counterpart: str | None
    reference: str | None
    source_type: str
    source_file: str | None
    status: str
    notes: str | None
    raw_line: str | None
    created_at: datetime
    updated_at: datetime
