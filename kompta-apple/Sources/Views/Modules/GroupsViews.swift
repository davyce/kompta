import SwiftUI
import UniformTypeIdentifiers

// ============================================================================
//  Wave 5 — Groupes & Tontines (associations, tontines, coopératives)
//  Liste de groupes → hub par groupe → 14 écrans (tableau de bord, membres,
//  cotisations, transactions, dépenses, réunions, calendrier, anniversaires,
//  discussion, documents, votes, direction, assistant IA, rapports, réglages).
// ============================================================================

// MARK: - Liste des groupes

struct GroupsListView: View {
    @StateObject private var state = Loadable<[OrgGroup]>()
    @State private var showNew = false

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun groupe", emptyIcon: "person.3.fill", reload: load) { groups in
            List {
                ForEach(groups) { g in
                    NavigationLink { GroupHubView(group: g) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(g.name).font(.subheadline.bold())
                                Text("\(g.type.capitalized) · \(g.city)").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            StatusPill(text: g.status, colorName: g.status == "active" ? "green" : "gray")
                        }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Groupes & Tontines")
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { GroupFormView { await load() } }
    }
    private func load() async { await state.load { try await APIClient.shared.groups() } }
}

struct GroupFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var type = "association"
    @State private var description = ""
    @State private var city = ""
    @State private var currency = "XAF"
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Groupe") {
                    TextField("Nom *", text: $name)
                    Picker("Type", selection: $type) {
                        Text("Association").tag("association"); Text("Tontine").tag("tontine")
                        Text("Coopérative").tag("cooperative"); Text("Autre").tag("autre")
                    }
                    TextField("Ville", text: $city)
                    TextField("Description", text: $description, axis: .vertical).lineLimit(2...5)
                }
            }
            .navigationTitle("Nouveau groupe")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Créer") { Task { await save() } }.disabled(name.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        do {
            _ = try await APIClient.shared.createGroup(GroupPayload(name: name, type: type, description: description, city: city, currency: currency))
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}

// MARK: - Hub d'un groupe

struct GroupHubView: View {
    let group: OrgGroup
    @EnvironmentObject private var theme: CompanyTheme
    private let cols = [GridItem(.adaptive(minimum: 150), spacing: 14)]

    private var destinations: [AppModule] {
        [
            AppModule("g_dash", "Tableau de bord", icon: "gauge.with.dots.needle.67percent", tint: .blue, section: "") { GroupDashboardView(group: group) },
            AppModule("g_members", "Membres", icon: "person.3.fill", tint: .indigo, section: "") { GroupMembersView(group: group) },
            AppModule("g_contrib", "Cotisations", icon: "banknote.fill", tint: .green, section: "") { GroupContributionsView(group: group) },
            AppModule("g_txn", "Transactions", icon: "arrow.left.arrow.right", tint: .teal, section: "") { GroupTransactionsView(group: group) },
            AppModule("g_exp", "Dépenses", icon: "cart.fill", tint: .orange, section: "") { GroupExpensesView(group: group) },
            AppModule("g_meet", "Réunions", icon: "calendar.badge.clock", tint: .purple, section: "") { GroupMeetingsView(group: group) },
            AppModule("g_cal", "Calendrier", icon: "calendar", tint: .pink, section: "") { GroupCalendarView(group: group) },
            AppModule("g_bday", "Anniversaires", icon: "gift.fill", tint: .red, section: "") { GroupBirthdaysView(group: group) },
            AppModule("g_chat", "Discussion", icon: "bubble.left.and.bubble.right.fill", tint: .blue, section: "") { GroupChatRoomsView(group: group) },
            AppModule("g_docs", "Documents", icon: "doc.on.doc.fill", tint: .gray, section: "") { GroupDocumentsView(group: group) },
            AppModule("g_votes", "Votes", icon: "checkmark.seal.fill", tint: .mint, section: "") { GroupVotesView(group: group) },
            AppModule("g_lead", "Direction", icon: "crown.fill", tint: .yellow, section: "") { GroupLeadershipView(group: group) },
            AppModule("g_ai", "Limule", icon: KomptaBrand.limuleIcon, tint: KomptaBrand.limuleBlue, section: "") { GroupAIAssistantView(group: group) },
            AppModule("g_reports", "Rapports", icon: "doc.text.magnifyingglass", tint: .brown, section: "") { GroupReportsView(group: group) },
            AppModule("g_roles", "Rôles & accès", icon: "person.badge.shield.checkmark", tint: .indigo, section: "") {
                RolesManagementView(scope: "group", title: "Rôles du groupe", groupId: group.id)
            },
            AppModule("g_settings", "Réglages", icon: "gearshape.fill", tint: .gray, section: "") { GroupSettingsView(group: group) },
        ]
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                headerCard
                LazyVGrid(columns: cols, spacing: 14) {
                    ForEach(destinations) { m in
                        NavigationLink { m.make() } label: { ModuleTile(module: m) }
                            .buttonStyle(.plain)
                    }
                }
            }
            .padding()
        }
        .navigationTitle(group.name)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.large)
        #endif
    }

    private var headerCard: some View {
        GlassCard(padding: 16, cornerRadius: 18, tint: theme.primary.opacity(0.08)) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(theme.primary.opacity(0.15)).frame(width: 54, height: 54)
                    Image(systemName: "person.3.fill").font(.title3).foregroundStyle(theme.primary)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(group.name).font(.title3.bold())
                    Text([groupTypeLabel(group.type), group.city].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(.secondary)
                    HStack(spacing: 8) {
                        Label("\(group.member_count ?? 0) membre(s)", systemImage: "person.2")
                            .font(.caption2.bold())
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(theme.primary.opacity(0.12), in: Capsule())
                            .foregroundStyle(theme.primary)
                        if let role = group.my_roles?.first, !role.isEmpty {
                            Label(role.capitalized, systemImage: "checkmark.seal.fill")
                                .font(.caption2.bold())
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(Color.orange.opacity(0.15), in: Capsule())
                                .foregroundStyle(.orange)
                        }
                    }
                }
                Spacer()
            }
        }
    }

    private func groupTypeLabel(_ t: String) -> String {
        switch t {
        case "tontine": return "Tontine"
        case "association": return "Association"
        case "cooperative": return "Coopérative"
        case "family": return "Famille"
        default: return t.isEmpty ? "Groupe" : t.capitalized
        }
    }
}

// MARK: - Tableau de bord

struct GroupDashboardView: View {
    let group: OrgGroup
    @StateObject private var state = Loadable<GroupFinanceDashboard>()

    var body: some View {
        ScrollView {
            if let s = state.value {
                VStack(spacing: 14) {
                    MetricCard(title: "Solde", value: fcfa(s.balance), icon: "wallet.pass.fill",
                               color: s.balance >= 0 ? .green : .red)
                    HStack(spacing: 12) {
                        MetricCard(title: "Attendu", value: fcfa(s.total_contributions_expected), icon: "arrow.down.circle", color: .blue)
                        MetricCard(title: "Reçu", value: fcfa(s.total_contributions_received), icon: "checkmark.circle", color: .green)
                    }
                    MetricCard(title: "Dépenses", value: fcfa(s.total_expenses), icon: "cart.fill", color: .orange)
                    HStack(spacing: 12) {
                        MetricCard(title: "À jour", value: "\(s.members_up_to_date)/\(s.members_count)", icon: "person.fill.checkmark", color: .green)
                        MetricCard(title: "En retard", value: "\(s.members_late)", icon: "person.fill.xmark", color: .red)
                    }
                    if s.pending_expenses > 0 {
                        MetricCard(title: "Dépenses en attente", value: "\(s.pending_expenses)", icon: "clock.fill", color: .orange)
                    }
                }
                .padding()
            } else if state.isLoading {
                VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in ShimmerBox(height: 70) } }.padding()
            } else if let err = state.error {
                ContentUnavailableView { Label("Erreur", systemImage: "exclamationmark.triangle.fill") } description: { Text(err) }
            }
        }
        .navigationTitle("Tableau de bord")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
        .refreshable { await load() }
    }
    private func load() async { await state.load { try await APIClient.shared.groupFinanceDashboard(group.id) } }
}

// MARK: - Membres

struct GroupMembersView: View {
    let group: OrgGroup
    @StateObject private var state = Loadable<[GroupMember]>()
    @State private var showNew = false

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun membre", emptyIcon: "person.3", reload: load) { members in
            List {
                ForEach(members) { m in
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(m.full_name).font(.subheadline.bold())
                            Text(m.roles.isEmpty ? (m.phone.isEmpty ? "Membre" : m.phone) : m.roles.joined(separator: ", "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        StatusPill(text: m.status, colorName: m.status == "active" ? "green" : "gray")
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Membres")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { GroupMemberFormView(group: group) { await load() } }
    }
    private func load() async { await state.load { try await APIClient.shared.groupMembers(group.id) } }
}

struct GroupMemberFormView: View {
    let group: OrgGroup
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var fullName = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var profession = ""
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Membre") {
                    TextField("Nom complet *", text: $fullName)
                    TextField("Téléphone", text: $phone)
                    TextField("E-mail", text: $email)
                    TextField("Profession", text: $profession)
                }
            }
            .navigationTitle("Nouveau membre")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Ajouter") { Task { await save() } }.disabled(fullName.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        do {
            _ = try await APIClient.shared.addGroupMember(group.id, GroupMemberPayload(full_name: fullName, phone: phone, email: email, profession: profession))
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}

// MARK: - Cotisations (plans + paiements)

struct GroupContributionsView: View {
    let group: OrgGroup
    @State private var tab = 0
    @StateObject private var plans = Loadable<[ContributionPlan]>()
    @StateObject private var payments = Loadable<[ContributionPayment]>()
    @State private var showNewPlan = false
    @State private var showNewPayment = false

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                Text("Plans").tag(0); Text("Paiements").tag(1)
            }
            .pickerStyle(.segmented)
            .padding()

            if tab == 0 {
                AsyncList(state: plans, emptyTitle: "Aucun plan", emptyIcon: "list.bullet.rectangle", reload: loadPlans) { items in
                    List {
                        ForEach(items) { p in
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(p.title).font(.subheadline.bold())
                                    Text(p.frequency.capitalized).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(fcfa(p.amount)).font(.subheadline.bold())
                            }
                        }
                    }
                    #if os(iOS)
                    .listStyle(.insetGrouped)
                    #endif
                }
            } else {
                AsyncList(state: payments, emptyTitle: "Aucun paiement", emptyIcon: "banknote", reload: loadPayments) { items in
                    List {
                        ForEach(items) { p in
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(p.member_name).font(.subheadline.bold())
                                    Text(p.plan_title).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 3) {
                                    Text(fcfa(p.amount_paid)).font(.subheadline.bold())
                                    StatusPill(text: p.status, colorName: p.status == "validated" ? "green" : "orange")
                                }
                            }
                            .swipeActions {
                                if p.status != "validated" {
                                    Button("Valider") { Task { await validate(p) } }.tint(.green)
                                }
                            }
                        }
                    }
                    #if os(iOS)
                    .listStyle(.insetGrouped)
                    #endif
                }
            }
        }
        .navigationTitle("Cotisations")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { tab == 0 ? (showNewPlan = true) : (showNewPayment = true) } label: { Image(systemName: "plus") }
            }
        }
        .task { await loadPlans(); await loadPayments() }
        .sheet(isPresented: $showNewPlan) { GroupPlanFormView(group: group) { await loadPlans() } }
        .sheet(isPresented: $showNewPayment) { GroupPaymentFormView(group: group, plans: plans.value ?? []) { await loadPayments() } }
    }

    private func loadPlans() async { await plans.load { try await APIClient.shared.groupPlans(group.id) } }
    private func loadPayments() async { await payments.load { try await APIClient.shared.groupPayments(group.id) } }
    private func validate(_ p: ContributionPayment) async {
        do { try await APIClient.shared.validateGroupPayment(group.id, p.id); await loadPayments() } catch { }
    }
}

struct GroupPlanFormView: View {
    let group: OrgGroup
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var amount = ""
    @State private var frequency = "mensuelle"
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Plan de cotisation") {
                    TextField("Titre *", text: $title)
                    TextField("Montant *", text: $amount)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                    Picker("Fréquence", selection: $frequency) {
                        Text("Hebdomadaire").tag("hebdomadaire"); Text("Mensuelle").tag("mensuelle")
                        Text("Trimestrielle").tag("trimestrielle"); Text("Annuelle").tag("annuelle")
                    }
                }
            }
            .navigationTitle("Nouveau plan")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Créer") { Task { await save() } }.disabled(title.isEmpty || amount.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        guard let amt = Double(amount.replacingOccurrences(of: ",", with: ".")) else { return }
        saving = true
        do {
            _ = try await APIClient.shared.createGroupPlan(group.id, ContributionPlanPayload(title: title, amount: amt, currency: group.currency, frequency: frequency))
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}

struct GroupPaymentFormView: View {
    let group: OrgGroup
    let plans: [ContributionPlan]
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @StateObject private var members = Loadable<[GroupMember]>()
    @State private var memberId: Int?
    @State private var planId: Int?
    @State private var amount = ""
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Paiement") {
                    Picker("Membre *", selection: $memberId) {
                        Text("Choisir…").tag(Int?.none)
                        ForEach(members.value ?? []) { m in Text(m.full_name).tag(Int?.some(m.id)) }
                    }
                    Picker("Plan *", selection: $planId) {
                        Text("Choisir…").tag(Int?.none)
                        ForEach(plans) { p in Text(p.title).tag(Int?.some(p.id)) }
                    }
                    TextField("Montant payé *", text: $amount)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                }
            }
            .navigationTitle("Nouveau paiement")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }
                        .disabled(memberId == nil || planId == nil || amount.isEmpty || saving)
                }
            }
            .task { await members.load { try await APIClient.shared.groupMembers(group.id) } }
        }
    }

    private func save() async {
        guard let memberId, let planId, let amt = Double(amount.replacingOccurrences(of: ",", with: ".")) else { return }
        saving = true
        do {
            _ = try await APIClient.shared.createGroupPayment(group.id, ContributionPaymentPayload(member_id: memberId, plan_id: planId, amount_paid: amt))
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}

// MARK: - Transactions (lecture)

struct GroupTransactionsView: View {
    let group: OrgGroup
    @StateObject private var state = Loadable<[GroupTransaction]>()

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune transaction", emptyIcon: "arrow.left.arrow.right", reload: load) { items in
            List {
                ForEach(items) { t in
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(t.description.isEmpty ? t.category.capitalized : t.description).font(.subheadline.bold())
                            Text(shortDate(t.transaction_date)).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(fcfa(t.amount)).font(.subheadline.bold())
                            .foregroundStyle(t.type == "credit" ? .green : .red)
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Transactions")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
        .refreshable { await load() }
    }
    private func load() async { await state.load { try await APIClient.shared.groupTransactions(group.id) } }
}

// MARK: - Dépenses

struct GroupExpensesView: View {
    let group: OrgGroup
    @StateObject private var state = Loadable<[GroupExpense]>()
    @State private var showNew = false

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune dépense", emptyIcon: "cart", reload: load) { items in
            List {
                ForEach(items) { e in
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(e.title).font(.subheadline.bold())
                            Text(shortDate(e.expense_date)).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 3) {
                            Text(fcfa(e.amount)).font(.subheadline.bold())
                            StatusPill(text: e.status, colorName: e.status == "approved" ? "green" : "orange")
                        }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Dépenses")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { GroupExpenseFormView(group: group) { await load() } }
    }
    private func load() async { await state.load { try await APIClient.shared.groupExpenses(group.id) } }
}

struct GroupExpenseFormView: View {
    let group: OrgGroup
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var category = ""
    @State private var amount = ""
    @State private var paidTo = ""
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Dépense") {
                    TextField("Titre *", text: $title)
                    TextField("Catégorie", text: $category)
                    TextField("Montant *", text: $amount)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                    TextField("Payé à", text: $paidTo)
                }
            }
            .navigationTitle("Nouvelle dépense")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }.disabled(title.isEmpty || amount.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        guard let amt = Double(amount.replacingOccurrences(of: ",", with: ".")) else { return }
        saving = true
        do {
            _ = try await APIClient.shared.createGroupExpense(group.id, GroupExpensePayload(title: title, category: category, amount: amt, currency: group.currency, paid_to: paidTo))
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}

// MARK: - Réunions

struct GroupMeetingsView: View {
    let group: OrgGroup
    @StateObject private var state = Loadable<[GroupMeeting]>()
    @State private var showNew = false

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune réunion", emptyIcon: "calendar.badge.clock", reload: load) { items in
            List {
                ForEach(items) { m in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(m.title).font(.subheadline.bold())
                        Text("\(shortDate(m.start_datetime)) · \(m.location)").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Réunions")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { GroupMeetingFormView(group: group) { await load() } }
    }
    private func load() async { await state.load { try await APIClient.shared.groupMeetings(group.id) } }
}

struct GroupMeetingFormView: View {
    let group: OrgGroup
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var location = ""
    @State private var agenda = ""
    @State private var start = Date()
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Réunion") {
                    TextField("Titre *", text: $title)
                    DatePicker("Début", selection: $start)
                    TextField("Lieu / lien", text: $location)
                    TextField("Agenda", text: $agenda, axis: .vertical).lineLimit(2...5)
                }
            }
            .navigationTitle("Nouvelle réunion")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }.disabled(title.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        let f = ISO8601DateFormatter()
        do {
            _ = try await APIClient.shared.createGroupMeeting(group.id, GroupMeetingPayload(title: title, location: location, start_datetime: f.string(from: start), agenda: agenda))
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}

// MARK: - Calendrier

struct GroupCalendarView: View {
    let group: OrgGroup
    @StateObject private var state = Loadable<[GroupCalendarEvent]>()

    private func icon(for type: String) -> String {
        switch type {
        case "meeting": return "calendar.badge.clock"
        case "activity": return "figure.2.and.child.holdinghands"
        case "vote": return "checkmark.seal.fill"
        case "birthday": return "gift.fill"
        default: return "calendar"
        }
    }

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun événement à venir", emptyIcon: "calendar", reload: load) { events in
            List {
                ForEach(events) { e in
                    HStack {
                        Image(systemName: icon(for: e.type)).foregroundStyle(.secondary).frame(width: 24)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(e.title).font(.subheadline.bold())
                            Text(shortDate(e.start)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Calendrier")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
        .refreshable { await load() }
    }
    private func load() async { await state.load { try await APIClient.shared.groupCalendar(group.id).events } }
}

// MARK: - Anniversaires

struct GroupBirthdaysView: View {
    let group: OrgGroup
    @StateObject private var state = Loadable<[GroupBirthday]>()

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun anniversaire à venir", emptyIcon: "gift", reload: load) { items in
            List {
                ForEach(items) { b in
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(b.member_name).font(.subheadline.bold())
                            Text(shortDate(b.start)).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("J-\(b.days_until)").font(.caption.bold()).foregroundStyle(.orange)
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Anniversaires")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
        .refreshable { await load() }
    }
    private func load() async { await state.load { try await APIClient.shared.groupBirthdays(group.id) } }
}

// MARK: - Discussion

struct GroupChatRoomsView: View {
    let group: OrgGroup
    @StateObject private var state = Loadable<[GroupChatRoom]>()

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun salon", emptyIcon: "bubble.left.and.bubble.right", reload: load) { rooms in
            List {
                ForEach(rooms) { r in
                    NavigationLink { GroupChatRoomView(group: group, room: r) } label: {
                        Label(r.name, systemImage: "number")
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Discussion")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
        .refreshable { await load() }
    }
    private func load() async { await state.load { try await APIClient.shared.groupChatRooms(group.id) } }
}

struct GroupChatRoomView: View {
    let group: OrgGroup
    let room: GroupChatRoom
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var state = Loadable<[GroupChatMessage]>()
    @State private var draft = ""
    @State private var sending = false

    var body: some View {
        VStack(spacing: 0) {
            AsyncList(state: state, emptyTitle: "Aucun message", emptyIcon: "bubble.left", reload: load) { msgs in
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(msgs) { m in groupBubble(m).id(m.id) }
                        }
                        .padding()
                    }
                    .onChange(of: msgs.count) { _, _ in withAnimation { proxy.scrollTo(msgs.last?.id, anchor: .bottom) } }
                }
            }
            Divider()
            HStack(spacing: 10) {
                TextField("Message dans #\(room.name)…", text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder).lineLimit(1...4)
                    .onSubmit { Task { await send() } }
                Button { Task { await send() } } label: {
                    Image(systemName: sending ? "ellipsis.circle" : "arrow.up.circle.fill").font(.title2)
                        .foregroundStyle(draft.trimmingCharacters(in: .whitespaces).isEmpty ? .secondary : theme.primary)
                }
                .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty || sending)
                .buttonStyle(.plain)
            }
            .padding()
        }
        .navigationTitle("#\(room.name)")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
    }

    private func groupBubble(_ m: GroupChatMessage) -> some View {
        HStack(alignment: .top, spacing: 8) {
            AvatarView(initials: initials(m.sender_name), size: 30, color: theme.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text(m.sender_name).font(.caption2.bold()).foregroundStyle(.secondary)
                Text(m.content).font(.subheadline)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            Spacer(minLength: 30)
        }
    }
    private func initials(_ name: String) -> String {
        name.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined().uppercased()
    }

    private func load() async { await state.load { try await APIClient.shared.groupChatMessages(group.id, roomId: room.id) } }
    private func send() async {
        sending = true
        let text = draft
        do { _ = try await APIClient.shared.sendGroupMessage(group.id, roomId: room.id, GroupMessagePayload(content: text)); draft = ""; await load() }
        catch { }
        sending = false
    }
}

// MARK: - Documents

struct GroupDocumentsView: View {
    let group: OrgGroup
    @StateObject private var state = Loadable<[GroupDocument]>()
    @State private var showImporter = false
    @State private var uploading = false

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun document", emptyIcon: "doc", reload: load) { docs in
            List {
                ForEach(docs) { d in
                    HStack {
                        Image(systemName: "doc.fill").foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(d.title).font(.subheadline.bold())
                            Text(d.category.capitalized).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Documents")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showImporter = true } label: { Image(systemName: uploading ? "hourglass" : "arrow.up.doc") }
                    .disabled(uploading)
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.pdf, .image, .plainText, .item],
                      allowsMultipleSelection: true) { result in Task { await handleImport(result) } }
    }
    private func load() async { await state.load { try await APIClient.shared.groupDocuments(group.id) } }

    private func handleImport(_ result: Result<[URL], Error>) async {
        guard case .success(let urls) = result, !urls.isEmpty else { return }
        uploading = true
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url) else { continue }
            let ext = url.pathExtension.lowercased()
            let mime = ext == "pdf" ? "application/pdf" : ext == "png" ? "image/png"
                : (ext == "jpg" || ext == "jpeg") ? "image/jpeg" : ext == "txt" ? "text/plain" : "application/octet-stream"
            _ = try? await APIClient.shared.uploadGroupDocument(group.id, data: data, fileName: url.lastPathComponent,
                                                                mime: mime, title: url.deletingPathExtension().lastPathComponent)
        }
        uploading = false
        await load()
    }
}

// MARK: - Votes

struct GroupVotesView: View {
    let group: OrgGroup
    @StateObject private var state = Loadable<[GroupVote]>()
    @State private var showNew = false

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun vote", emptyIcon: "checkmark.seal", reload: load) { votes in
            List {
                ForEach(votes) { v in
                    NavigationLink { GroupVoteDetailView(group: group, vote: v) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(v.title).font(.subheadline.bold())
                                Text("\(v.options.count) options").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            StatusPill(text: v.status, colorName: v.status == "open" ? "green" : "gray")
                        }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Votes")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { GroupVoteFormView(group: group) { await load() } }
    }
    private func load() async { await state.load { try await APIClient.shared.groupVotes(group.id) } }
}

struct GroupVoteDetailView: View {
    let group: OrgGroup
    let vote: GroupVote
    @State private var selected: String?
    @State private var submitting = false
    @State private var submitted = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(vote.title).font(.title3.bold())
                if let desc = vote.description, !desc.isEmpty { Text(desc).font(.callout).foregroundStyle(.secondary) }
                ForEach(vote.options, id: \.self) { opt in
                    Button {
                        selected = opt
                    } label: {
                        HStack {
                            Text(opt)
                            Spacer()
                            if selected == opt { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
                        }
                        .padding()
                        .background(.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
                if submitted {
                    Label("Vote enregistré", systemImage: "checkmark.seal.fill").foregroundStyle(.green)
                } else {
                    KomptaButton(label: "Voter", icon: "checkmark", isLoading: submitting) { await submit() }
                        .disabled(selected == nil)
                }
            }
            .padding()
        }
        .navigationTitle("Vote")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private func submit() async {
        guard let selected else { return }
        submitting = true
        do { try await APIClient.shared.submitGroupVote(group.id, vote.id, GroupVoteSubmitPayload(selected_option: selected)); submitted = true }
        catch { }
        submitting = false
    }
}

struct GroupVoteFormView: View {
    let group: OrgGroup
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var optionsText = ""
    @State private var start = Date()
    @State private var end = Date().addingTimeInterval(86400 * 3)
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Vote") {
                    TextField("Titre *", text: $title)
                    TextField("Options (séparées par virgule) *", text: $optionsText)
                    DatePicker("Début", selection: $start)
                    DatePicker("Fin", selection: $end)
                }
            }
            .navigationTitle("Nouveau vote")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Créer") { Task { await save() } }.disabled(title.isEmpty || optionsText.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        let opts = optionsText.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        guard !opts.isEmpty else { return }
        saving = true
        let f = ISO8601DateFormatter()
        do {
            _ = try await APIClient.shared.createGroupVote(group.id, GroupVotePayload(title: title, options: opts, start_datetime: f.string(from: start), end_datetime: f.string(from: end)))
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}

// MARK: - Direction (bureau & mandats)

struct GroupLeadershipView: View {
    let group: OrgGroup
    @StateObject private var state = Loadable<GroupLeadershipResponse>()
    @StateObject private var members = Loadable<[GroupMember]>()

    private func name(for id: Int?) -> String {
        guard let id, let m = members.value?.first(where: { $0.id == id }) else { return "—" }
        return m.full_name
    }

    var body: some View {
        ScrollView {
            if let resp = state.value {
                VStack(alignment: .leading, spacing: 16) {
                    if let cur = resp.current {
                        GlassCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Bureau actuel").font(.headline)
                                LeadershipRow(role: "Président", name: name(for: cur.president_member_id))
                                LeadershipRow(role: "Vice-président", name: name(for: cur.vice_president_member_id))
                                LeadershipRow(role: "Secrétaire", name: name(for: cur.secretary_member_id))
                                LeadershipRow(role: "Trésorier", name: name(for: cur.treasurer_member_id))
                            }
                        }
                    }
                    if !resp.history.isEmpty {
                        Text("Historique des mandats").font(.headline)
                        ForEach(resp.history) { h in
                            GlassCard {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Président : \(name(for: h.president_member_id))").font(.subheadline.bold())
                                    Text("\(shortDate(h.mandate_start)) – \(h.mandate_end != nil ? shortDate(h.mandate_end) : "en cours")")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
                .padding()
            } else if state.isLoading {
                VStack(spacing: 12) { ForEach(0..<3, id: \.self) { _ in ShimmerBox(height: 60) } }.padding()
            } else if let err = state.error {
                ContentUnavailableView { Label("Erreur", systemImage: "exclamationmark.triangle.fill") } description: { Text(err) }
            }
        }
        .navigationTitle("Direction")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task {
            await members.load { try await APIClient.shared.groupMembers(group.id) }
            await state.load { try await APIClient.shared.groupLeadership(group.id) }
        }
        .refreshable { await state.load { try await APIClient.shared.groupLeadership(group.id) } }
    }
}

private struct LeadershipRow: View {
    let role: String
    let name: String
    var body: some View {
        HStack {
            Text(role).font(.caption).foregroundStyle(.secondary)
            Spacer()
            Text(name).font(.subheadline.bold())
        }
    }
}

// MARK: - Limule

struct GroupAIAssistantView: View {
    let group: OrgGroup
    @State private var question = ""
    @State private var asking = false
    @State private var answer: String?
    @State private var analyzing = false
    @State private var analysis: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                GlassCard {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 10) {
                            LimuleMark(size: 34)
                            Text("Demander à Limule").font(.headline)
                        }
                        TextField("Votre question sur le groupe…", text: $question, axis: .vertical)
                            .lineLimit(2...5)
                            #if os(iOS)
                            .textFieldStyle(.roundedBorder)
                            #endif
                        KomptaButton(label: "Demander à Limule", icon: KomptaBrand.limuleIcon, isLoading: asking) { await ask() }
                            .disabled(question.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                if let answer {
                    GlassCard { Text(answer).font(.callout) }
                }

                GlassCard {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Analyse des paiements").font(.headline)
                        Text("Taux de recouvrement, retards, anomalies détectées par Limule.")
                            .font(.caption).foregroundStyle(.secondary)
                        KomptaButton(label: "Analyser", icon: "chart.bar.xaxis", isLoading: analyzing) { await analyze() }
                    }
                }
                if let analysis {
                    GlassCard { Text(analysis).font(.callout) }
                }
            }
            .padding()
        }
        .navigationTitle("Limule")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private func ask() async {
        asking = true
        do { answer = try await APIClient.shared.groupAIAsk(group.id, GroupAIAskPayload(question: question)).answer }
        catch { }
        asking = false
    }

    private func analyze() async {
        analyzing = true
        do { analysis = try await APIClient.shared.groupAIPaymentAnalysis(group.id).analysis }
        catch { }
        analyzing = false
    }
}

// MARK: - Rapports

struct GroupReportsView: View {
    let group: OrgGroup
    @State private var tab = 0
    @StateObject private var payments = Loadable<GroupPaymentsReport>()
    @StateObject private var expenses = Loadable<GroupExpensesReport>()

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                Text("Cotisations").tag(0); Text("Dépenses").tag(1)
            }
            .pickerStyle(.segmented)
            .padding()

            ScrollView {
                if tab == 0 {
                    if let r = payments.value {
                        VStack(spacing: 14) {
                            HStack(spacing: 12) {
                                MetricCard(title: "Attendu", value: fcfa(r.total_due), icon: "arrow.down.circle", color: .blue)
                                MetricCard(title: "Reçu", value: fcfa(r.total_paid), icon: "checkmark.circle", color: .green)
                            }
                            MetricCard(title: "Taux de recouvrement", value: "\(Int(r.recovery_rate))%", icon: "percent", color: .purple)
                            ForEach(r.rows) { row in
                                GlassCard {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(row.member).font(.subheadline.bold())
                                            Text(row.plan).font(.caption).foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        StatusPill(text: row.status, colorName: row.status == "validated" ? "green" : "orange")
                                    }
                                }
                            }
                        }
                        .padding()
                    } else if payments.isLoading {
                        VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in ShimmerBox(height: 50) } }.padding()
                    }
                } else {
                    if let r = expenses.value {
                        VStack(spacing: 14) {
                            MetricCard(title: "Total dépenses", value: fcfa(r.total), icon: "cart.fill", color: .orange)
                            ForEach(r.rows) { row in
                                GlassCard {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(row.title).font(.subheadline.bold())
                                            Text(row.category.capitalized).font(.caption).foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        Text(fcfa(row.amount)).font(.subheadline.bold())
                                    }
                                }
                            }
                        }
                        .padding()
                    } else if expenses.isLoading {
                        VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in ShimmerBox(height: 50) } }.padding()
                    }
                }
            }
        }
        .navigationTitle("Rapports")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task {
            await payments.load { try await APIClient.shared.groupPaymentsReport(group.id) }
            await expenses.load { try await APIClient.shared.groupExpensesReport(group.id) }
        }
    }
}

// MARK: - Réglages

struct GroupSettingsView: View {
    let group: OrgGroup
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var city: String
    @State private var description: String
    @State private var saving = false
    @State private var showCloseConfirm = false
    @State private var closing = false

    init(group: OrgGroup) {
        self.group = group
        _name = State(initialValue: group.name)
        _city = State(initialValue: group.city)
        _description = State(initialValue: group.description)
    }

    var body: some View {
        Form {
            Section("Informations") {
                TextField("Nom", text: $name)
                TextField("Ville", text: $city)
                TextField("Description", text: $description, axis: .vertical).lineLimit(2...5)
                KomptaButton(label: "Enregistrer", icon: "checkmark", isLoading: saving) { await save() }
            }
            Section {
                Button(role: .destructive) { showCloseConfirm = true } label: {
                    Label("Fermer ce groupe", systemImage: "xmark.circle")
                }
            }
        }
        .navigationTitle("Réglages")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .confirmationDialog("Fermer définitivement ce groupe ?", isPresented: $showCloseConfirm, titleVisibility: .visible) {
            Button("Fermer le groupe", role: .destructive) { Task { await close() } }
            Button("Annuler", role: .cancel) { }
        }
    }

    private func save() async {
        saving = true
        do { _ = try await APIClient.shared.updateGroup(group.id, GroupUpdatePayload(name: name, description: description, city: city)) }
        catch { }
        saving = false
    }

    private func close() async {
        closing = true
        do { try await APIClient.shared.closeGroup(group.id, reason: ""); dismiss() }
        catch { }
        closing = false
    }
}
