import Foundation

// ============================================================================
//  DomainModels — Codable types mirroring backend app/schemas/domain.py
//  Covers the full web-app feature surface being ported to native iOS/macOS.
//  Existing types (Product, Employee, KomptaUser, KomptaCompany, …) live in
//  AppModels.swift; this file adds everything else, wave by wave.
// ============================================================================

// MARK: - Shared helpers
//  `fcfa(...)` / `compactFCFA(...)` live in Services/CurrencyManager.swift —
//  they convert the base-XAF amount into the user's selected display currency.

/// Locale forcée FR — l'app KOMPTA est entièrement en français, mais
/// `Date.formatted(...)` suit sinon la locale système de l'appareil (ex :
/// "Thursday, July 2" sur un iPhone réglé en anglais).
private let frLocale = Locale(identifier: "fr_FR")

/// Date du jour en toutes lettres, en français ("jeudi 2 juillet").
func todayLabelFR() -> String {
    Date().formatted(.dateTime.weekday(.wide).day().month(.wide).locale(frLocale))
}

/// Decodes an ISO-8601 / `yyyy-MM-dd` string the backend may return.
func shortDate(_ raw: String?) -> String {
    guard let raw, !raw.isEmpty else { return "—" }
    let iso = ISO8601DateFormatter()
    if let d = iso.date(from: raw) { return d.formatted(.dateTime.day().month(.abbreviated).year().locale(frLocale)) }
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
    if let d = f.date(from: String(raw.prefix(10))) { return d.formatted(.dateTime.day().month(.abbreviated).year().locale(frLocale)) }
    return String(raw.prefix(10))
}

// MARK: - Clients / CRM

struct Client: Codable, Identifiable, Hashable {
    let id: Int
    var name: String
    var email: String?
    var phone: String?
    var address: String?
    var city: String?
    var country: String?
    var notes: String?
    var status: String
    var loyalty_points: Int
    var loyalty_tier: String
    var global_discount_percent: Double

    var isActive: Bool { status == "active" }
    var initials: String {
        name.components(separatedBy: " ").prefix(2)
            .compactMap { $0.first }.map(String.init).joined().uppercased()
    }
}

struct ClientPayload: Encodable {
    var name: String
    var email: String?
    var phone: String?
    var address: String?
    var city: String?
    var country: String?
    var notes: String?
    var status: String = "active"
}

struct ClientStats: Codable {
    let client_id: Int
    let invoice_count: Int
    let total_revenue: Double
    let unpaid_count: Int
    let last_invoice_date: String?
}

struct ClientDiscount: Codable, Identifiable, Hashable {
    let id: Int
    let client_id: Int
    let label: String
    let discount_type: String   // percent | fixed | points_threshold
    let discount_value: Double
    let min_order_amount: Double
    let applies_to: String      // all | invoice | pos
    let active: Bool
    let created_at: String

    var displayLabel: String {
        let val = discount_type == "percent" ? "\(Int(discount_value))%" : fcfa(discount_value)
        return label.isEmpty ? val : "\(label) – \(val)"
    }
}

struct ClientDiscountPayload: Encodable {
    var label: String = ""
    var discount_type: String = "percent"
    var discount_value: Double = 0
    var min_order_amount: Double = 0
    var applies_to: String = "all"
    var active: Bool = true
}

struct UpdateClientLoyaltyPayload: Encodable {
    var points_delta: Int = 0
    var loyalty_tier: String? = nil
    var global_discount_percent: Double? = nil
}

// MARK: - Billing / Invoices

struct InvoiceLine: Codable, Identifiable, Hashable {
    let id: Int
    let description: String
    let quantity: Int
    let unit_price: Double
    let tax_rate: Double
    let total: Double
}

struct Invoice: Codable, Identifiable, Hashable {
    let id: Int
    let number: String
    let customer_name: String
    let customer_email: String?
    let status: String
    let subtotal: Double
    let tax_amount: Double
    let total_amount: Double
    let due_date: String?
    let payment_method: String
    let paid_at: String?
    let created_at: String
    let approval_status: String
    let lines: [InvoiceLine]

    var isPaid: Bool { status == "paid" }
    var statusColorName: String {
        switch status {
        case "paid": return "green"
        case "overdue": return "red"
        case "sent": return "blue"
        default: return "orange"
        }
    }
}

struct InvoiceLinePayload: Encodable {
    var description: String
    var quantity: Int = 1
    var unit_price: Double = 0
    // Pas de TVA par défaut — l'entreprise l'active elle-même à la création.
    var tax_rate: Double = 0
}

struct InvoicePayload: Encodable {
    var customer_name: String
    var customer_email: String?
    var status: String = "draft"
    var due_date: String?
    var lines: [InvoiceLinePayload]
}

/// Rectification de facture (DG/PDG uniquement) — mêmes champs autorisés que
/// le PATCH backend (customer_name/email/due_date/notes), tous optionnels.
struct InvoiceUpdatePayload: Encodable {
    var customer_name: String?
    var customer_email: String?
    var due_date: String?
    var notes: String?
}

struct InvoiceDeleteRequest: Encodable {
    var reason: String
}

struct InvoicePaymentPayload: Encodable {
    var payment_method: String = "cash"
    var payment_account_id: Int?
}

// MARK: - Inventory

struct InventoryMovement: Codable, Identifiable, Hashable {
    let id: Int
    let product_id: Int
    let product_name: String?
    let movement_type: String
    let quantity: Int
    let reason: String?
    let created_at: String?
}

// MARK: - Bank transactions

struct BankTransaction: Codable, Identifiable, Hashable {
    let id: Int
    let date: String
    let label: String
    let amount: Double
    let debit: Double?
    let credit: Double?
    let balance: Double?
    let currency: String
    let category: String
    let counterpart: String?
    let reference: String?
    let status: String
    let notes: String?

    var isInflow: Bool { (credit ?? 0) > 0 || amount > 0 }

    // Décodage tolérant : une ligne avec un champ texte vide/null (anciennes
    // données) ne doit jamais casser tout l'écran. On applique des valeurs par
    // défaut sûres au lieu d'échouer.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id        = try c.decode(Int.self, forKey: .id)
        date      = (try? c.decodeIfPresent(String.self, forKey: .date)) ?? "" ?? ""
        label     = (try? c.decodeIfPresent(String.self, forKey: .label)) ?? "" ?? ""
        amount    = (try? c.decodeIfPresent(Double.self, forKey: .amount)) ?? 0 ?? 0
        debit     = try? c.decodeIfPresent(Double.self, forKey: .debit) ?? nil
        credit    = try? c.decodeIfPresent(Double.self, forKey: .credit) ?? nil
        balance   = try? c.decodeIfPresent(Double.self, forKey: .balance) ?? nil
        currency  = (try? c.decodeIfPresent(String.self, forKey: .currency)) ?? "XAF" ?? "XAF"
        category  = (try? c.decodeIfPresent(String.self, forKey: .category)) ?? "divers" ?? "divers"
        counterpart = try? c.decodeIfPresent(String.self, forKey: .counterpart) ?? nil
        reference   = try? c.decodeIfPresent(String.self, forKey: .reference) ?? nil
        status    = (try? c.decodeIfPresent(String.self, forKey: .status)) ?? "confirmed" ?? "confirmed"
        notes     = try? c.decodeIfPresent(String.self, forKey: .notes) ?? nil
    }
}

struct BankTransactionPayload: Encodable {
    var date: String
    var label: String
    var amount: Double = 0
    var debit: Double?
    var credit: Double?
    var currency: String = "XAF"
    var category: String = ""
    var counterpart: String?
    var reference: String?
    var notes: String?
}

struct TransactionStats: Codable {
    let count: Int
    let total_credits: Double
    let total_debits: Double
    let balance: Double
    let by_category: [String: Double]
}

struct LowStockProduct: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let sku: String?
    let category: String?
    let stock_quantity: Int
    let reorder_level: Int
    let deficit: Int
    let price: Double
}

// MARK: - Budget

struct BudgetSummaryItem: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let icon: String
    let color: String
    let planned_amount: Double
    let period: String
    let category_type: String
    let spent: Double
    let remaining: Double
    let progress_pct: Double
}

struct BudgetCategoryPayload: Encodable {
    var name: String
    var icon: String = "circle"
    var color: String = "#059669"
    var planned_amount: Double = 0
    var period: String = "monthly"
    var category_type: String = "expense"
}

// MARK: - Investments

struct Investment: Codable, Identifiable, Hashable {
    let id: Int
    let ticker: String
    let display_name: String
    let exchange: String
    let currency_stock: String
    let shares: Double
    let invested_amount: Double
    let purchase_price_ref: Double
    let purchase_date: String?
    let notes: String?
    let last_analysis: String?
    let last_analysis_at: String?
}

struct InvestmentPayload: Encodable {
    var ticker: String
    var display_name: String
    var exchange: String = ""
    var currency_stock: String = "USD"
    var shares: Double
    var invested_amount: Double
    var purchase_price_ref: Double
    var purchase_date: String?
    var notes: String?
}

// MARK: - Live market data (Yahoo Finance via backend)

/// Real-time quote + fundamentals for a ticker. Mirrors backend `/investments/quote/{ticker}`.
struct StockQuote: Codable, Hashable {
    let ticker: String
    let name: String
    let exchange: String
    let currency: String
    let price: Double?
    let prev_close: Double?
    let change: Double
    let change_pct: Double
    let market_cap: Double?
    let market_cap_fmt: String
    let pe_ratio: Double?
    let eps: Double?
    let dividend_yield: Double?
    let week52_high: Double?
    let week52_low: Double?
    let volume: Double?
    let avg_volume: Double?
    let open: Double?
    let day_high: Double?
    let day_low: Double?
    let beta: Double?
    let sector: String
    let industry: String
    let country: String
    let website: String
    let description: String
}

/// One OHLCV candle in a price history series.
struct StockHistoryPoint: Codable, Hashable, Identifiable {
    let t: String
    let o: Double
    let h: Double
    let l: Double
    let c: Double
    let v: Double
    var id: String { t }
}

/// A news headline tied to a ticker.
struct StockNewsItem: Codable, Hashable, Identifiable {
    let title: String
    let summary: String
    let provider: String
    let published: String
    let url: String
    var id: String { url.isEmpty ? title : url }
}

/// A ticker-search autocomplete result.
struct TickerSearchResult: Codable, Hashable, Identifiable {
    let ticker: String
    let name: String
    let exchange: String
    let exchange_code: String?
    let type: String
    let currency: String?
    var id: String { ticker }
}

/// Limule AI analysis response for a single ticker.
struct InvestmentAnalysis: Codable, Hashable {
    let ticker: String?
    let analysis: String
    let generated_at: String?
}

/// Limule AI evaluation of the whole portfolio.
struct PortfolioAnalysis: Codable, Hashable {
    let analysis: String
    let generated_at: String?
    let portfolio_snapshot: [String: Double]?
}

// MARK: - Payment accounts

struct PaymentAccount: Codable, Identifiable, Hashable {
    let id: Int
    let provider: String
    let label: String
    let account_name: String
    let phone_number: String
    let account_number: String
    let bank_name: String
    let currency: String
    let enabled: Bool
    let use_for_pos: Bool
    let use_for_payroll: Bool
    let is_default_pos: Bool
    let masked_identifier: String
}

struct PaymentAccountPayload: Encodable {
    var provider: String = "mobile_money"
    var label: String
    var account_name: String = ""
    var phone_number: String = ""
    var account_number: String = ""
    var bank_name: String = ""
    var currency: String = "XAF"
    var enabled: Bool = true
    var use_for_pos: Bool = true
    var use_for_payroll: Bool = false
}

// MARK: - Tasks / Work / Kanban

struct KTask: Codable, Identifiable, Hashable {
    let id: Int
    var title: String
    var description: String
    var status: String        // todo | in_progress | done
    var priority: String      // low | normal | high
    var due_date: String?
    var assignee_name: String
    var project: String
    var tags: String
    var order_index: Int

    var priorityColorName: String {
        switch priority { case "high": return "red"; case "low": return "gray"; default: return "blue" }
    }
}

struct TaskPayload: Encodable {
    var title: String
    var description: String = ""
    var status: String = "todo"
    var priority: String = "normal"
    var due_date: String?
    var assignee_name: String = ""
    var project: String = ""
}

// MARK: - Chat

struct ChatChannel: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let topic: String
}

struct ChatChannelPayload: Encodable {
    var name: String
    var topic: String = ""
}

struct ChatMsg: Codable, Identifiable, Hashable {
    let id: Int
    let channel_id: Int
    let author_id: Int
    let author_name: String
    let body: String
    let created_at: String
    let ai_suggestion: String?
    let ai_action: ChatAIAction?
}

struct ChatAIAction: Codable, Hashable {
    let detected: Bool
    let type: String?
    let title: String?
    let description: String?
    let priority: String?
    let due_date: String?
    let due_time: String?
    let assignee: String?
    let confidence: Double?
}

struct ChatMember: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let role: String
    let department: String
    let branch: String
    let status: String
    var initials: String {
        name.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined().uppercased()
    }
}

struct ChatChannelDetail: Codable {
    let channel: ChatChannel
    let members: [ChatMember]
    let member_count: Int
    let online_count: Int
}

struct MessagePayload: Encodable { var body: String }
struct ChannelPayload: Encodable { var name: String; var topic: String }
struct CurrencyConvertResult: Codable { let converted: Double?; let rate: Double? }

// MARK: - Custom roles & permissions

struct RolePermission: Codable, Identifiable, Hashable {
    let key: String
    let label: String
    let scopes: [String]
    var id: String { key }
}

struct CustomRole: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let description: String
    let scope: String
    let permissions: [String]
    let color: String
    let company_id: Int?
    let group_id: Int?
    let member_count: Int
}

struct RolePayload: Encodable {
    var name: String
    var description: String = ""
    var scope: String = "company"
    var permissions: [String] = []
    var color: String = "#6366f1"
    var group_id: Int? = nil
}

struct AssignRolePayload: Encodable { var custom_role_id: Int? }

struct MyProfileUpdatePayload: Encodable {
    var full_name: String
    var phone: String
    var address: String
}

/// Admin creates a platform staff member with a custom admin-scoped role.
struct StaffCreatePayload: Encodable {
    var full_name: String
    var email: String
    var phone: String = ""
    var address: String = ""
    var department: String = ""
    var custom_role_id: Int
}

/// Result of creating a staff account — the temp password is shown once.
struct StaffCreatedResult: Decodable {
    let user_id: Int
    let login_identifier: String
    let temporary_password: String
    let role_name: String
}

// MARK: - Payroll

struct Payslip: Codable, Identifiable, Hashable {
    let id: Int
    let employee_id: Int
    let employee_name: String
    let gross_pay: Double
    let deductions: Double
    let net_pay: Double
    let reference: String
    let payout_status: String
    let bonus: Double
    let overtime_pay: Double
}

struct PayrollRun: Codable, Identifiable, Hashable {
    let id: Int
    let period: String
    let status: String
    let gross_total: Double
    let net_total: Double
    let payment_account_label: String
    let created_at: String
    let payslips: [Payslip]
}

struct PayrollRunPayload: Encodable {
    var period: String
    var payment_account_id: Int?
}

// MARK: - Meetings / Calendar

struct Meeting: Codable, Identifiable, Hashable {
    let id: Int
    let title: String
    let start_at: String
    let end_at: String
    let tag: String
    let tag_color: String
    let location: String
    let join_url: String
    let agenda: String
    let attendees: [String]
    let ai_summary: String
    let status: String
}

struct MeetingPayload: Encodable {
    var title: String
    var start_at: String
    var end_at: String
    var tag: String = "Direction"
    var tag_color: String = "violet"
    var location: String = ""
    var agenda: String = ""
}

// MARK: - Notes

struct DailyNote: Codable, Identifiable, Hashable {
    let id: Int
    let note_date: String
    let title: String
    let body: String
    let ai_generated: Bool
    let pinned: Bool
}

struct DailyNotePayload: Encodable {
    var note_date: String
    var title: String = ""
    var body: String
    var pinned: Bool = false
}

// MARK: - Documents

struct CompanyDocument: Codable, Identifiable, Hashable {
    let id: Int
    let title: String
    let filename: String
    let mime_type: String
    let size_bytes: Int
    let document_type: String
    let source_module: String
    let status: String
    let ai_summary: String
    let confidence: Int
    let created_at: String
}

// MARK: - Declarations (fiscal)

struct DeclarationRecord: Codable, Identifiable, Hashable {
    let id: Int
    let period: String
    let declaration_type: String
    let case_reference: String
    let status: String
    let confidence: Int
    let missing_documents: String
    let generated_text: String
    let created_at: String
}

struct DeclarationPayload: Encodable {
    var period: String
    var declaration_type: String = "fiscale"
}

// MARK: - Teras (intelligence / scores)

struct TerasAlert: Codable, Identifiable, Hashable {
    let id: Int
    let title: String
    let severity: String
    let module: String
    let status: String
    let confidence: Int
    let recommendation: String

    var severityColorName: String {
        switch severity { case "high", "critical": return "red"; case "medium": return "orange"; default: return "blue" }
    }
}

struct TerasScore: Codable, Identifiable, Hashable {
    let id: Int
    let domain: String
    let score: Int
    let confidence: Int
    let maturity_level: String
    let summary: String
    let recommendations: String
}

/// Result of a Teras analysis run (`POST /teras/analyze/...`). The analysis text
/// lives in `result_snapshot`.
struct TerasAnalysisJob: Codable, Identifiable, Hashable {
    let id: Int
    let domain: String
    let target_type: String
    let target_id: Int?
    let status: String
    let result_snapshot: String
    let teras_reference: String
    let created_at: String
}

/// One domain's Teras recommendations (`GET /teras/recommendations`).
struct TerasRecommendation: Codable, Identifiable, Hashable {
    let domain: String
    let score: Int
    let confidence: Int
    let summary: String
    let recommendations: [String]
    var id: String { domain }
}

// MARK: - Tickets (support)

struct TicketMessage: Codable, Identifiable, Hashable {
    let id: Int
    let ticket_id: Int
    let author_name: String
    let body: String
    let is_staff: Bool
    let created_at: String
}

struct Ticket: Codable, Identifiable, Hashable {
    let id: Int
    let subject: String
    let body: String
    let status: String
    let priority: String
    let category: String
    let company_name: String
    let requester_name: String
    let created_at: String
    let messages: [TicketMessage]
}

struct TicketPayload: Encodable {
    var subject: String
    var body: String = ""
    var priority: String = "medium"
    var category: String = "general"
}

// MARK: - User preferences

struct UserPreferences: Codable {
    var notify_chat: Bool
    var notify_teras: Bool
    var notify_payroll: Bool
    var notify_email: Bool
    var digest_frequency: String
    var language: String
    var theme: String
    var currency: String
}

// MARK: - Company modules toggle

struct CompanyModule: Codable, Identifiable, Hashable {
    let id: Int
    let module_key: String
    let enabled: Bool
}

// MARK: - AI generations (assistants)

struct AIGeneration: Codable, Identifiable, Hashable {
    let id: Int
    let kind: String
    let title: String
    let prompt: String
    let content: String
    let model: String
    let created_at: String
}

struct WritingPayload: Encodable {
    var content_type: String = "email"
    var tone: String = "professionnel"
    var audience: String = "interne"
    var notes: String
}

/// Response of `POST /assistants/writing` — the backend returns the generated
/// draft plus a confidence score and provider (not a stored AIGeneration row).
struct WritingResult: Codable, Identifiable, Hashable {
    var id = UUID()
    let draft: String
    let confidence: Int?
    let provider: String?

    enum CodingKeys: String, CodingKey { case draft, confidence, provider }
}

// MARK: - Reports overview (finance hub)

struct CashFlowPoint: Codable, Identifiable, Hashable {
    var id: String { label }
    let label: String
    let inflow: Double
    let outflow: Double
}

struct ExpenseCategory: Codable, Identifiable, Hashable {
    var id: String { name }
    let name: String
    let amount: Double
    let color: String
}

// MARK: - Generic paged envelope (many list endpoints return {items,total})

struct Paged<T: Codable>: Codable {
    let items: [T]
    let total: Int?
}

// MARK: - Enterprise parity: company, accounting, audit, fiscal, legislation

struct AccountingModeResponse: Codable, Hashable {
    let mode: String
}

struct AccountingAccount: Codable, Identifiable, Hashable {
    let id: Int
    let code: String
    let name: String
    let type: String
    let syscohada_class: Int?
}

struct SyscemacStatus: Codable, Identifiable, Hashable {
    var id: String { code }
    let code: String
    let label: String
    let status: String
    let count: Int

    var colorName: String {
        switch status {
        case "ready": return "green"
        case "draft": return "orange"
        default: return "gray"
        }
    }
}

struct JournalLine: Codable, Identifiable, Hashable {
    var id: String { "\(account_code)-\(label)-\(debit)-\(credit)" }
    let account_code: String
    let label: String
    let debit: Double
    let credit: Double
}

struct JournalEntry: Codable, Identifiable, Hashable {
    let id: Int
    let reference: String
    let date: String
    let label: String
    let source_type: String
    let source_id: Int?
    let amount: Double
    let currency: String
    let reversed_entry_id: Int?
    let lines: [JournalLine]
}

struct TrialBalanceLine: Codable, Identifiable, Hashable {
    var id: String { account_code }
    let account_code: String
    let account_name: String
    let debit: Double
    let credit: Double
    let balance: Double
}

struct TrialBalance: Codable, Hashable {
    let lines: [TrialBalanceLine]
    let total_debit: Double
    let total_credit: Double
    let balanced: Bool
}

struct ReadinessCheck: Codable, Identifiable, Hashable {
    var id: String { key }
    let key: String
    let label: String
    let status: String
    let detail: String
    let action: String?

    var colorName: String {
        switch status {
        case "pass": return "green"
        case "fail": return "red"
        default: return "orange"
        }
    }
}

struct ReadinessSection: Codable, Identifiable, Hashable {
    let key: String
    let title: String
    let status: String
    let items: [ReadinessCheck]

    var id: String { key }
}

struct ReadinessReport: Codable, Hashable {
    let status: String
    let score: Int
    let company_id: Int
    let company_name: String
    let generated_at: String
    let sections: [ReadinessSection]
    let next_actions: [String]
}

struct FiscalDeadline: Codable, Identifiable, Hashable {
    let id: Int
    let company_id: Int
    let title: String
    let description: String
    let due_date: String
    let tax_type: String
    let status: String
    let recurrence: String
    let reminder_days: Int
    let created_at: String
    let updated_at: String

    var isDone: Bool { status == "done" }
    var colorName: String {
        switch status {
        case "done": return "green"
        case "overdue": return "red"
        default: return "orange"
        }
    }
}

struct FiscalDeadlinePayload: Encodable {
    var title: String
    var description: String = ""
    var due_date: String
    var tax_type: String = "autre"
    var status: String = "upcoming"
    var recurrence: String = "once"
    var reminder_days: Int = 7
}

struct FiscalDeadlineStatusPayload: Encodable {
    var status: String
}

struct VatSummary: Codable, Hashable {
    let period: String
    let from_date: String
    let to_date: String
    let invoices_count: Int
    let taxable_turnover: Double
    let vat_collected: Double
    let total_including_tax: Double
    let currency: String
    let status_breakdown: [String: Int]
}

struct LegislationDocument: Codable, Identifiable, Hashable {
    let id: Int
    let company_id: Int
    let title: String
    let description: String
    let filename: String
    let mime_type: String
    let size_bytes: Int
    let doc_category: String
    let country_scope: String
    let ai_summary: String
    let ai_tags: String
    let analyzed: Bool
    let uploaded_by_user_id: Int?
    let created_at: String
    let updated_at: String

    var categoryLabel: String {
        switch doc_category {
        case "fiscal": return "Fiscal"
        case "social": return "Social"
        case "commerce": return "Commerce"
        case "finance": return "Finance"
        default: return "Général"
        }
    }
}

struct LegislationContext: Codable, Hashable {
    let context: String
    let doc_count: Int
    let categories: [String]?
}

struct AuditLogPage: Codable {
    let items: [CompanyAuditLogEntry]
    let total: Int
    let page: Int?
    let per_page: Int?
    let pages: Int?
}

struct CompanyAuditLogEntry: Codable, Identifiable, Hashable {
    let id: String
    let source: String
    let user_id: Int?
    let user_name: String
    let action: String
    let resource_type: String
    let resource_id: Int?
    let details: String
    let company_id: Int
    let created_at: String
}

struct LimuleSignal: Codable, Identifiable, Hashable {
    var id: String { "\(type)-\(module)-\(label)" }
    let type: String
    let severity: String
    let label: String
    let module: String
}

struct LimuleHistoryItem: Codable, Identifiable, Hashable {
    let id: Int
    let prompt: String
    let response: String
    let module: String?
    let intent: String?
    let page_path: String?
    let sources: [String]
    let signals: [LimuleSignal]
    let rating: Int?
    let created_at: String?
}

struct LimuleChatRichResponse: Decodable {
    let interaction_id: Int?
    let answer: String
    let module: String?
    let intent: String?
    let sources: [String]?
    let signals: [LimuleSignal]?
    let confidence: Int?
}

struct LimuleTaskPayload: Encodable {
    var title: String
    var description: String
    var status: String = "todo"
    var priority: String = "normal"
    var project: String = "Limule"
}
