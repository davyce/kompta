import Foundation

// MARK: - Errors

enum APIError: LocalizedError {
    case invalidURL
    case unauthorized
    case notFound
    case serverError(Int, String)
    case decodingError(Error)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:              return "URL invalide"
        case .unauthorized:            return "Session expirée — reconnectez-vous"
        case .notFound:                return "Ressource introuvable"
        case .serverError(let c, let m): return "Erreur \(c) : \(m)"
        case .decodingError(let e):    return "Données invalides : \(e.localizedDescription)"
        case .networkError(let e):     return "Réseau : \(e.localizedDescription)"
        }
    }
}

// MARK: - Client

actor APIClient {
    static let shared = APIClient()
    private init() {}

    // Override via Settings → API URL
    private var baseURL: String {
        UserDefaults.standard.string(forKey: "api_base_url") ?? "https://kompta0.com/api"
    }

    // In-memory cache so Keychain failures (e.g. locked keybag on some simulators) don't break the session.
    private var _tokenCache: String? = KeychainHelper.get("auth_token")
    private var token: String? { _tokenCache }

    func setToken(_ t: String) { _tokenCache = t; KeychainHelper.set(t, key: "auth_token") }
    func clearToken()          { _tokenCache = nil; KeychainHelper.delete("auth_token") }

    // MARK: Generic request builders

    private func request(_ path: String, method: String = "GET", body: Data? = nil) throws -> URLRequest {
        guard let url = URL(string: baseURL + path) else { throw APIError.invalidURL }
        var r = URLRequest(url: url, timeoutInterval: 30)
        r.httpMethod = method
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let t = token { r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        r.httpBody = body
        return r
    }

    private func perform(_ request: URLRequest) async throws -> Data {
        let (data, resp) = try await URLSession.shared.data(for: request)
        guard let http = resp as? HTTPURLResponse else { return data }
        switch http.statusCode {
        case 200..<300: return data
        case 401: throw APIError.unauthorized
        case 404: throw APIError.notFound
        default:
            let msg = (try? JSONDecoder().decode([String: String].self, from: data)["detail"]) ?? "Erreur serveur"
            throw APIError.serverError(http.statusCode, msg)
        }
    }

    private func decode<T: Decodable>(_ data: Data, as type: T.Type = T.self) throws -> T {
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw APIError.decodingError(error) }
    }

    func get<T: Decodable>(_ path: String) async throws -> T {
        let data = try await perform(try request(path))
        return try decode(data)
    }

    func rawData(_ path: String) async throws -> Data {
        try await perform(try request(path))
    }

    func post<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        let bodyData = try JSONEncoder().encode(body)
        let data = try await perform(try request(path, method: "POST", body: bodyData))
        return try decode(data)
    }

    func put<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        let data = try await perform(try request(path, method: "PUT", body: try JSONEncoder().encode(body)))
        return try decode(data)
    }

    func patch<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        let data = try await perform(try request(path, method: "PATCH", body: try JSONEncoder().encode(body)))
        return try decode(data)
    }

    /// POST/PATCH with a body but no decoded response needed.
    func send<B: Encodable>(_ path: String, method: String = "POST", body: B) async throws {
        _ = try await perform(try request(path, method: method, body: try JSONEncoder().encode(body)))
    }

    /// POST with no body (action endpoints).
    func action(_ path: String, method: String = "POST") async throws {
        _ = try await perform(try request(path, method: method))
    }

    /// POST with no body, decoding a response.
    func actionDecoded<T: Decodable>(_ path: String, method: String = "POST") async throws -> T {
        let data = try await perform(try request(path, method: method))
        return try decode(data)
    }

    func delete(_ path: String) async throws {
        _ = try await perform(try request(path, method: "DELETE"))
    }

    func deleteDecoded<T: Decodable>(_ path: String) async throws -> T {
        let data = try await perform(try request(path, method: "DELETE"))
        return try decode(data)
    }

    // MARK: - Multipart upload (file fields)

    /// Builds and performs a multipart/form-data POST. `fields` are plain text
    /// form fields; `fileField`/`fileData`/`fileName`/`mime` describe the file part.
    private func multipartRequest(_ path: String, fields: [String: String],
                                  fileField: String, fileData: Data,
                                  fileName: String, mime: String) throws -> URLRequest {
        guard let url = URL(string: baseURL + path) else { throw APIError.invalidURL }
        var r = URLRequest(url: url, timeoutInterval: 60)
        r.httpMethod = "POST"
        let boundary = "Boundary-\(UUID().uuidString)"
        r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let t = token { r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        var body = Data()
        let dd = "--\(boundary)\r\n"
        for (k, v) in fields {
            body.append(dd.data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(k)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(v)\r\n".data(using: .utf8)!)
        }
        body.append(dd.data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"\(fileField)\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mime)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        r.httpBody = body
        return r
    }

    func uploadMultipart<T: Decodable>(_ path: String, fields: [String: String] = [:],
                                       fileField: String, fileData: Data,
                                       fileName: String, mime: String) async throws -> T {
        let data = try await perform(try multipartRequest(path, fields: fields, fileField: fileField,
                                                          fileData: fileData, fileName: fileName, mime: mime))
        return try decode(data)
    }

    // MARK: - Company logo

    func uploadCompanyLogo(_ data: Data, fileName: String, mime: String) async throws -> KomptaCompany {
        try await uploadMultipart("/company/logo", fileField: "file", fileData: data, fileName: fileName, mime: mime)
    }
    func companyLogoData() async throws -> Data { try await rawData("/company/logo") }
    func deleteCompanyLogo() async throws -> KomptaCompany { try await deleteDecoded("/company/logo") }

    // MARK: - Document upload

    func uploadDocument(_ data: Data, fileName: String, mime: String, title: String) async throws -> CompanyDocument {
        try await uploadMultipart("/documents/upload", fields: ["title": title],
                                  fileField: "file", fileData: data, fileName: fileName, mime: mime)
    }

    // MARK: - Legislation upload

    func uploadLegislationDocument(_ data: Data, fileName: String, mime: String,
                                   title: String, category: String) async throws -> LegislationDocument {
        try await uploadMultipart("/legislation/documents",
                                  fields: ["title": title, "doc_category": category],
                                  fileField: "file", fileData: data, fileName: fileName, mime: mime)
    }

    // MARK: - Auth endpoints

    struct LoginPayload: Encodable { let email: String; let password: String }

    func login(email: String, password: String) async throws -> LoginResponse {
        try await post("/auth/login", body: LoginPayload(email: email, password: password))
    }

    func registerCompany(_ payload: CompanyRegistrationPayload) async throws -> LoginResponse {
        try await post("/auth/register-company", body: payload)
    }

    func requestPasswordReset(identifier: String) async throws -> PasswordResetRequestResponse {
        try await post("/auth/request-reset", body: PasswordResetRequestPayload(identifier: identifier))
    }

    func resetPassword(token: String, newPassword: String) async throws -> PasswordResetConfirmResponse {
        try await post("/auth/reset-password", body: PasswordResetConfirmPayload(token: token, new_password: newPassword))
    }

    func me() async throws -> KomptaUser { try await get("/auth/me") }
    func markOnboardingDone() async throws -> KomptaUser { try await actionDecoded("/auth/onboarding-done") }

    /// Forced password change on first login / after an admin-issued temporary password.
    func firstLoginChangePassword(currentPassword: String, newPassword: String) async throws -> KomptaUser {
        try await post("/auth/first-login-change-password",
                        body: FirstLoginChangePasswordPayload(current_password: currentPassword, new_password: newPassword))
    }

    // MARK: - Company

    func company() async throws -> KomptaCompany { try await get("/company/profile") }
    func updateCompany(_ p: CompanyUpdatePayload) async throws -> KomptaCompany {
        try await patch("/company/profile", body: p)
    }

    // MARK: - Dashboard

    func dashboardOverview() async throws -> DashboardOverview { try await get("/reports/overview") }

    func revenueSeries(period: String = "month") async throws -> [RevenueSeriesPoint] {
        try await get("/reports/revenue-series?period=\(period)")
    }

    // MARK: - Products

    func products() async throws -> [Product] { try await get("/products") }
    func createProduct(_ p: ProductPayload) async throws -> Product { try await post("/products", body: p) }
    func updateProduct(_ id: Int, _ p: ProductPayload) async throws -> Product { try await patch("/products/\(id)", body: p) }
    func deleteProduct(_ id: Int) async throws { try await delete("/products/\(id)") }
    func createInventoryMovement(_ p: InventoryMovementPayload) async throws {
        try await send("/inventory/movements", body: p)
    }
    func inventoryReportAI() async throws -> InventoryReportAI { try await actionDecoded("/inventory/report/ai") }

    // MARK: - POS

    func createSale(_ payload: SalePayload) async throws -> SaleResponse {
        try await post("/pos/sales", body: payload)
    }

    // MARK: - Employees

    func employees() async throws -> [Employee] {
        let page: EmployeesPage = try await get("/employees?per_page=200")
        return page.items
    }
    func createEmployee(_ p: EmployeePayload) async throws -> Employee { try await post("/employees", body: p) }
    /// Creates an employee AND a login account in one shot (returns credentials).
    func quickCreateEmployee(_ p: EmployeeQuickCreatePayload) async throws -> EmployeeProvisioningResult {
        try await post("/employees/quick-create", body: p)
    }
    /// Provisions a login account for an existing employee (creates one if
    /// missing, otherwise regenerates a temporary password).
    func generateEmployeeAccess(_ id: Int, role: String = "employe") async throws -> EmployeeProvisioningResult {
        try await actionDecoded("/employees/\(id)/provision-access?role=\(role)")
    }
    func employeeAccountInfo(_ id: Int) async throws -> EmployeeAccountInfo {
        try await get("/employees/\(id)/account-info")
    }

    // MARK: - AI (Limule)

    func chat(messages: [ChatMessage]) async throws -> ChatMessage {
        guard let last = messages.last(where: { $0.role == "user" }) else {
            return ChatMessage(role: "assistant", content: "")
        }
        let history = messages.dropLast().map { ["role": $0.role, "content": $0.content] }
        let body = LimuleChatRequest(
            prompt: last.content,
            page_path: "/mobile",
            conversation_history: history.isEmpty ? nil : history
        )
        let resp: LimuleChatResponse = try await post("/limule/chat", body: body)
        return ChatMessage(role: "assistant", content: resp.answer)
    }

    func chatRich(messages: [ChatMessage], pagePath: String = "/mobile", module: String? = nil) async throws -> LimuleChatRichResponse {
        guard let last = messages.last(where: { $0.role == "user" }) else {
            return LimuleChatRichResponse(interaction_id: nil, answer: "", module: module, intent: nil, sources: [], signals: [], confidence: nil)
        }
        let history = messages.dropLast().map { ["role": $0.role, "content": $0.content] }
        let body = LimuleChatRequest(
            prompt: last.content,
            page_path: pagePath,
            module: module,
            conversation_history: history.isEmpty ? nil : history
        )
        return try await post("/limule/chat", body: body)
    }

    func limuleHistory(limit: Int = 30) async throws -> [LimuleHistoryItem] {
        try await get("/limule/chat/history?limit=\(limit)")
    }

    // MARK: - Clients / CRM

    func clients(search: String = "") async throws -> [Client] {
        let q = search.isEmpty ? "" : "&search=\(search.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
        return try await get("/clients?per_page=0\(q)")
    }
    func createClient(_ p: ClientPayload) async throws -> Client { try await post("/clients", body: p) }
    func updateClient(_ id: Int, _ p: ClientPayload) async throws -> Client { try await put("/clients/\(id)", body: p) }
    func deleteClient(_ id: Int) async throws { try await delete("/clients/\(id)") }
    func clientStats(_ id: Int) async throws -> ClientStats { try await get("/clients/\(id)/stats") }
    func clientDiscounts(_ id: Int) async throws -> [ClientDiscount] { try await get("/clients/\(id)/discounts") }
    func createClientDiscount(_ clientId: Int, _ p: ClientDiscountPayload) async throws -> ClientDiscount {
        try await post("/clients/\(clientId)/discounts", body: p)
    }
    func deleteClientDiscount(_ clientId: Int, _ discountId: Int) async throws {
        try await delete("/clients/\(clientId)/discounts/\(discountId)")
    }
    func updateClientLoyalty(_ id: Int, _ p: UpdateClientLoyaltyPayload) async throws -> Client {
        try await patch("/clients/\(id)/loyalty", body: p)
    }

    // MARK: - Invoices / Billing

    func invoices() async throws -> [Invoice] { try await get("/invoices") }
    func createInvoice(_ p: InvoicePayload) async throws -> Invoice { try await post("/invoices", body: p) }
    func payInvoice(_ id: Int, _ p: InvoicePaymentPayload) async throws -> Invoice { try await post("/invoices/\(id)/pay", body: p) }
    func invoiceExportHTML(_ id: Int) async throws -> Data { try await rawData("/invoices/\(id)/export") }
    func currencyConvert(amount: Double, from: String, to: String) async throws -> CurrencyConvertResult {
        try await get("/currency/convert?amount=\(amount)&from=\(from)&to=\(to)")
    }

    // MARK: - Custom roles & avatars

    func rolePermissions(scope: String) async throws -> [RolePermission] { try await get("/roles/permissions?scope=\(scope)") }
    func roles(scope: String, groupId: Int? = nil) async throws -> [CustomRole] {
        var path = "/roles?scope=\(scope)"
        if let groupId { path += "&group_id=\(groupId)" }
        return try await get(path)
    }
    func createRole(_ p: RolePayload) async throws -> CustomRole { try await post("/roles", body: p) }
    func updateRole(_ id: Int, _ p: RolePayload) async throws -> CustomRole { try await patch("/roles/\(id)", body: p) }
    func deleteRole(_ id: Int) async throws { _ = try await perform(try request("/roles/\(id)", method: "DELETE")) }
    func assignCustomRole(_ userId: Int, roleId: Int?) async throws {
        try await send("/users/\(userId)/custom-role", method: "PATCH", body: AssignRolePayload(custom_role_id: roleId))
    }
    func companyUsers() async throws -> [CompanyUserRow] { try await get("/company/users") }
    func uploadMyAvatar(_ data: Data, fileName: String, mime: String) async throws {
        struct R: Decodable { let has_avatar: Bool }
        let _: R = try await uploadMultipart("/users/me/avatar", fileField: "file", fileData: data, fileName: fileName, mime: mime)
    }
    func myAvatarData() async throws -> Data { try await rawData("/users/me/avatar") }
    func updateMyProfile(fullName: String, phone: String, address: String) async throws {
        struct R: Decodable { let id: Int }
        let _: R = try await patch("/users/me/profile",
                                   body: MyProfileUpdatePayload(full_name: fullName, phone: phone, address: address))
    }
    func createStaff(_ p: StaffCreatePayload) async throws -> StaffCreatedResult { try await post("/admin/staff", body: p) }
    func relanceInvoice(_ id: Int) async throws { try await action("/invoices/\(id)/relance") }

    // MARK: - Inventory

    func inventoryMovements() async throws -> [InventoryMovement] { try await get("/inventory/movements") }
    func lowStock() async throws -> [LowStockProduct] { try await get("/inventory/low-stock") }

    // MARK: - Transactions

    func transactions() async throws -> [BankTransaction] { try await get("/transactions?per_page=0") }
    func transactionStats() async throws -> TransactionStats { try await get("/transactions/stats") }
    func createTransaction(_ p: BankTransactionPayload) async throws -> BankTransaction { try await post("/transactions", body: p) }
    func updateTransaction(_ id: Int, _ p: BankTransactionPayload) async throws -> BankTransaction { try await put("/transactions/\(id)", body: p) }
    func deleteTransaction(_ id: Int) async throws { try await delete("/transactions/\(id)") }

    // MARK: - Budget

    func budgetSummary() async throws -> [BudgetSummaryItem] { try await get("/budget/summary") }
    func createBudgetCategory(_ p: BudgetCategoryPayload) async throws -> BudgetSummaryItem { try await post("/budget/categories", body: p) }
    func updateBudgetCategory(_ id: Int, _ p: BudgetCategoryPayload) async throws -> BudgetSummaryItem { try await put("/budget/categories/\(id)", body: p) }
    func deleteBudgetCategory(_ id: Int) async throws { try await delete("/budget/categories/\(id)") }

    // MARK: - Investments

    func investments() async throws -> [Investment] { try await get("/investments") }
    func createInvestment(_ p: InvestmentPayload) async throws -> Investment { try await post("/investments", body: p) }
    func updateInvestment(_ id: Int, _ p: InvestmentPayload) async throws -> Investment { try await put("/investments/\(id)", body: p) }
    func deleteInvestment(_ id: Int) async throws { try await delete("/investments/\(id)") }

    // Live market data (Yahoo Finance, proxied by the backend)
    func searchTickers(_ q: String) async throws -> [TickerSearchResult] {
        let encoded = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
        return try await get("/investments/search?q=\(encoded)")
    }
    func stockQuote(_ ticker: String) async throws -> StockQuote {
        let encoded = ticker.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? ticker
        return try await get("/investments/quote/\(encoded)")
    }
    func stockHistory(_ ticker: String, period: String) async throws -> [StockHistoryPoint] {
        let encoded = ticker.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? ticker
        return try await get("/investments/history/\(encoded)?period=\(period)")
    }
    func stockNews(_ ticker: String) async throws -> [StockNewsItem] {
        let encoded = ticker.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? ticker
        return try await get("/investments/news/\(encoded)")
    }
    func stockNewsFr(_ ticker: String) async throws -> [StockNewsItem] {
        let encoded = ticker.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? ticker
        return try await get("/investments/news-fr/\(encoded)")
    }

    // Limule AI analyses
    func analyzeInvestment(_ ticker: String, invId: Int? = nil) async throws -> InvestmentAnalysis {
        let encoded = ticker.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? ticker
        let path = invId.map { "/investments/analyze/\(encoded)?inv_id=\($0)" } ?? "/investments/analyze/\(encoded)"
        return try await actionDecoded(path)
    }
    func analyzePortfolio() async throws -> PortfolioAnalysis {
        try await actionDecoded("/investments/analyze/portfolio")
    }

    // MARK: - Payment accounts

    func paymentAccounts() async throws -> [PaymentAccount] { try await get("/payment-accounts") }
    func createPaymentAccount(_ p: PaymentAccountPayload) async throws -> PaymentAccount { try await post("/payment-accounts", body: p) }
    func deletePaymentAccount(_ id: Int) async throws { try await delete("/payment-accounts/\(id)") }

    // MARK: - Tasks / Work / Kanban

    func tasks() async throws -> [KTask] { try await get("/tasks") }
    func createTask(_ p: TaskPayload) async throws -> KTask { try await post("/tasks", body: p) }
    /// Extraction IA : transforme un texte (message Limule, fil de canal) en une
    /// tâche bien formée (titre court, description, priorité) au lieu de recopier
    /// tout le texte brut.
    func extractTask(text: String, source: String = "ai", project: String = "") async throws -> KTask {
        try await post("/tasks/extract", body: ["text": text, "source": source, "project": project])
    }
    func updateTask(_ id: Int, _ p: TaskPayload) async throws -> KTask { try await patch("/tasks/\(id)", body: p) }
    /// Avancer une tâche : PATCH minimal (statut seul) — autorisé même aux
    /// non-managers (le backend n'autorise qu'`status`/`order_index` pour eux).
    func setTaskStatus(_ id: Int, _ status: String) async throws -> KTask {
        try await patch("/tasks/\(id)", body: ["status": status])
    }
    func deleteTask(_ id: Int) async throws { try await delete("/tasks/\(id)") }

    // MARK: - Chat

    func chatChannels() async throws -> [ChatChannel] { try await get("/chat/channels") }
    func createChannel(name: String, topic: String) async throws -> ChatChannel {
        try await post("/chat/channels", body: ChannelPayload(name: name, topic: topic))
    }
    func channelMessages(_ id: Int) async throws -> [ChatMsg] { try await get("/chat/channels/\(id)/messages") }
    func channelDetail(_ id: Int) async throws -> ChatChannelDetail { try await get("/chat/channels/\(id)/detail") }
    func sendMessage(_ channelId: Int, body: String) async throws -> ChatMsg {
        try await post("/chat/channels/\(channelId)/messages", body: MessagePayload(body: body))
    }

    // MARK: - Payroll

    func payrollRuns() async throws -> [PayrollRun] { try await get("/payroll/runs") }
    func updatePayrollRunStatus(_ id: Int, status: String) async throws -> PayrollRun {
        struct Body: Encodable { let status: String }
        return try await patch("/payroll/runs/\(id)", body: Body(status: status))
    }
    func updatePayslip(_ id: Int, payoutStatus: String) async throws -> Payslip {
        struct Body: Encodable { let payout_status: String }
        return try await patch("/payroll/payslips/\(id)", body: Body(payout_status: payoutStatus))
    }
    func createPayrollRun(_ p: PayrollRunPayload) async throws -> PayrollRun { try await post("/payroll/runs", body: p) }
    /// Downloads an individual employee payslip as PDF bytes.
    func payslipPDF(_ id: Int) async throws -> Data { try await rawData("/payroll/payslips/\(id)/download") }

    // MARK: - Téléchargements PDF/CSV (parité web)
    func invoiceExportPDF(_ id: Int) async throws -> Data { try await rawData("/invoices/\(id)/export?format=pdf") }
    func payrollRunExportPDF(_ id: Int) async throws -> Data { try await rawData("/payroll/runs/\(id)/export?format=pdf") }
    func posSalesExportCSV() async throws -> Data { try await rawData("/pos/sales/export-csv") }
    func declarationPDF(_ id: Int) async throws -> Data { try await rawData("/declarations/\(id)/pdf") }
    func employeeContractPDF(_ id: Int) async throws -> Data { try await rawData("/employees/\(id)/contract") }
    func investmentAnalysisPDF(_ id: Int) async throws -> Data { try await rawData("/investments/\(id)/analysis/pdf") }

    // MARK: - Meetings

    func meetings() async throws -> [Meeting] { try await get("/meetings") }
    func createMeeting(_ p: MeetingPayload) async throws -> Meeting { try await post("/meetings", body: p) }

    // MARK: - Notes

    func notes() async throws -> [DailyNote] { try await get("/notes") }
    func createNote(_ p: DailyNotePayload) async throws -> DailyNote { try await post("/notes", body: p) }
    func deleteNote(_ id: Int) async throws { try await delete("/notes/\(id)") }
    /// Limule daily journal generated from today's tasks, meetings and activity.
    func generateDailyNote() async throws -> DailyNote { try await actionDecoded("/notes/generate") }
    func updateNote(_ id: Int, _ p: DailyNotePayload) async throws -> DailyNote { try await patch("/notes/\(id)", body: p) }

    // MARK: - Documents

    func documents() async throws -> [CompanyDocument] { try await get("/documents") }
    func analyzeDocument(_ id: Int) async throws -> CompanyDocument { try await actionDecoded("/documents/\(id)/analyze") }

    // MARK: - Declarations (fiscal)

    func declarations() async throws -> [DeclarationRecord] { try await get("/declarations") }
    func generateDeclaration(_ p: DeclarationPayload) async throws -> DeclarationRecord { try await post("/declarations/generate", body: p) }

    // MARK: - Teras / intelligence

    func terasAlerts() async throws -> [TerasAlert] { try await get("/teras/alerts") }
    func terasScores() async throws -> [TerasScore] { try await get("/teras/scores") }
    func terasRecommendations() async throws -> [TerasRecommendation] { try await get("/teras/recommendations") }
    func analyzeCompanyTeras() async throws -> TerasAnalysisJob { try await actionDecoded("/teras/analyze/company") }
    func analyzeRHTeras() async throws -> TerasAnalysisJob { try await actionDecoded("/teras/analyze/rh") }
    func analyzePayrollTeras() async throws -> TerasAnalysisJob { try await actionDecoded("/teras/analyze/payroll") }

    // MARK: - Tickets

    func tickets() async throws -> [Ticket] { try await get("/tickets") }
    func broadcastNotifications() async throws -> [BroadcastNotification] { try await get("/notifications") }
    func createTicket(_ p: TicketPayload) async throws -> Ticket { try await post("/tickets", body: p) }

    // MARK: - Preferences

    func preferences() async throws -> UserPreferences { try await get("/me/preferences") }

    // MARK: - Company modules

    func companyModules() async throws -> [CompanyModule] { try await get("/company/modules") }

    // MARK: - AI generations / assistants

    func writeWithAI(_ p: WritingPayload) async throws -> WritingResult { try await post("/assistants/writing", body: p) }

    // MARK: - Reports overview

    func reportsOverview() async throws -> DashboardOverview { try await get("/reports/overview") }

    // MARK: - Enterprise parity modules

    func accountingMode() async throws -> AccountingModeResponse { try await get("/accounting/mode") }
    func accountingAccounts() async throws -> [AccountingAccount] { try await get("/accounting/accounts") }
    func accountingJournal(limit: Int = 100) async throws -> [JournalEntry] { try await get("/accounting/journal?limit=\(limit)") }
    func accountingBalance() async throws -> TrialBalance { try await get("/accounting/balance") }
    func accountingReadiness() async throws -> ReadinessReport { try await get("/accounting/ohada-readiness") }
    func accountingCashflow(period: String = "month") async throws -> [CashFlowPoint] { try await get("/accounting/cashflow?period=\(period)") }
    func accountingExpenses() async throws -> [ExpenseCategory] { try await get("/accounting/expenses") }
    func accountingSyscemac() async throws -> [SyscemacStatus] { try await get("/accounting/syscemac-status") }

    func companyAuditLogs(page: Int = 1, perPage: Int = 100) async throws -> [CompanyAuditLogEntry] {
        let page: AuditLogPage = try await get("/audit-logs?page=\(page)&per_page=\(perPage)")
        return page.items
    }

    func fiscalDeadlines(status: String? = nil) async throws -> [FiscalDeadline] {
        let q = status.map { "?status=\($0)" } ?? ""
        return try await get("/fiscal/deadlines\(q)")
    }
    func createFiscalDeadline(_ p: FiscalDeadlinePayload) async throws -> FiscalDeadline {
        try await post("/fiscal/deadlines", body: p)
    }
    func updateFiscalDeadlineStatus(_ id: Int, status: String) async throws -> FiscalDeadline {
        try await patch("/fiscal/deadlines/\(id)", body: FiscalDeadlineStatusPayload(status: status))
    }
    func deleteFiscalDeadline(_ id: Int) async throws { try await delete("/fiscal/deadlines/\(id)") }
    func generateFiscalDeadlines() async throws -> [FiscalDeadline] {
        try await actionDecoded("/fiscal/deadlines/generate")
    }
    func fiscalVatSummary(period: String? = nil) async throws -> VatSummary {
        let q = period.map { "?period=\($0)" } ?? ""
        return try await get("/fiscal/vat-summary\(q)")
    }

    func legislationDocuments(category: String? = nil) async throws -> [LegislationDocument] {
        let q = category.map { "?category=\($0)" } ?? ""
        return try await get("/legislation/documents\(q)")
    }
    func legislationContext() async throws -> LegislationContext { try await get("/legislation/context") }
    func analyzeLegislationDocument(_ id: Int) async throws -> LegislationDocument {
        try await actionDecoded("/legislation/documents/\(id)/analyze")
    }
    func safeModeExport() async throws -> Data { try await rawData("/safe-mode/export") }

    // MARK: - Groups / Tontines

    func groups() async throws -> [OrgGroup] { try await get("/groups") }
    func createGroup(_ p: GroupPayload) async throws -> OrgGroup { try await post("/groups", body: p) }
    func group(_ id: Int) async throws -> OrgGroup { try await get("/groups/\(id)") }
    func updateGroup(_ id: Int, _ p: GroupUpdatePayload) async throws -> OrgGroup { try await put("/groups/\(id)", body: p) }
    func closeGroup(_ id: Int, reason: String) async throws { try await send("/groups/\(id)/close", body: ["reason": reason]) }
    func leaveGroup(_ id: Int) async throws { try await action("/groups/\(id)/leave") }

    func groupMembers(_ id: Int) async throws -> [GroupMember] { try await get("/groups/\(id)/members") }
    func addGroupMember(_ id: Int, _ p: GroupMemberPayload) async throws -> GroupMember { try await post("/groups/\(id)/members", body: p) }

    /// Crée un compte de connexion pour un membre (mot de passe temporaire),
    /// ou renvoie le compte existant s'il y en a déjà un.
    func provisionGroupMemberAccount(_ groupId: Int, _ memberId: Int) async throws -> GroupMemberAccessResult {
        try await actionDecoded("/groups/\(groupId)/members/\(memberId)/provision-account")
    }
    /// Réinitialise l'accès d'un membre (nouveau mot de passe temporaire).
    func resetGroupMemberAccess(_ groupId: Int, _ memberId: Int) async throws -> GroupMemberAccessResult {
        try await actionDecoded("/groups/\(groupId)/members/\(memberId)/reset-access")
    }

    func groupFinanceDashboard(_ id: Int) async throws -> GroupFinanceDashboard { try await get("/groups/\(id)/dashboard/finance") }

    func groupPlans(_ id: Int) async throws -> [ContributionPlan] { try await get("/groups/\(id)/contributions/plans") }
    func createGroupPlan(_ id: Int, _ p: ContributionPlanPayload) async throws -> ContributionPlan { try await post("/groups/\(id)/contributions/plans", body: p) }

    func groupPayments(_ id: Int) async throws -> [ContributionPayment] {
        // Le backend renvoie { items: [...], stats: {...} } — on extrait items.
        struct Wrapper: Decodable { let items: [ContributionPayment] }
        let w: Wrapper = try await get("/groups/\(id)/contributions/payments")
        return w.items
    }
    func createGroupPayment(_ id: Int, _ p: ContributionPaymentPayload) async throws -> ContributionPayment { try await post("/groups/\(id)/contributions/payments", body: p) }
    func validateGroupPayment(_ id: Int, _ paymentId: Int) async throws { try await send("/groups/\(id)/contributions/payments/\(paymentId)/validate", body: ["validate": true]) }

    func groupTransactions(_ id: Int) async throws -> [GroupTransaction] {
        // Le backend renvoie { balance, total_in, total_out, items: [...] }.
        struct Wrapper: Decodable { let items: [GroupTransaction] }
        let w: Wrapper = try await get("/groups/\(id)/transactions")
        return w.items
    }

    func groupExpenses(_ id: Int) async throws -> [GroupExpense] { try await get("/groups/\(id)/expenses") }
    func createGroupExpense(_ id: Int, _ p: GroupExpensePayload) async throws -> GroupExpense { try await post("/groups/\(id)/expenses", body: p) }

    func groupMeetings(_ id: Int) async throws -> [GroupMeeting] { try await get("/groups/\(id)/meetings") }
    func createGroupMeeting(_ id: Int, _ p: GroupMeetingPayload) async throws -> GroupMeeting { try await post("/groups/\(id)/meetings", body: p) }

    func groupCalendar(_ id: Int) async throws -> GroupCalendarResponse { try await get("/groups/\(id)/calendar") }
    func groupBirthdays(_ id: Int) async throws -> [GroupBirthday] { try await get("/groups/\(id)/birthdays") }

    func groupVotes(_ id: Int) async throws -> [GroupVote] { try await get("/groups/\(id)/votes") }
    func createGroupVote(_ id: Int, _ p: GroupVotePayload) async throws -> GroupVote { try await post("/groups/\(id)/votes", body: p) }
    func submitGroupVote(_ id: Int, _ voteId: Int, _ p: GroupVoteSubmitPayload) async throws { try await send("/groups/\(id)/votes/\(voteId)/submit", body: p) }

    func groupChatRooms(_ id: Int) async throws -> [GroupChatRoom] { try await get("/groups/\(id)/chat/rooms") }
    func groupChatMessages(_ id: Int, roomId: Int) async throws -> [GroupChatMessage] { try await get("/groups/\(id)/chat/rooms/\(roomId)/messages") }
    func sendGroupMessage(_ id: Int, roomId: Int, _ p: GroupMessagePayload) async throws -> GroupChatMessage { try await post("/groups/\(id)/chat/rooms/\(roomId)/messages", body: p) }

    func groupDocuments(_ id: Int) async throws -> [GroupDocument] { try await get("/groups/\(id)/documents") }
    func uploadGroupDocument(_ groupId: Int, data: Data, fileName: String, mime: String, title: String, category: String = "autre") async throws -> GroupDocument {
        try await uploadMultipart("/groups/\(groupId)/documents",
                                  fields: ["title": title, "category": category, "visibility": "members"],
                                  fileField: "file", fileData: data, fileName: fileName, mime: mime)
    }

    func groupLeadership(_ id: Int) async throws -> GroupLeadershipResponse { try await get("/groups/\(id)/leadership") }
    func changeGroupLeadership(_ id: Int, _ p: GroupLeadershipPayload) async throws { try await send("/groups/\(id)/leadership/change", body: p) }
    func groupRoles(_ id: Int) async throws -> [GroupRole] { try await get("/groups/\(id)/roles") }

    func groupAIAsk(_ id: Int, _ p: GroupAIAskPayload) async throws -> GroupAIAnswer { try await post("/groups/\(id)/ai/ask", body: p) }
    func groupAIReport(_ id: Int, _ p: GroupAIReportPayload) async throws -> GroupAIReport { try await post("/groups/\(id)/ai/generate-report", body: p) }
    func groupAIPaymentAnalysis(_ id: Int) async throws -> GroupAIAnalysis { try await actionDecoded("/groups/\(id)/ai/payment-analysis") }

    func groupPaymentsReport(_ id: Int) async throws -> GroupPaymentsReport { try await get("/groups/\(id)/reports/payments") }
    func groupExpensesReport(_ id: Int) async throws -> GroupExpensesReport { try await get("/groups/\(id)/reports/expenses") }

    // MARK: - Admin: overview, companies, users, tickets, audit logs

    func adminOverview() async throws -> AdminOverview { try await get("/admin/overview") }

    func adminCompanies() async throws -> [AdminCompanyRow] { try await get("/admin/companies") }
    func adminCompanyDetail(_ id: Int) async throws -> AdminCompanyDetail { try await get("/admin/companies/\(id)") }

    func adminUsers(companyId: Int? = nil, search: String = "") async throws -> [AdminUserRow] {
        var q = [String]()
        if let companyId { q.append("company_id=\(companyId)") }
        if !search.isEmpty { q.append("search=\(search.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") }
        let qs = q.isEmpty ? "" : "?\(q.joined(separator: "&"))"
        return try await get("/admin/users\(qs)")
    }
    func adminUpdateUserStatus(_ id: Int, _ status: String) async throws -> AccountStatusResult {
        try await patch("/admin/users/\(id)/status", body: AccountStatusPayload(account_status: status))
    }

    func adminTickets() async throws -> [AdminTicket] { try await get("/admin/tickets") }
    func adminTicket(_ id: Int) async throws -> AdminTicket { try await get("/admin/tickets/\(id)") }
    func adminCreateTicket(_ p: AdminTicketCreatePayload) async throws -> AdminTicket { try await post("/admin/tickets", body: p) }
    func adminUpdateTicket(_ id: Int, _ p: AdminTicketUpdatePayload) async throws -> AdminTicket { try await patch("/admin/tickets/\(id)", body: p) }
    func adminReplyTicket(_ id: Int, _ p: AdminTicketReplyPayload) async throws -> AdminTicket { try await post("/admin/tickets/\(id)/reply", body: p) }

    func adminAuditLogs() async throws -> [AdminAuditLogEntry] { try await get("/admin/audit-logs") }

    // MARK: - Admin: analytics, activity, broadcast, impersonate, reset password, company status

    func adminPlatformAnalytics() async throws -> PlatformAnalytics { try await get("/admin/analytics/platform") }
    func adminActivityFeed() async throws -> [AdminActivityEvent] { try await get("/admin/analytics/activity-feed") }

    func adminBroadcast(_ p: BroadcastPayload) async throws -> BroadcastResult { try await post("/admin/broadcast", body: p) }

    func adminImpersonate(_ userId: Int) async throws -> ImpersonateResult { try await actionDecoded("/admin/impersonate/\(userId)") }
    func adminResetPassword(_ userId: Int) async throws -> ResetPasswordResult { try await actionDecoded("/admin/users/\(userId)/reset-password") }
    func adminUpdateCompanyStatus(_ id: Int, _ status: String) async throws -> CompanyStatusResult {
        try await patch("/admin/companies/\(id)/status", body: CompanyStatusPayload(status: status))
    }

    // MARK: - Admin: feature flags

    func adminFeatureFlags() async throws -> [FeatureFlag] { try await get("/admin/system/flags") }
    func adminCreateFeatureFlag(_ p: FeatureFlagCreatePayload) async throws -> FeatureFlag { try await post("/admin/system/flags", body: p) }
    func adminUpdateFeatureFlag(_ key: String, _ p: FeatureFlagUpdatePayload) async throws -> FeatureFlag { try await patch("/admin/system/flags/\(key)", body: p) }
    func adminDeleteFeatureFlag(_ key: String) async throws -> FeatureFlagDeleteResult { try await actionDecoded("/admin/system/flags/\(key)", method: "DELETE") }

    // MARK: - Admin: system health / preflight / onboarding / email

    func adminSystemHealth() async throws -> SystemHealthResponse { try await get("/admin/system/health") }
    func adminSystemPreflight() async throws -> PreflightReport { try await get("/admin/system/preflight") }
    func adminOnboardingStats() async throws -> [OnboardingStatRow] { try await get("/admin/onboarding-stats") }
    func adminTestEmail(_ to: String) async throws -> TestEmailResult { try await post("/admin/test-email", body: TestEmailPayload(to: to)) }
    func adminEmailStatus() async throws -> EmailStatus { try await get("/admin/email-status") }

    // MARK: - Admin: Limule insights / Grand Sage / dataset

    func adminLimuleInsights() async throws -> AdminLimuleInsights { try await get("/admin/limule/insights") }
    func adminLimuleChat(_ prompt: String) async throws -> AdminLimuleChatResponse {
        try await post("/admin/limule/chat", body: AdminLimuleChatPayload(prompt: prompt))
    }
    func adminLimuleDataset(limit: Int = 100) async throws -> [AdminLimuleDatasetRecord] { try await get("/admin/limule/dataset?limit=\(limit)") }
    /// Export brut du dataset d'entraînement (JSONL).
    func adminLimuleDatasetExport() async throws -> Data { try await perform(try request("/admin/limule/dataset/export")) }

    // MARK: - Admin: subscriptions (plans, promotions, companies)

    func adminPlans() async throws -> [SubscriptionPlan] { try await get("/admin/subscription/plans") }
    func adminCreatePlan(_ p: PlanUpsertPayload) async throws -> SubscriptionPlan { try await post("/admin/subscription/plans", body: p) }
    func adminUpdatePlan(_ id: Int, _ p: PlanUpsertPayload) async throws -> SubscriptionPlan { try await patch("/admin/subscription/plans/\(id)", body: p) }
    func adminDeletePlan(_ code: String) async throws -> PlanDeleteResult { try await actionDecoded("/admin/subscription/plans/\(code)", method: "DELETE") }

    func adminPromos() async throws -> [Promotion] { try await get("/admin/subscription/promotions") }
    func adminCreatePromo(_ p: PromoUpsertPayload) async throws -> Promotion { try await post("/admin/subscription/promotions", body: p) }
    func adminUpdatePromo(_ code: String, _ p: PromoUpsertPayload) async throws -> Promotion { try await patch("/admin/subscription/promotions/\(code)", body: p) }
    func adminDeletePromo(_ code: String) async throws -> PromoDeleteResult { try await actionDecoded("/admin/subscription/promotions/\(code)", method: "DELETE") }

    func adminCompanySubs() async throws -> [CompanySubscriptionRow] { try await get("/admin/subscription/companies") }
    func adminSuspendCompany(_ id: Int) async throws -> SuspendResult { try await actionDecoded("/admin/subscription/companies/\(id)/suspend") }
    func adminReactivateCompany(_ id: Int) async throws -> SuspendResult { try await actionDecoded("/admin/subscription/companies/\(id)/reactivate") }
    func adminGrantSubscription(_ id: Int, _ p: GrantRequestPayload) async throws -> GrantResult { try await post("/admin/subscription/companies/\(id)/grant", body: p) }

    // MARK: - Scan QR produit

    func scanProductQr(_ token: String) async throws -> Product {
        let enc = token.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? token
        return try await get("/products/scan/\(enc)")
    }

    // MARK: - Employabilité (TERAS)

    func submitEmployability(_ employeeId: Int) async throws -> EmployabilityCheck {
        try await post("/teras/employability", body: EmployabilityPayload(employee_id: employeeId, include_documents: true))
    }

    // MARK: - Limule : chat sur un document

    func limuleDocumentChat(_ id: Int, prompt: String, history: [LimuleDocChatTurn]) async throws -> LimuleDocChatResponse {
        try await post("/limule/documents/\(id)/chat", body: LimuleDocChatPayload(prompt: prompt, conversation_history: history))
    }

    // MARK: - Imports CSV

    func importProductsCsv(_ data: Data, fileName: String) async throws -> CsvImportResult {
        try await uploadMultipart("/products/import-csv", fileField: "file", fileData: data, fileName: fileName, mime: "text/csv")
    }
    func importEmployeesCsv(_ data: Data, fileName: String) async throws -> CsvImportResult {
        try await uploadMultipart("/employees/import-csv", fileField: "file", fileData: data, fileName: fileName, mime: "text/csv")
    }
    func importTransactionsCsv(_ data: Data, fileName: String) async throws -> CsvImportResult {
        try await uploadMultipart("/transactions/import", fileField: "file", fileData: data, fileName: fileName, mime: "text/csv")
    }

    /// Import / transcription IA de transactions depuis n'importe quel fichier
    /// (PDF, Excel, CSV, image). Le type MIME est déduit de l'extension ; le
    /// backend extrait le texte puis fait extraire les transactions par Limule.
    func importTransactionsFile(_ data: Data, fileName: String) async throws -> CsvImportResult {
        let ext = (fileName as NSString).pathExtension.lowercased()
        let mime: String
        switch ext {
        case "pdf":              mime = "application/pdf"
        case "xlsx", "xlsm":     mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        case "xls":              mime = "application/vnd.ms-excel"
        case "csv":              mime = "text/csv"
        case "png":              mime = "image/png"
        case "jpg", "jpeg":      mime = "image/jpeg"
        case "txt":              mime = "text/plain"
        default:                 mime = "application/octet-stream"
        }
        return try await uploadMultipart("/transactions/import", fileField: "file", fileData: data, fileName: fileName, mime: mime)
    }

    // MARK: - Sécurité : 2FA (TOTP)

    func twoFaSetup() async throws -> TotpSetup { try await actionDecoded("/auth/2fa/setup") }
    func twoFaEnable(_ code: String) async throws -> TotpResult { try await post("/auth/2fa/enable", body: TotpCodePayload(code: code)) }
    func twoFaDisable() async throws -> TotpResult { try await actionDecoded("/auth/2fa/disable") }

    // MARK: - Entitlements (droits d'accès de l'entreprise)

    func myEntitlements() async throws -> Entitlements { try await get("/subscription/entitlements") }

    // MARK: - Encaissement (méthodes de paiement par entreprise)

    func collectionMethods() async throws -> CollectionMethodsResponse { try await get("/payments/methods") }
    func upsertCollectionMethod(_ p: CollectionMethodPayload) async throws -> CollectionMethod { try await post("/payments/methods", body: p) }
    func deleteCollectionMethod(_ id: Int) async throws { try await delete("/payments/methods/\(id)") }
}
