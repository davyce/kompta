import Foundation

// ============================================================================
//  AdminModels — Codable types mirroring backend Admin routes, spread across
//  app/api/routes.py, routes_admin_analytics.py, routes_extra.py (Limule),
//  routes_subscriptions.py, services/readiness.py, services/subscriptions.py.
//  Super-admin only surface ("Admin" hub).
// ============================================================================

// MARK: - Overview

struct AdminOverview: Codable {
    let companies: Int
    let users: Int
    let employees: Int
    let invoices: Int
    let tickets_open: Int
    let tickets_critical: Int
    let alerts_open: Int
    let sales_total: Double
}

// MARK: - Companies

struct AdminCompanyRow: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let legal_name: String?
    let industry: String?
    let country: String?
    let completion_score: Double?
    let teras_score: Double?
    let users_count: Int
    let employees_count: Int
    let created_at: String
}

struct AdminAlert: Codable, Identifiable, Hashable {
    let id: Int
    let title: String
    let severity: String
    let status: String
    let module: String
}

struct AdminCompanyDetailInfo: Codable, Hashable {
    let id: Int
    let name: String
    let legal_name: String?
    let industry: String?
    let country: String?
    let completion_score: Double?
    let teras_score: Double?
}

struct AdminCompanyDetailUser: Codable, Identifiable, Hashable {
    let id: Int
    let email: String
    let full_name: String
    let role: String
    let account_status: String
}

struct AdminCompanyDetailStats: Codable, Hashable {
    let invoices: Int
    let sales_total: Double
    let users_count: Int
}

struct AdminCompanyDetail: Codable {
    let company: AdminCompanyDetailInfo
    let users: [AdminCompanyDetailUser]
    let stats: AdminCompanyDetailStats
    let alerts: [AdminAlert]
}

// MARK: - Users

struct AdminUserRow: Codable, Identifiable, Hashable {
    let id: Int
    let email: String
    let full_name: String
    let role: String
    let department: String?
    let branch: String?
    let account_status: String
    let must_change_password: Bool
    let company_id: Int?
    let company_name: String?
    var phone: String?
    var address: String?
    var has_avatar: Bool?
    let last_login_at: String?
    var last_login_ip: String?
    var last_login_city: String?
    var custom_role: UserCustomRole?
    let created_at: String
}

struct AccountStatusPayload: Encodable {
    var account_status: String
}

struct AccountStatusResult: Codable {
    let id: Int
    let account_status: String
}

// MARK: - Tickets (mirrors backend Pydantic TicketRead/TicketCreate/TicketUpdate/TicketReplyCreate)

struct AdminTicketMessage: Codable, Identifiable, Hashable {
    let id: Int
    let ticket_id: Int
    let author_user_id: Int?
    let author_name: String
    let body: String
    let is_staff: Bool
    let created_at: String
}

struct AdminTicket: Codable, Identifiable, Hashable {
    let id: Int
    let subject: String
    let body: String
    let status: String
    let priority: String
    let category: String
    let company_id: Int?
    let company_name: String
    let requester_user_id: Int?
    let requester_name: String
    let assignee_user_id: Int?
    let resolved_at: String?
    let created_at: String
    let updated_at: String
    let messages: [AdminTicketMessage]
}

struct AdminTicketCreatePayload: Encodable {
    var subject: String
    var body: String = ""
    var priority: String = "medium"
    var category: String = "general"
}

struct AdminTicketUpdatePayload: Encodable {
    var status: String? = nil
    var priority: String? = nil
    var category: String? = nil
    var assignee_user_id: Int? = nil
}

struct AdminTicketReplyPayload: Encodable {
    var body: String
}

// MARK: - Audit logs

struct AdminAuditLogEntry: Codable, Identifiable, Hashable {
    let id: Int
    let actor_user_id: Int?
    let actor_name: String?
    let target_user_id: Int?
    let target_name: String?
    let action: String
    let details: String?
    let company_id: Int?
    let created_at: String
}

// MARK: - Platform analytics

struct AdminIndustryCount: Codable, Identifiable, Hashable {
    var id: String { industry }
    let industry: String
    let count: Int
}

struct AdminCountryCount: Codable, Identifiable, Hashable {
    var id: String { country }
    let country: String
    let count: Int
}

struct AdminMonthlyGrowth: Codable, Identifiable, Hashable {
    var id: String { month }
    let month: String
    let companies: Int
    let users: Int
    let revenue: Double
}

struct PlatformAnalytics: Codable {
    let companies_total: Int
    let companies_active_30d: Int
    let users_total: Int
    let new_companies_this_month: Int
    let new_users_this_month: Int
    let total_revenue_platform: Double
    let total_sales_platform: Double
    let avg_teras_score: Double?
    let companies_by_industry: [AdminIndustryCount]
    let companies_by_country: [AdminCountryCount]
    let monthly_growth: [AdminMonthlyGrowth]
}

struct AdminActivityEvent: Codable, Identifiable, Hashable {
    var id: String { "\(type)-\(rawId)-\(created_at)" }
    let rawId: Int
    let type: String
    let company_name: String?
    let user_name: String?
    let amount: Double?
    let created_at: String

    private enum CodingKeys: String, CodingKey {
        case rawId = "id"
        case type, company_name, user_name, amount, created_at
    }
}

// MARK: - Broadcast

struct BroadcastPayload: Encodable {
    var title: String
    var message: String
    var type: String = "info"
    var target: String = "all"
    /// Sélection multiple d'entreprises ("équipes") — prime sur `target` côté
    /// backend quand fournie et non vide.
    var target_company_ids: [Int]? = nil
    /// Sélection d'utilisateurs individuels — prime sur tous les champs de
    /// ciblage entreprise côté backend quand fournie et non vide.
    var target_user_ids: [Int]? = nil
}

struct BroadcastResult: Codable {
    let sent_to: Int
    let message: String
}

// MARK: - Impersonation / reset password / company status

struct ImpersonateResult: Codable {
    let token: String
    let user_id: Int
    let user_email: String
}

struct ResetPasswordResult: Codable {
    let temp_password: String
    let user_id: Int
    let must_change_password: Bool
    let message: String
}

struct CompanyStatusPayload: Encodable {
    var status: String
}

struct CompanyStatusResult: Codable {
    let id: Int
    let name: String
    let status: String
    let industry: String?
    let country: String?
    let updated_at: String
}

// MARK: - Feature flags

struct FeatureFlag: Codable, Identifiable, Hashable {
    let id: Int
    let key: String
    let value: String
    let description: String
    let enabled: Bool
    let created_at: String
    let updated_at: String
}

struct FeatureFlagCreatePayload: Encodable {
    var key: String
    var value: String = ""
    var description: String = ""
    var enabled: Bool = true
}

struct FeatureFlagUpdatePayload: Encodable {
    var value: String? = nil
    var description: String? = nil
    var enabled: Bool? = nil
}

struct FeatureFlagDeleteResult: Codable {
    let deleted: Bool
    let key: String
}

// MARK: - System health

struct AdminServiceStatus: Codable, Identifiable, Hashable {
    var id: String { name }
    let name: String
    let status: String
    let latency_ms: Double?
    let error: String?
    let note: String?
    let target_environment: String?
    let disk_used_mb: Double?
    let disk_free_mb: Double?

    private enum CodingKeys: String, CodingKey {
        case name, status, latency_ms, error, note, target_environment, disk_used_mb, disk_free_mb
    }
}

struct SystemHealthResponse: Codable {
    let status: String
    let services: [AdminServiceStatus]
    let version: String
    let environment: String
    let database: String
    let updated_at: String
    let uptime_seconds: Double?
}

// MARK: - Preflight

struct PreflightCheck: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let status: String
    let detail: String
    let action: String
    let priority: String
}

struct PreflightSection: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let status: String
    let items: [PreflightCheck]
}

struct PreflightReport: Codable {
    let status: String
    let score: Int
    let environment: String
    let generated_at: String
    let sections: [PreflightSection]
    let failures: [PreflightCheck]
    let warnings: [PreflightCheck]
    let next_actions: [String]
}

// MARK: - Onboarding stats

struct OnboardingStatRow: Codable, Identifiable, Hashable {
    let company_id: Int
    var id: Int { company_id }
    let company_name: String
    let completion_score: Double?
    let has_employees: Bool
    let has_invoices: Bool
    let has_sales: Bool
    let has_documents: Bool
    let last_activity: String?
}

// MARK: - Test email / email status

struct TestEmailPayload: Encodable {
    var to: String
}

struct TestEmailResult: Codable {
    let sent: Bool
    let message: String
}

struct EmailStatus: Codable {
    let enabled: Bool
    let host: String?
    let port: Int?
    let fromAddress: String?
    let from_name: String?
    let tls: Bool?
    let provider: String

    private enum CodingKeys: String, CodingKey {
        case enabled, host, port, from_name, tls, provider
        case fromAddress = "from"
    }
}

// MARK: - Limule insights / Grand Sage / dataset

struct AdminLimuleByModule: Codable, Identifiable, Hashable {
    var id: String { module }
    let module: String
    let count: Int
}

struct AdminLimuleByIntent: Codable, Identifiable, Hashable {
    var id: String { intent }
    let intent: String
    let count: Int
}

struct AdminLimuleRecentInteraction: Codable, Identifiable, Hashable {
    let id: Int
    let company: String?
    let module: String?
    let intent: String?
    let prompt: String
    let tags: [String]
    let created_at: String
}

struct AdminLimuleInsights: Codable {
    let total_interactions: Int
    let last_7_days: Int
    let rated: Int
    let avg_rating: Double?
    let training_ready: Int
    let by_module: [AdminLimuleByModule]
    let by_intent: [AdminLimuleByIntent]
    let recent: [AdminLimuleRecentInteraction]
}

struct AdminLimuleChatPayload: Encodable {
    var prompt: String
}

struct AdminLimuleSignal: Codable, Identifiable, Hashable {
    var id: String { "\(label)-\(module ?? "")" }
    let label: String
    let severity: String
    let module: String?
    let value: String?   // backend may send a number or a string

    enum CodingKeys: String, CodingKey { case label, severity, module, value }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        label = try c.decode(String.self, forKey: .label)
        severity = try c.decode(String.self, forKey: .severity)
        module = try c.decodeIfPresent(String.self, forKey: .module)
        if let s = try? c.decode(String.self, forKey: .value) { value = s }
        else if let i = try? c.decode(Int.self, forKey: .value) { value = String(i) }
        else if let d = try? c.decode(Double.self, forKey: .value) { value = String(d) }
        else { value = nil }
    }
}

struct AdminLimuleKpis: Codable, Hashable {
    let companies: Int
    let users: Int
    let employees: Int
    let sales_total: Double
    let tickets_open: Int
    let tickets_critical: Int
    let alerts_open: Int
    let avg_teras: Double?
    let limule_interactions: Int
}

struct AdminLimuleChatResponse: Codable {
    let interaction_id: Int?
    let answer: String
    let sources: [String]
    let signals: [AdminLimuleSignal]
    let kpis: AdminLimuleKpis
}

struct AdminLimuleDatasetCompany: Codable, Hashable {
    let id: Int
    let name: String
    let industry: String?
    let country: String?
}

struct AdminLimuleDatasetRecord: Codable, Identifiable, Hashable {
    let id: Int
    let company: AdminLimuleDatasetCompany?
    let module: String?
    let intent: String?
    let input: String?
    let output: String?
    let rating: Int?
    let feedback: String?
    let created_at: String
}

// MARK: - Subscriptions: plans

struct SubscriptionPlan: Codable, Identifiable, Hashable {
    let id: Int
    let code: String
    let name: String
    let description: String
    let price_cents: Int
    let currency: String
    let period: String
    let features: [String]
    var included_modules: [String] = []
    var max_users: Int = 0
    let trial_days: Int
    let is_active: Bool
    let sort_order: Int
}

struct PlanUpsertPayload: Encodable {
    var code: String
    var name: String
    var description: String = ""
    var price_cents: Int = 0
    var currency: String = "XAF"
    var period: String = "month"
    var features: [String] = []
    var included_modules: [String] = []
    var max_users: Int = 0
    var trial_days: Int = 0
    var is_active: Bool = true
    var sort_order: Int = 0
}

// Droits d'accès effectifs d'une entreprise (essai / plan).
struct Entitlements: Codable {
    let status: String
    let plan_code: String
    let trialing: Bool
    let trial_days_left: Int
    let soft_warning: Bool
    let period_end: String?
    let allowed_modules: [String]?   // nil = tous (essai)
    let max_users: Int
    let locked: Bool
}

// MARK: - Subscription checkout (ex: activation du forfait Standard gratuit)

struct SubscriptionCheckoutPayload: Encodable {
    let plan_code: String
    let method: String
    let promo_code: String = ""
    let payer_phone: String = ""
}

struct SubscriptionCheckoutResult: Codable {
    let status: String
    let free: Bool?
    let current_period_end: String?
}

// Méthode d'encaissement déclarée par l'entreprise (CEMAC).
struct CollectionMethod: Codable, Identifiable, Hashable {
    let id: Int
    let provider: String
    var label: String
    var enabled: Bool
    var merchant_number: String
    var account_name: String
    var bank_name: String
    var bank_account: String
    var instructions: String
    var verified: Bool
    let verified_at: String?
    let last_test_status: String
}

struct CollectionMethodsResponse: Codable {
    let methods: [CollectionMethod]
    let can_collect: Bool
}

// MARK: - Apple In-App Purchase (StoreKit 2)

/// Payload envoyé au backend après un achat StoreKit 2 réussi (ou un
/// renouvellement capté par `Transaction.updates`).
struct AppleVerifyPayload: Encodable {
    var signed_transaction: String
    var plan_code: String = ""
}

/// Réponse du backend après vérification + activation de l'abonnement.
struct AppleVerifyResult: Codable {
    let transaction_id: Int
    let status: String
    let plan_code: String
}

// Employabilité (TERAS)
struct EmployabilityCheck: Codable {
    let id: Int
    let employee_id: Int
    let status: String
    let score: Int
    let result_summary: String
}
struct EmployabilityPayload: Encodable { let employee_id: Int; let include_documents: Bool }

// Limule — chat sur un document existant
struct LimuleDocChatTurn: Codable { let role: String; let content: String }
struct LimuleDocChatPayload: Encodable { let prompt: String; let conversation_history: [LimuleDocChatTurn] }
struct LimuleDocChatResponse: Codable { let response: String }

// Import CSV (résultat tolérant — on ignore les clés non listées)
struct CsvImportResult: Codable {
    var imported: Int?
    var created: Int?
    var updated: Int?
    var skipped: Int?
    var message: String?
    var importedCount: Int { imported ?? created ?? 0 }
}

// 2FA / TOTP
struct TotpSetup: Codable { let secret: String; let qr_uri: String }
struct TotpResult: Codable { let totp_enabled: Bool }
struct TotpCodePayload: Encodable { let code: String }

struct CollectionMethodPayload: Encodable {
    var provider: String
    var label: String = ""
    var enabled: Bool = true
    var merchant_number: String = ""
    var account_name: String = ""
    var bank_name: String = ""
    var bank_account: String = ""
    var instructions: String = ""
}

struct PlanDeleteResult: Codable {
    let deleted: Bool
    let deactivated: Bool?
    let reason: String?
}

// MARK: - Subscriptions: promotions

struct Promotion: Codable, Identifiable, Hashable {
    let id: Int
    let code: String
    let description: String
    let percent_off: Int
    let is_active: Bool
    let starts_at: String?
    let ends_at: String?
    let plan_code: String?
    let max_redemptions: Int
    let times_redeemed: Int
}

struct PromoUpsertPayload: Encodable {
    var code: String
    var description: String = ""
    var percent_off: Int = 0
    var is_active: Bool = true
    var starts_at: String? = nil
    var ends_at: String? = nil
    var plan_code: String = ""
    var max_redemptions: Int = 0
}

struct PromoDeleteResult: Codable {
    let deleted: Bool
}

// MARK: - Subscriptions: companies

struct CompanySubscriptionRow: Codable, Identifiable, Hashable {
    var id: Int { company_id }
    let company_id: Int
    let company_name: String
    let company_status: String
    let status: String?
    let plan_code: String?
    let current_period_end: String?
    var admin_granted: Bool = false
    var admin_granted_note: String = ""
}

struct SuspendResult: Codable {
    let company_id: Int
    let company_status: String
}

struct GrantRequestPayload: Encodable {
    var plan_code: String
    var days: Int = 30
    var unlimited: Bool = false
    var note: String = ""
}

struct GrantResult: Codable {
    let company_id: Int
    let status: String
    let current_period_end: String?
    var admin_granted: Bool = false
    var unlimited: Bool = false
}
