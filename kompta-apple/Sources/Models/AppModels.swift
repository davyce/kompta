import Foundation

// MARK: - Auth

struct LoginResponse: Decodable {
    let access_token: String
    let token_type: String
    let user: KomptaUser
    let must_change_password: Bool
}

struct FirstLoginChangePasswordPayload: Encodable {
    var current_password: String
    var new_password: String
}

struct CompanyRegistrationPayload: Encodable {
    var company_name: String
    var legal_name: String
    var industry: String
    var organization_type: String
    var country: String
    var admin_full_name: String
    var admin_email: String
    var admin_phone: String
    var password: String
}

struct PasswordResetRequestPayload: Encodable {
    var identifier: String
}

struct PasswordResetRequestResponse: Decodable {
    let message: String
    let reset_token: String?
    let expires_in_minutes: Int?
    let note: String?
}

struct PasswordResetConfirmPayload: Encodable {
    var token: String
    var new_password: String
}

struct PasswordResetConfirmResponse: Decodable {
    let message: String
}

// MARK: - User

struct UserCustomRole: Codable, Hashable {
    let id: Int
    let name: String
    let scope: String
    var color: String = "#6366f1"
}

struct KomptaUser: Codable, Identifiable {
    let id: Int
    let email: String
    let full_name: String
    let role: String
    let company_id: Int
    /// True right after an admin-issued temporary password or a fresh
    /// employee/group-member account — gates the whole app behind
    /// ActivationView until the user sets their own password.
    let must_change_password: Bool
    var phone: String?
    var address: String?
    var has_avatar: Bool?
    var last_login_ip: String?
    var last_login_city: String?
    var custom_role: UserCustomRole?
    var permissions: [String]?
    var totp_enabled: Bool?

    var displayName: String { full_name }
    var firstName: String { full_name.components(separatedBy: " ").first ?? email }
    var initials: String {
        let parts = full_name.components(separatedBy: " ").prefix(2)
        return parts.compactMap { $0.first }.map(String.init).joined().uppercased()
    }
    /// Lands in the platform admin console (super_admin OR an admin-scoped custom role).
    var isPlatformAdmin: Bool { role == "super_admin" || custom_role?.scope == "admin" }
    /// Effective admin permissions ("*" when super_admin = all).
    var adminPermissions: Set<String> {
        if role == "super_admin" { return ["*"] }
        return Set(permissions ?? [])
    }
}

// MARK: - Company

struct KomptaCompany: Codable, Identifiable {
    let id: Int
    let name: String
    let country: String?
    let industry: String?
    let primary_color: String?
    let accent_color: String?
    let legal_name: String?
    let organization_type: String?
    let completion_score: Int?
    let teras_score: Int?
    let cash_low_threshold_cents: Int?
    let legal_form: String?
    let rccm: String?
    let niu: String?
    let cnss_number: String?
    let patente_number: String?
    let tax_regime: String?
    let share_capital: String?
    let founded_date: String?
    let address: String?
    let city: String?
    let phone: String?
    let email: String?
    let website: String?
    let manager_name: String?
    let manager_title: String?
    let bank_name: String?
    let bank_account: String?
    let has_logo: Bool?

    var initial: String { String(name.prefix(1)).uppercased() }
    /// Alias kept for call sites written against the older "secondary_color" name.
    var secondary_color: String? { accent_color }
}

struct CompanyUpdatePayload: Encodable {
    var name: String?
    var legal_name: String?
    var industry: String?
    var organization_type: String?
    var country: String?
    var primary_color: String?
    var accent_color: String?
    var cash_low_threshold_cents: Int?
    var legal_form: String?
    var rccm: String?
    var niu: String?
    var cnss_number: String?
    var patente_number: String?
    var tax_regime: String?
    var share_capital: String?
    var founded_date: String?
    var address: String?
    var city: String?
    var phone: String?
    var email: String?
    var website: String?
    var manager_name: String?
    var manager_title: String?
    var bank_name: String?
    var bank_account: String?
}

// MARK: - Product

struct Product: Codable, Identifiable {
    let id: Int
    let name: String
    let price: Double
    let stock_quantity: Int
    let category: String?
    let sku: String?
    let brand: String?
    let variant: String?
    let reorder_level: Int?

    /// Alias for views written against the older Double-based stock field.
    var stock_qty: Double? { Double(stock_quantity) }
    var reorderLevel: Int { reorder_level ?? 5 }
    var stockValue: Double { price * Double(stock_quantity) }
    var isLow: Bool { stock_quantity <= reorderLevel }
}

/// Create/update payload mirroring backend `ProductBase`.
struct ProductPayload: Encodable {
    var name: String
    var sku: String
    var category: String = "Général"
    var brand: String = "KOMPTA"
    var variant: String = "Standard"
    var price: Double = 0
    var stock_quantity: Int = 0
    var reorder_level: Int = 5
}

/// A stock movement create payload (`/inventory/movements`).
struct InventoryMovementPayload: Encodable {
    var product_id: Int
    var movement_type: String   // "in" | "out"
    var quantity: Int
    var reason: String = ""
    var reference: String = ""
}

/// Limule inventory AI report (`/inventory/report/ai`).
struct InventoryReportAI: Codable {
    let content: String
    let generated_at: String?
}

// MARK: - Sale

struct SalePayload: Encodable {
    let items: [SaleItemPayload]
    let payment_method: String
    var payment_account_id: Int?
    let discount_percent: Double
    let tva_enabled: Bool
    let tax_rate: Double
}

struct SaleItemPayload: Encodable {
    let product_id: Int
    let quantity: Int
}

struct SaleLineItem: Decodable {
    let product_id: Int
    let name: String
    let quantity: Int
    let total: Double
}

struct SaleResponse: Decodable {
    let id: Int
    let receipt_number: String?
    let total_amount: Double
    let payment_method: String?
    let payment_account_label: String?
    let items: [SaleLineItem]?

    var total: Double { total_amount }
}

struct CartItem: Identifiable {
    let id = UUID()
    let product: Product
    var quantity: Double
    var unitPrice: Double
    var total: Double { quantity * unitPrice }
}

// MARK: - Dashboard

struct DashboardOverview: Decodable {
    let company: String
    let kpis: [String: Double]
    let low_stock: [LowStockItem]
    let compliance: ComplianceSnapshot?

    var employees: Int { Int(kpis["employees"] ?? 0) }
    var products: Int { Int(kpis["products"] ?? 0) }
    var salesTotal: Double { kpis["sales_total"] ?? 0 }
    var treasuryBalance: Double { kpis["tx_balance"] ?? 0 }
    var openTasks: Int { Int(kpis["open_tasks"] ?? 0) }
    var terasScore: Int { Int(kpis["teras_score"] ?? 0) }

    // Extended KPIs (mirrors the web dashboard)
    var txCount: Int { Int(kpis["tx_count"] ?? 0) }
    var txMonthlyIn: Double { kpis["tx_monthly_in"] ?? 0 }
    var txMonthlyOut: Double { kpis["tx_monthly_out"] ?? 0 }
    var invoicesTotal: Double { kpis["invoices_total"] ?? 0 }
    var invoicesPaid: Double { kpis["invoices_paid"] ?? 0 }
    var invoicesPending: Double { kpis["invoices_pending"] ?? 0 }
    var invoicesPaidCount: Int { Int(kpis["invoices_paid_count"] ?? 0) }

    /// Treasury: real bank balance if transactions exist, else POS sales total.
    var treasury: Double { txCount > 0 ? treasuryBalance : salesTotal }
}

struct ComplianceSnapshot: Decodable {
    let checks: [ComplianceCheck]
}

struct ComplianceCheck: Decodable, Identifiable, Hashable {
    var id: String { label }
    let label: String
    let status: String   // "ok" | "warning"
}

struct LowStockItem: Decodable, Identifiable {
    let id: Int
    let name: String
    let stock_quantity: Int
}

struct RevenueSeriesPoint: Decodable {
    let label: String
    let revenue: Double
    let margin: Double
}

// MARK: - Employee

struct Employee: Codable, Identifiable {
    let id: Int
    let first_name: String
    let last_name: String
    let email: String
    let phone: String
    let job_title: String
    let department: String
    let status: String
    var salary: Double = 0

    var full_name: String { "\(first_name) \(last_name)" }
    var position: String? { job_title }
    var isActive: Bool { status == "active" }
    var initials: String {
        full_name.components(separatedBy: " ")
            .prefix(2).compactMap { $0.first }.map(String.init).joined().uppercased()
    }
}

struct EmployeesPage: Decodable {
    let items: [Employee]
    let total: Int
}

struct EmployeePayload: Encodable {
    var first_name: String
    var last_name: String
    var email: String
    var phone: String = ""
    var job_title: String
    var department: String = "Operations"
    var employment_type: String = "CDI"
    var salary: Double = 0
    var status: String = "active"
}

/// Quick-create payload that also provisions a login account (returns the
/// generated identifier + temporary password).
struct EmployeeQuickCreatePayload: Encodable {
    var first_name: String
    var last_name: String
    var job_title: String
    var phone: String = ""
    var email: String = ""
    var employment_type: String = "CDI"
    var department: String = "Operations"
    var branch: String = "Siege"
    var salary: Double = 0
    var access_role: String = "employe"
    var payout_method: String = "mobile_money"
    var payout_phone: String = ""
}

/// Result of provisioning an employee account — the temp password is shown once.
struct EmployeeProvisioningResult: Codable {
    let employee: Employee
    let login_identifier: String
    let temporary_password: String
    let account_status: String
    let must_change_password: Bool
    let access_note: String
}

struct EmployeeAccountInfo: Codable {
    let employee_id: Int
    let user_id: Int?
    let login_identifier: String
    let phone: String
    let role: String
    let account_status: String
    let must_change_password: Bool
    let has_active_temporary_credential: Bool
}

// MARK: - App Notification (aggregated activity feed)

struct AppNotification: Identifiable {
    let id: UUID
    let title: String
    let subtitle: String
    let icon: String
    let tint: String     // "red" | "orange" | "blue" | "green" | "purple"
    let moduleId: String // for deep-link
    var isRead: Bool

    init(id: UUID = UUID(), title: String, subtitle: String, icon: String, tint: String, moduleId: String) {
        self.id = id; self.title = title; self.subtitle = subtitle
        self.icon = icon; self.tint = tint; self.moduleId = moduleId; self.isRead = false
    }
}

// MARK: - AI Chat (Limule)

struct ChatMessage: Identifiable {
    let id = UUID()
    var apiId: Int?
    let role: String         // "user" | "assistant"
    let content: String
    var module: String?
    var intent: String?
    var sources: [String]
    var signals: [LimuleSignal]
    var confidence: Int?

    var isUser: Bool { role == "user" }

    init(
        role: String,
        content: String,
        apiId: Int? = nil,
        module: String? = nil,
        intent: String? = nil,
        sources: [String] = [],
        signals: [LimuleSignal] = [],
        confidence: Int? = nil
    ) {
        self.role = role
        self.content = content
        self.apiId = apiId
        self.module = module
        self.intent = intent
        self.sources = sources
        self.signals = signals
        self.confidence = confidence
    }
}

struct LimuleChatRequest: Encodable {
    let prompt: String
    let page_path: String
    var module: String? = nil
    let conversation_history: [[String: String]]?
}

struct LimuleChatResponse: Decodable {
    let answer: String
}
