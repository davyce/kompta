import SwiftUI
import Charts

// ============================================================================
//  DashboardView — cockpit complet, à parité avec le DashboardPage web.
//  Sélecteur de période · KPIs (trésorerie/encaissé/paie/TERAS) · résumé IA ·
//  graphe revenus/marge · donut canaux · prévision trésorerie 7 j · alertes
//  TERAS · tâches urgentes · agenda du jour · conformité · stocks faibles ·
//  portefeuille d'investissements · démarrage rapide pour comptes vierges.
// ============================================================================

private enum DashPeriod: String, CaseIterable, Identifiable {
    case mois, trimestre, annee
    var id: String { rawValue }
    var label: String { switch self { case .mois: "Mois"; case .trimestre: "Trimestre"; case .annee: "Année" } }
    var divisor: Double { switch self { case .mois: 12; case .trimestre: 4; case .annee: 1 } }
    var apiValue: String { rawValue }
}

struct DashboardView: View {
    @EnvironmentObject private var auth:  AuthManager
    @EnvironmentObject private var theme: CompanyTheme

    @State private var overview:  DashboardOverview?
    @State private var trend:     [RevenueSeriesPoint] = []
    @State private var alerts:    [TerasAlert] = []
    @State private var tasks:     [KTask] = []
    @State private var meetings:  [Meeting] = []
    @State private var investments: [Investment] = []
    @State private var employees: [Employee] = []
    @State private var isLoading = true
    @State private var error:     String?

    @State private var period: DashPeriod = .annee
    @State private var aiSummary: String?
    @State private var aiLoading = false

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 18) {
                header
                if isLoading { loadingGrid }
                else if let e = error { errorState(e) }
                else if let m = overview { content(m) }
            }
            .padding(.vertical, 16)
        }
        .navigationTitle("Tableau de bord")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.large)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) { AppearanceToggle() }
            ToolbarItem(placement: .primaryAction) { NotificationBell() }
        }
        .task { await load() }
        .refreshable { await load() }
        .animation(.easeInOut(duration: 0.25), value: isLoading)
    }

    // MARK: - Header + period

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Bonjour, \(auth.currentUser?.firstName ?? "") 👋")
                        .font(.title2.bold())
                    Text("\(overview?.company ?? auth.company?.name ?? "KOMPTA") · \(Date().formatted(.dateTime.weekday(.wide).day().month(.wide)))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                AvatarView(initials: auth.currentUser?.initials ?? "?", size: 46, color: theme.primary)
            }

            HStack(spacing: 10) {
                Picker("Période", selection: $period) {
                    ForEach(DashPeriod.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .onChange(of: period) { _, _ in Task { await loadTrend() } }

                Button { Task { await generateAISummary() } } label: {
                    HStack(spacing: 6) {
                        if aiLoading { ProgressView().controlSize(.small).tint(.white) }
                        else { LimuleMark(size: 16, showAura: false) }
                        Text(aiLoading ? "Analyse…" : "Résumé IA").font(.caption.bold())
                    }
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(
                        LinearGradient(colors: [theme.primary, theme.secondary],
                                       startPoint: .leading, endPoint: .trailing),
                        in: Capsule()
                    )
                    .foregroundStyle(.white)
                    .shadow(color: theme.primary.opacity(0.35), radius: 6, y: 2)
                }
                .buttonStyle(.plain)
                .disabled(aiLoading)
            }
        }
        .padding(.horizontal)
    }

    private var loadingGrid: some View {
        VStack(spacing: 16) {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(0..<4, id: \.self) { _ in ShimmerBox(height: 110) }
            }
            ShimmerBox(height: 220)
            ShimmerBox(height: 160)
        }
        .padding(.horizontal)
    }

    private func errorState(_ msg: String) -> some View {
        ContentUnavailableView {
            Label("Impossible de charger", systemImage: "exclamationmark.triangle.fill")
        } description: { Text(msg) } actions: {
            Button("Réessayer") { Task { await load() } }.buttonStyle(.bordered)
        }
        .padding()
    }

    // MARK: - Content

    @ViewBuilder
    private func content(_ m: DashboardOverview) -> some View {
        if m.employees == 0 && m.invoicesTotal == 0 && m.salesTotal == 0 {
            gettingStarted
        }

        kpiGrid(m)

        if aiLoading && aiSummary == nil {
            GlassCard {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    Text("Limule analyse vos indicateurs…").font(.callout).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal)
        } else if let s = aiSummary {
            GlassCard {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 6) {
                        LimuleMark(size: 18, showAura: false)
                        Text("Analyse Limule").font(.subheadline.bold()).foregroundStyle(theme.primary)
                        Spacer()
                        Button { withAnimation { aiSummary = nil } } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        }.buttonStyle(.plain)
                    }
                    Divider()
                    AIMarkdownText(text: s, accent: theme.primary)
                        .textSelection(.enabled)
                }
            }
            .padding(.horizontal)
        }

        revenueChart
        channelsChart(m)
        treasuryPrediction(m)

        if !alerts.isEmpty { terasAlertsSection }
        if !urgentTasks.isEmpty { tasksSection }
        if !todayMeetings.isEmpty { agendaSection }
        complianceSection(m)
        if !m.low_stock.isEmpty { lowStockSection(m) }
        if !departments.isEmpty { departmentsSection }
        if !investments.isEmpty { investmentsSection }
    }

    // MARK: - Getting started (new accounts)

    private struct QuickStart: Identifiable {
        let id = UUID()
        let title: String, hint: String, icon: String, tint: Color
        let dest: AnyView
    }
    private var quickStarts: [QuickStart] {
        [
            .init(title: "Employés", hint: "Constituez votre équipe", icon: "person.2.fill", tint: .purple, dest: AnyView(HRView())),
            .init(title: "Facture", hint: "Première facture", icon: "doc.text.fill", tint: .green, dest: AnyView(BillingView())),
            .init(title: "Inventaire", hint: "Gérez vos produits", icon: "shippingbox.fill", tint: .orange, dest: AnyView(InventoryView())),
            .init(title: "Transactions", hint: "Importez vos opérations", icon: "building.columns.fill", tint: .blue, dest: AnyView(TransactionsView())),
        ]
    }
    private var gettingStarted: some View {
        GlassCard(tint: theme.primary.opacity(0.1)) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    LimuleMark(size: 34)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Bienvenue dans KOMPTA").font(.headline)
                        Text("Démarrez en quelques étapes.").font(.caption).foregroundStyle(.secondary)
                    }
                }
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(quickStarts) { q in
                        NavigationLink { q.dest } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 10).fill(q.tint.opacity(0.15)).frame(width: 34, height: 34)
                                    Image(systemName: q.icon).font(.footnote).foregroundStyle(q.tint)
                                }
                                Text(q.title).font(.subheadline.bold())
                                Text(q.hint).font(.caption2).foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(.horizontal)
    }

    // MARK: - KPI grid

    private func kpiGrid(_ m: DashboardOverview) -> some View {
        let div = period.divisor
        let treasury = m.treasury / div
        let collected = m.invoicesPaid / div
        // Real payroll mass = sum of actual employee salaries (no hardcoded average).
        let totalSalaries = employees.reduce(0.0) { $0 + $1.salary }
        let payroll = totalSalaries / div
        let teras = m.terasScore
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            KpiTile(label: "Trésorerie", value: treasury != 0 ? compactFCFA(treasury) : "—",
                    delta: m.txCount > 0 ? "\(m.txCount) mouvement(s)" : "Ventes POS",
                    icon: "wallet.bifold.fill", tint: theme.primary)
            KpiTile(label: "Encaissé", value: collected > 0 ? compactFCFA(collected) : (m.invoicesTotal > 0 ? "0" : "—"),
                    delta: m.invoicesPaidCount > 0 ? "\(m.invoicesPaidCount) facture(s) payée(s)" : (m.invoicesPending > 0 ? "\(compactFCFA(m.invoicesPending)) en attente" : "Aucune facture"),
                    icon: "doc.text.fill", tint: .teal)
            KpiTile(label: "Masse salariale", value: payroll > 0 ? compactFCFA(payroll) : "—",
                    delta: payroll > 0 ? "\(m.employees) employé(s)" : (m.employees > 0 ? "Salaires à renseigner" : "Aucun employé"),
                    icon: "person.2.fill", tint: .orange)
            KpiTile(label: "Score TERAS", value: teras > 0 ? "\(teras) / 100" : "— / 100",
                    delta: teras > 0 ? "Conformité & santé" : "Non évalué",
                    icon: "shield.lefthalf.filled", tint: .blue)
        }
        .padding(.horizontal)
    }

    // MARK: - Revenue area chart

    private var revenueChart: some View {
        SectionCard(title: "Performance commerciale", subtitle: "Revenus & marge") {
            if trend.isEmpty {
                emptyChart(icon: "chart.line.uptrend.xyaxis", text: "Aucune donnée sur la période")
            } else {
                Chart {
                    ForEach(trend, id: \.label) { p in
                        AreaMark(x: .value("Mois", p.label), y: .value("Revenu", p.revenue))
                            .foregroundStyle(LinearGradient(colors: [theme.primary.opacity(0.35), theme.primary.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                            .interpolationMethod(.catmullRom)
                        LineMark(x: .value("Mois", p.label), y: .value("Revenu", p.revenue))
                            .foregroundStyle(theme.primary)
                            .interpolationMethod(.catmullRom)
                        LineMark(x: .value("Mois", p.label), y: .value("Marge", p.margin))
                            .foregroundStyle(.green)
                            .interpolationMethod(.catmullRom)
                    }
                }
                .chartForegroundStyleScale(["Revenu": theme.primary, "Marge": .green])
                .frame(height: 200)
                HStack(spacing: 16) {
                    Label("Revenu", systemImage: "circle.fill").foregroundStyle(theme.primary)
                    Label("Marge", systemImage: "circle.fill").foregroundStyle(.green)
                }
                .font(.caption2).labelStyle(.titleAndIcon)
            }
        }
    }

    // MARK: - Channels donut

    private func channelsChart(_ m: DashboardOverview) -> some View {
        let pos = m.salesTotal, b2b = m.invoicesTotal
        let total = pos + b2b
        let slices: [(name: String, value: Double, color: Color)] = total > 0
            ? [("POS / Boutique", pos, .indigo), ("Facturation B2B", b2b, .green)].filter { $0.1 > 0 }
            : []
        return SectionCard(title: "Canaux de vente", subtitle: "Répartition du chiffre d'affaires") {
            if slices.isEmpty {
                emptyChart(icon: "chart.pie.fill", text: "Aucune vente enregistrée")
            } else {
                Chart(slices, id: \.name) { s in
                    SectorMark(angle: .value("CA", s.value), innerRadius: .ratio(0.6), angularInset: 2)
                        .foregroundStyle(s.color)
                        .cornerRadius(4)
                }
                .frame(height: 180)
                VStack(spacing: 8) {
                    ForEach(slices, id: \.name) { s in
                        HStack {
                            Circle().fill(s.color).frame(width: 10, height: 10)
                            Text(s.name).font(.caption)
                            Spacer()
                            Text(compactFCFA(s.value)).font(.caption.bold())
                            Text("\(Int(s.value / total * 100)) %").font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Treasury 7-day prediction

    private func treasuryPrediction(_ m: DashboardOverview) -> some View {
        let monthlyIn = m.txMonthlyIn > 0 ? m.txMonthlyIn : m.salesTotal
        let monthlyOut = m.txMonthlyOut > 0 ? m.txMonthlyOut : m.invoicesTotal * 0.3
        let dailyNet = (monthlyIn - monthlyOut) / 30
        let points = (1...7).map { i -> (day: String, balance: Double) in
            let d = Calendar.current.date(byAdding: .day, value: i, to: Date()) ?? Date()
            return (d.formatted(.dateTime.weekday(.abbreviated)), Double(i) * dailyNet)
        }
        let positive = dailyNet >= 0
        return SectionCard(title: "Prévision de trésorerie", subtitle: "7 prochains jours · \(positive ? "+" : "")\(compactFCFA(dailyNet))/jour estimé") {
            Chart(points, id: \.day) { p in
                AreaMark(x: .value("Jour", p.day), y: .value("Solde", p.balance))
                    .foregroundStyle(LinearGradient(colors: [(positive ? Color.green : .red).opacity(0.3), .clear], startPoint: .top, endPoint: .bottom))
                    .interpolationMethod(.catmullRom)
                LineMark(x: .value("Jour", p.day), y: .value("Solde", p.balance))
                    .foregroundStyle(positive ? .green : .red)
                    .interpolationMethod(.catmullRom)
            }
            .frame(height: 130)
        }
    }

    // MARK: - TERAS alerts

    private var terasAlertsSection: some View {
        SectionCard(title: "Alertes TERAS", subtitle: "\(alerts.filter { $0.status == "open" }.count) active(s)") {
            VStack(spacing: 0) {
                ForEach(Array(alerts.filter { $0.status == "open" }.prefix(4))) { a in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption).foregroundStyle(colorFor(a.severityColorName))
                            .frame(width: 22)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(a.title).font(.subheadline.bold())
                            Text("\(a.module) · \(a.recommendation)").font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                        }
                        Spacer()
                        StatusPill(text: a.severity, colorName: a.severityColorName)
                    }
                    .padding(.vertical, 8)
                    if a.id != alerts.filter({ $0.status == "open" }).prefix(4).last?.id { Divider() }
                }
            }
        }
    }

    // MARK: - Urgent tasks

    private var urgentTasks: [KTask] {
        tasks.filter { $0.status != "done" }
            .sorted { ($0.priority == "high" ? 0 : 1) < ($1.priority == "high" ? 0 : 1) }
            .prefix(4).map { $0 }
    }
    private var tasksSection: some View {
        SectionCard(title: "Tâches urgentes", subtitle: "\(urgentTasks.count) à traiter") {
            VStack(spacing: 0) {
                ForEach(urgentTasks) { t in
                    HStack(spacing: 10) {
                        AvatarView(initials: initialsFrom(t.assignee_name), size: 30, color: colorFor(t.priorityColorName))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t.title).font(.subheadline.bold()).lineLimit(1)
                            Text(t.assignee_name + (t.due_date != nil ? " · \(shortDate(t.due_date))" : "")).font(.caption2).foregroundStyle(.secondary)
                        }
                        Spacer()
                        StatusPill(text: t.priority == "high" ? "Haute" : "Moyenne", colorName: t.priorityColorName)
                    }
                    .padding(.vertical, 7)
                    if t.id != urgentTasks.last?.id { Divider() }
                }
            }
        }
    }

    // MARK: - Today agenda

    private var todayMeetings: [Meeting] {
        let today = Date().formatted(.iso8601.year().month().day().dateSeparator(.dash)).prefix(10)
        return meetings.filter { $0.start_at.hasPrefix(today) }
            .sorted { $0.start_at < $1.start_at }.prefix(4).map { $0 }
    }
    private var agendaSection: some View {
        SectionCard(title: "Agenda du jour", subtitle: nil) {
            VStack(spacing: 0) {
                ForEach(todayMeetings) { mtg in
                    HStack(spacing: 12) {
                        Text(timeOf(mtg.start_at))
                            .font(.caption.bold()).foregroundStyle(theme.primary)
                            .frame(width: 52, height: 40)
                            .background(theme.primary.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(mtg.title).font(.subheadline.bold()).lineLimit(1)
                            Text(mtg.location.isEmpty ? "Sans lieu" : mtg.location).font(.caption2).foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .padding(.vertical, 6)
                    if mtg.id != todayMeetings.last?.id { Divider() }
                }
            }
        }
    }

    // MARK: - Compliance

    private func complianceSection(_ m: DashboardOverview) -> some View {
        let checks = m.compliance?.checks ?? []
        return SectionCard(title: "Conformité réglementaire", subtitle: nil) {
            if checks.isEmpty {
                Text("Conformité non évaluée").font(.caption).foregroundStyle(.secondary)
            } else {
                VStack(spacing: 8) {
                    ForEach(checks) { c in
                        HStack {
                            Text(c.label).font(.subheadline)
                            Spacer()
                            StatusPill(text: c.status == "ok" ? "OK" : "À vérifier", colorName: c.status == "ok" ? "green" : "orange")
                        }
                    }
                }
            }
        }
    }

    // MARK: - Low stock

    private func lowStockSection(_ m: DashboardOverview) -> some View {
        SectionCard(title: "Stocks faibles", subtitle: "\(m.low_stock.count) produit(s)") {
            VStack(spacing: 0) {
                ForEach(Array(m.low_stock.prefix(5))) { item in
                    HStack(spacing: 10) {
                        Image(systemName: "exclamationmark.triangle.fill").font(.caption).foregroundStyle(.orange).frame(width: 20)
                        Text(item.name).font(.subheadline).lineLimit(1)
                        Spacer()
                        Text("\(item.stock_quantity) restant(s)").font(.caption.bold()).foregroundStyle(.orange)
                    }
                    .padding(.vertical, 7)
                    if item.id != m.low_stock.prefix(5).last?.id { Divider() }
                }
            }
        }
    }

    // MARK: - Departments

    private var departments: [(name: String, count: Int)] {
        Dictionary(grouping: employees) { $0.department.isEmpty ? "Autres" : $0.department }
            .map { (name: $0.key, count: $0.value.count) }
            .sorted { $0.count > $1.count }.prefix(6).map { $0 }
    }
    private var departmentsSection: some View {
        SectionCard(title: "Performance par service", subtitle: nil) {
            VStack(spacing: 10) {
                ForEach(departments, id: \.name) { d in
                    HStack {
                        Text(d.name).font(.subheadline).frame(maxWidth: .infinity, alignment: .leading)
                        ProgressView(value: Double(min(60 + d.count * 4, 96)), total: 100).tint(theme.primary).frame(width: 90)
                        Text("\(d.count)").font(.caption.bold()).foregroundStyle(.secondary).frame(width: 28, alignment: .trailing)
                    }
                }
            }
        }
    }

    // MARK: - Investments

    private var investmentsSection: some View {
        SectionCard(title: "Portefeuille", subtitle: "\(investments.count) position(s)") {
            VStack(spacing: 0) {
                ForEach(investments) { inv in
                    HStack(spacing: 10) {
                        Text(inv.ticker.prefix(2))
                            .font(.caption.bold()).foregroundStyle(theme.primary)
                            .frame(width: 36, height: 36)
                            .background(theme.primary.opacity(0.12), in: RoundedRectangle(cornerRadius: 9))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(inv.ticker).font(.subheadline.bold())
                            Text(inv.display_name).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(compactFCFA(inv.invested_amount)).font(.subheadline.bold())
                            Text("\(inv.shares.formatted(.number.precision(.fractionLength(0...2)))) parts").font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 7)
                    if inv.id != investments.last?.id { Divider() }
                }
            }
        }
    }

    // MARK: - Helpers

    private func emptyChart(icon: String, text: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(.largeTitle).foregroundStyle(.tertiary)
            Text(text).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 140)
    }
    private func colorFor(_ name: String) -> Color {
        switch name { case "red": .red; case "orange": .orange; case "green": .green; case "blue": .blue; default: .gray }
    }
    private func initialsFrom(_ name: String) -> String {
        name.components(separatedBy: " ").prefix(2).compactMap { $0.first }.map(String.init).joined().uppercased()
    }
    private func timeOf(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        if let d = f.date(from: iso) { return d.formatted(.dateTime.hour().minute()) }
        return String(iso.suffix(from: iso.index(iso.startIndex, offsetBy: min(11, iso.count))).prefix(5))
    }

    // MARK: - Data loading

    private func load() async {
        isLoading = true; error = nil
        do {
            async let ov = APIClient.shared.dashboardOverview()
            async let tr = APIClient.shared.revenueSeries(period: period.apiValue)
            async let al = APIClient.shared.terasAlerts()
            async let tk = APIClient.shared.tasks()
            async let mt = APIClient.shared.meetings()
            async let iv = APIClient.shared.investments()
            async let em = APIClient.shared.employees()
            overview = try await ov
            trend = (try? await tr) ?? []
            alerts = (try? await al) ?? []
            tasks = (try? await tk) ?? []
            meetings = (try? await mt) ?? []
            investments = (try? await iv) ?? []
            employees = (try? await em) ?? []
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        isLoading = false
    }

    private func loadTrend() async {
        trend = (try? await APIClient.shared.revenueSeries(period: period.apiValue)) ?? []
    }

    private func generateAISummary() async {
        guard let m = overview else { return }
        aiLoading = true
        let kpis = "Trésorerie \(compactFCFA(m.treasury)), Encaissé \(compactFCFA(m.invoicesPaid)), TERAS \(m.terasScore)/100, \(m.employees) employés, \(alerts.filter { $0.status == "open" }.count) alertes."
        let prompt = "Donne un résumé synthétique (3-4 phrases) de la santé de mon entreprise à partir de ces indicateurs : \(kpis). Sois concret et propose une priorité."
        do {
            let resp = try await APIClient.shared.chatRich(messages: [ChatMessage(role: "user", content: prompt, sources: [], signals: [])], module: "dashboard")
            aiSummary = resp.answer
        } catch {
            aiSummary = "Limule est indisponible pour le moment."
        }
        aiLoading = false
    }
}

// MARK: - Reusable section card

struct SectionCard<Content: View>: View {
    let title: String
    let subtitle: String?
    @ViewBuilder var content: () -> Content
    @EnvironmentObject private var theme: CompanyTheme

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                if let subtitle { Text(subtitle).font(.caption).foregroundStyle(.secondary) }
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background {
            if #available(iOS 26.0, macOS 26.0, *), theme.useLiquidGlass {
                let s = RoundedRectangle(cornerRadius: theme.cardRadius, style: .continuous)
                s.fill(.clear).glassEffect(.regular, in: s)
            } else {
                RoundedRectangle(cornerRadius: theme.cardRadius, style: .continuous).fill(.ultraThinMaterial)
            }
        }
        .padding(.horizontal)
    }
}

// MARK: - KPI tile (label + value + delta)

private struct KpiTile: View {
    let label: String
    let value: String
    let delta: String
    let icon: String
    let tint: Color
    @EnvironmentObject private var theme: CompanyTheme

    var body: some View {
        GlassCard(padding: 16, cornerRadius: theme.cardRadius) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(label.uppercased()).font(.caption2.bold()).foregroundStyle(.secondary)
                    Spacer()
                    ZStack {
                        Circle().fill(tint.opacity(0.15)).frame(width: 32, height: 32)
                        Image(systemName: icon).font(.caption.bold()).foregroundStyle(tint)
                    }
                }
                Text(value).font(.title2.bold()).minimumScaleFactor(0.6).lineLimit(1)
                Text(delta).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
        }
    }
}

// MARK: - Minimal bar chart (réutilisé par EnterpriseViews → Rapports)

struct TrendBarsView: View {
    let points: [RevenueSeriesPoint]
    @EnvironmentObject private var theme: CompanyTheme

    var maxValue: Double { points.map(\.revenue).max() ?? 1 }

    var body: some View {
        GlassCard(padding: 16, cornerRadius: 18) {
            HStack(alignment: .bottom, spacing: 6) {
                ForEach(points.suffix(14), id: \.label) { point in
                    VStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(theme.primary.opacity(0.8))
                            .frame(height: max(4, CGFloat(point.revenue / maxValue) * 80))
                        Text(String(point.label.suffix(2)))
                            .font(.system(size: 8))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(maxWidth: .infinity)
        }
    }
}
