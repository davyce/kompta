import Foundation

// ============================================================================
//  GroupModels — Codable types mirroring backend app/api/routes_groups*.py
//  Covers "Groupes & Tontines" (associations, tontines, coopératives): the
//  multi-tenant group/org feature ported from the web app's /groups routes.
// ============================================================================

// MARK: - OrgGroup

struct OrgGroup: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let type: String
    let description: String
    let country: String
    let city: String
    let address: String
    let currency: String
    let linked_company_id: Int?
    let status: String
    let is_active: Bool
    let created_at: String
    var member_count: Int?
    var my_roles: [String]?
    var can_manage: Bool?
}

struct GroupPayload: Encodable {
    var name: String
    var type: String = "association"
    var description: String = ""
    var country: String = "Congo"
    var city: String = ""
    var address: String = ""
    var currency: String = "XAF"
}

struct GroupUpdatePayload: Encodable {
    var name: String?
    var description: String?
    var city: String?
    var address: String?
    var status: String?
}

// MARK: - Members

struct GroupMember: Codable, Identifiable, Hashable {
    let id: Int
    let full_name: String
    let phone: String
    let email: String
    let date_of_birth: String?
    let zone: String
    let profession: String
    let member_number: String
    let status: String
    let is_active: Bool
    let roles: [String]
}

struct GroupMemberPayload: Encodable {
    var full_name: String
    var phone: String = ""
    var email: String = ""
    var zone: String = ""
    var profession: String = ""
    var member_number: String = ""
}

// MARK: - Finance dashboard

struct GroupFinanceDashboard: Codable {
    let balance: Double
    let total_contributions_expected: Double
    let total_contributions_received: Double
    let total_expenses: Double
    let members_count: Int
    let members_up_to_date: Int
    let members_late: Int
    let pending_expenses: Int
}

// MARK: - Contribution plans & payments

struct ContributionPlan: Codable, Identifiable, Hashable {
    let id: Int
    let title: String
    let frequency: String
    let amount: Double
    let currency: String
    let due_day: Int?
    let start_date: String?
    let end_date: String?
    let is_mandatory: Bool
    let status: String
    let target_amount: Double
}

struct ContributionPlanPayload: Encodable {
    var title: String
    var description: String = ""
    var amount: Double
    var currency: String = "XAF"
    var frequency: String = "mensuelle"
}

struct ContributionPayment: Codable, Identifiable, Hashable {
    let id: Int
    let member_id: Int
    let member_name: String
    let plan_id: Int
    let plan_title: String
    let amount_due: Double
    let amount_paid: Double
    let late_fee: Double
    let payment_date: String?
    let due_date: String?
    let payment_method: String
    let status: String
    let validated_at: String?
    let journal_entry_id: Int?
}

struct ContributionPaymentPayload: Encodable {
    var member_id: Int
    var plan_id: Int
    var amount_paid: Double
    var payment_method: String = "cash"
}

// MARK: - Transactions & expenses

struct GroupTransaction: Codable, Identifiable, Hashable {
    let id: Int
    let type: String
    let category: String
    let amount: Double
    let currency: String
    let description: String
    let transaction_date: String?
    let payment_method: String
    let status: String
}

struct GroupExpense: Codable, Identifiable, Hashable {
    let id: Int
    let title: String
    let category: String
    let amount: Double
    let currency: String
    let expense_date: String?
    let paid_to: String
    let payment_method: String
    let status: String
    let approved_at: String?
    let journal_entry_id: Int?
}

struct GroupExpensePayload: Encodable {
    var title: String
    var category: String = ""
    var amount: Double
    var currency: String = "XAF"
    var paid_to: String = ""
    var payment_method: String = "cash"
}

// MARK: - Meetings, activities & calendar

struct GroupMeeting: Codable, Identifiable, Hashable {
    let id: Int
    let title: String
    let description: String
    let location: String
    let start_datetime: String
    let end_datetime: String?
    let meeting_type: String
    let agenda: String
    let minutes: String?
    let status: String
    let reminder_enabled: Bool
    let created_at: String
}

struct GroupMeetingPayload: Encodable {
    var title: String
    var description: String = ""
    var location: String = ""
    var start_datetime: String
    var end_datetime: String? = nil
    var meeting_type: String = "ordinaire"
    var agenda: String = ""
}

struct GroupCalendarEvent: Codable, Identifiable, Hashable {
    var id: String { "\(type)-\(eventId ?? 0)-\(start ?? "")" }
    let type: String
    let title: String
    let start: String?
    let end: String?
    let location: String?
    let status: String?
    let daysUntil: Int?

    private enum CodingKeys: String, CodingKey {
        case type, title, start, end, location, status
        case eventId = "id"
        case daysUntil = "days_until"
    }
    let eventId: Int?
}

struct GroupCalendarResponse: Codable {
    let group_id: Int
    let events: [GroupCalendarEvent]
}

struct GroupBirthday: Codable, Identifiable, Hashable {
    var id: Int { member_id }
    let member_id: Int
    let member_name: String
    let start: String
    let title: String
    let days_until: Int
}

// MARK: - Votes

struct GroupVote: Codable, Identifiable, Hashable {
    let id: Int
    let title: String
    let description: String?
    let options: [String]
    let start_datetime: String
    let end_datetime: String
    let status: String
    let created_at: String
}

struct GroupVotePayload: Encodable {
    var title: String
    var description: String = ""
    var options: [String]
    var start_datetime: String
    var end_datetime: String
    var visibility: String = "members"
}

struct GroupVoteSubmitPayload: Encodable {
    var selected_option: String
}

// MARK: - Chat

struct GroupChatRoom: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let type: String
    let created_at: String
}

struct GroupRoomPayload: Encodable {
    var name: String
    var room_type: String = "general"
}

struct GroupChatMessage: Codable, Identifiable, Hashable {
    let id: Int
    let room_id: Int
    let sender_name: String
    let content: String
    let message_type: String
    let media_url: String?
    let gif_url: String?
    let reply_to_id: Int?
    let pinned: Bool
    let created_at: String
    let edited_at: String?
    let deleted_at: String?
}

struct GroupMessagePayload: Encodable {
    var content: String = ""
    var message_type: String = "text"
}

// MARK: - Documents

struct GroupDocument: Codable, Identifiable, Hashable {
    let id: Int
    let title: String
    let filename: String
    let category: String
    let visibility: String
    let size_bytes: Int
    let mime_type: String
    let created_at: String
}

// MARK: - Leadership & roles

struct GroupLeadershipEntry: Codable, Identifiable, Hashable {
    let id: Int
    let president_member_id: Int?
    let vice_president_member_id: Int?
    let secretary_member_id: Int?
    let treasurer_member_id: Int?
    let mandate_start: String?
    let mandate_end: String?
    let elected_by: String
    let is_current: Bool
}

struct GroupLeadershipResponse: Codable {
    let current: GroupLeadershipEntry?
    let history: [GroupLeadershipEntry]
}

struct GroupLeadershipPayload: Encodable {
    var president_member_id: Int?
    var vice_president_member_id: Int?
    var secretary_member_id: Int?
    var treasurer_member_id: Int?
    var elected_by: String = ""
}

struct GroupRole: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let permissions: [String]
}

// MARK: - AI assistant

struct GroupAIAnswer: Codable { let answer: String }
struct GroupAISummary: Codable { let summary: String; let message_count: Int? }
struct GroupAIReport: Codable { let report_type: String; let content: String }
struct GroupAIAnalysis: Codable { let analysis: String }
struct GroupAIReminder: Codable { let message: String; let member_name: String; let source: String }

struct GroupAIAskPayload: Encodable { var question: String }
struct GroupAISummarizePayload: Encodable { var messages: [String]; var extract_tasks: Bool = true }
struct GroupAIReportPayload: Encodable { var report_type: String = "monthly" }
struct GroupAIReminderPayload: Encodable {
    var member_name: String; var amount_due: Double; var plan_title: String; var tone: String = "poli"
}

// MARK: - Reports

struct GroupPaymentsReportRow: Codable, Identifiable, Hashable {
    var id: String { "\(member)-\(plan)" }
    let member: String
    let plan: String
    let amount_due: Double
    let amount_paid: Double
    let balance: Double
    let status: String
    let payment_date: String?
}

struct GroupPaymentsReport: Codable {
    let group: String
    let currency: String
    let generated_at: String
    let total_due: Double
    let total_paid: Double
    let recovery_rate: Double
    let rows: [GroupPaymentsReportRow]
}

struct GroupExpensesReportRow: Codable, Identifiable, Hashable {
    let id: Int
    let title: String
    let category: String
    let amount: Double
    let date: String?
    let status: String
    let paid_to: String
}

struct GroupExpensesReport: Codable {
    let group: String
    let currency: String
    let generated_at: String
    let total: Double
    let by_category: [String: Double]
    let rows: [GroupExpensesReportRow]
}
