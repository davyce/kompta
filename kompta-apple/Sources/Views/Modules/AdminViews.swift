import SwiftUI
import Charts

// ============================================================================
//  Wave 6 — Administration (super_admin only)
//  Vue d'ensemble, Entreprises, Utilisateurs, Tickets, Journal d'audit,
//  Analytique, Diffusion, Système (santé/préflight/drapeaux), Intégration,
//  Limule IA (aperçu/Grand Sage/jeu de données), Abonnements (forfaits/
//  promotions/entreprises). Visible only when AuthManager.currentUser?.role
//  == "super_admin" (gated in ModuleHub.swift / AppShell.swift).
// ============================================================================

// MARK: - Hub

struct AdminHubView: View {
    @EnvironmentObject private var auth: AuthManager
    private let cols = [GridItem(.adaptive(minimum: 150), spacing: 14)]

    /// A module tile is visible if the user is super_admin or their custom role
    /// grants the matching permission (mirrors SuperAdminShell.granted on macOS).
    private func granted(_ perm: String) -> Bool {
        let p = auth.currentUser?.adminPermissions ?? []
        return p.contains("*") || p.contains(perm)
    }

    private var destinations: [AppModule] {
        [
            AppModule("a_overview", "Vue d'ensemble", icon: "gauge.with.dots.needle.67percent", tint: .blue, section: "admin_overview") { AdminOverviewView() },
            AppModule("a_companies", "Entreprises", icon: "building.2.fill", tint: .indigo, section: "admin_companies") { AdminCompaniesView() },
            AppModule("a_users", "Utilisateurs", icon: "person.2.fill", tint: .teal, section: "admin_users") { AdminUsersView() },
            AppModule("a_tickets", "Tickets support", icon: "lifepreserver", tint: .red, section: "admin_tickets") { AdminTicketsView() },
            AppModule("a_audit", "Journal d'audit", icon: "doc.text.magnifyingglass", tint: .brown, section: "admin_audit") { AdminAuditLogsView() },
            AppModule("a_analytics", "Analytique", icon: "chart.line.uptrend.xyaxis", tint: .purple, section: "admin_analytics") { AdminAnalyticsView() },
            AppModule("a_broadcast", "Diffusion", icon: "megaphone.fill", tint: .orange, section: "admin_broadcast") { AdminBroadcastView() },
            AppModule("a_system", "Système", icon: "heart.text.square.fill", tint: .green, section: "admin_system") { AdminSystemView() },
            AppModule("a_onboarding", "Intégration", icon: "checklist", tint: .mint, section: "admin_overview") { AdminOnboardingView() },
            AppModule("a_limule", "Limule", icon: KomptaBrand.limuleIcon, tint: KomptaBrand.limuleBlue, section: "admin_overview") { AdminLimuleView() },
            AppModule("a_subs", "Abonnements", icon: "creditcard.fill", tint: .cyan, section: "admin_subscriptions") { AdminSubscriptionsView() },
        ].filter { granted($0.section) }
    }

    var body: some View {
        ScrollView {
            LazyVGrid(columns: cols, spacing: 14) {
                ForEach(destinations) { m in
                    NavigationLink { m.make() } label: { ModuleTile(module: m) }
                        .buttonStyle(.plain)
                }
            }
            .padding()
        }
        .navigationTitle("Administration")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.large)
        #endif
    }
}

// MARK: - Vue d'ensemble

struct AdminOverviewView: View {
    @StateObject private var state = Loadable<AdminOverview>()

    var body: some View {
        ScrollView {
            if let s = state.value {
                VStack(spacing: 14) {
                    overviewHeader(s)
                    HStack(spacing: 12) {
                        MetricCard(title: "Entreprises", value: "\(s.companies)", icon: "building.2.fill", color: .indigo)
                        MetricCard(title: "Utilisateurs", value: "\(s.users)", icon: "person.2.fill", color: .teal)
                    }
                    HStack(spacing: 12) {
                        MetricCard(title: "Employés", value: "\(s.employees)", icon: "person.crop.circle.fill", color: .green)
                        MetricCard(title: "Factures", value: "\(s.invoices)", icon: "doc.text.fill", color: .blue)
                    }
                    HStack(spacing: 12) {
                        MetricCard(title: "Tickets ouverts", value: "\(s.tickets_open)", icon: "lifepreserver", color: .orange)
                        MetricCard(title: "Tickets critiques", value: "\(s.tickets_critical)", icon: "exclamationmark.triangle.fill", color: .red)
                    }
                    MetricCard(title: "Alertes ouvertes", value: "\(s.alerts_open)", icon: "bell.badge.fill", color: .red)
                }
                .padding()
            } else if state.isLoading {
                VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in ShimmerBox(height: 70) } }.padding()
            } else if let err = state.error {
                ContentUnavailableView { Label("Erreur", systemImage: "exclamationmark.triangle.fill") } description: { Text(err) }
            }
        }
        .navigationTitle("Vue d'ensemble")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
        .refreshable { await load() }
    }

    private func overviewHeader(_ s: AdminOverview) -> some View {
        GlassCard(padding: 18, cornerRadius: 20, tint: Color.indigo.opacity(0.1)) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12).fill(Color.indigo.opacity(0.15)).frame(width: 46, height: 46)
                        Image(systemName: "shield.lefthalf.filled").font(.title3).foregroundStyle(.indigo)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Console plateforme").font(.headline)
                        Text("Pilotage global KOMPTA").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                Divider()
                HStack {
                    Image(systemName: "banknote.fill").foregroundStyle(.green)
                    Text("Ventes totales").font(.subheadline).foregroundStyle(.secondary)
                    Spacer()
                    Text(fcfa(s.sales_total)).font(.title3.bold()).foregroundStyle(.green)
                }
            }
        }
    }

    private func load() async { await state.load { try await APIClient.shared.adminOverview() } }
}

// MARK: - Entreprises

struct AdminCompaniesView: View {
    @StateObject private var state = Loadable<[AdminCompanyRow]>()
    @State private var search = ""

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune entreprise", emptyIcon: "building.2", reload: load) { companies in
            List {
                ForEach(filtered(companies)) { c in
                    NavigationLink { AdminCompanyDetailView(companyId: c.id, summary: c) } label: {
                        HStack(spacing: 12) {
                            AvatarView(initials: companyInitials(c.name), size: 40, color: .indigo)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(c.name).font(.subheadline.bold())
                                Text("\(c.industry ?? "—") · \(c.country ?? "—")").font(.caption).foregroundStyle(.secondary)
                                Label("\(c.users_count) utilisateur(s)", systemImage: "person.2")
                                    .font(.caption2).foregroundStyle(.tertiary)
                            }
                            Spacer()
                            if let score = c.teras_score {
                                VStack(spacing: 1) {
                                    Text("\(Int(score))").font(.subheadline.bold()).foregroundStyle(.purple)
                                    Text("TERAS").font(.system(size: 8, weight: .bold)).foregroundStyle(.secondary)
                                }
                            }
                        }
                        .padding(.vertical, 3)
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .searchable(text: $search, prompt: "Nom de l'entreprise")
        .navigationTitle("Entreprises")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
        .refreshable { await load() }
    }

    private func companyInitials(_ name: String) -> String {
        name.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined().uppercased()
    }
    private func filtered(_ c: [AdminCompanyRow]) -> [AdminCompanyRow] {
        search.isEmpty ? c : c.filter { $0.name.localizedCaseInsensitiveContains(search) }
    }
    private func load() async { await state.load { try await APIClient.shared.adminCompanies() } }
}

struct AdminCompanyDetailView: View {
    let companyId: Int
    let summary: AdminCompanyRow
    @StateObject private var state = Loadable<AdminCompanyDetail>()
    @State private var showStatusConfirm = false
    @State private var pendingStatus = "suspended"
    @State private var updatingStatus = false

    var body: some View {
        ScrollView {
            if let d = state.value {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(spacing: 12) {
                        HStack(spacing: 12) {
                            MetricCard(title: "Score complétion", value: d.company.completion_score != nil ? "\(Int(d.company.completion_score!))%" : "—", icon: "checkmark.seal.fill", color: .green)
                            MetricCard(title: "Score Teras", value: d.company.teras_score != nil ? "\(Int(d.company.teras_score!))" : "—", icon: KomptaBrand.limuleIcon, color: .purple)
                        }
                        HStack(spacing: 12) {
                            MetricCard(title: "Factures", value: "\(d.stats.invoices)", icon: "doc.text.fill", color: .blue)
                            MetricCard(title: "Ventes", value: fcfa(d.stats.sales_total), icon: "banknote.fill", color: .green)
                        }
                    }

                    if !d.alerts.isEmpty {
                        Text("Alertes").font(.headline)
                        ForEach(d.alerts) { a in
                            GlassCard {
                                HStack {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(a.title).font(.subheadline.bold())
                                        Text(a.module.capitalized).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    StatusPill(text: a.severity, colorName: severityColor(a.severity))
                                }
                            }
                        }
                    }

                    Text("Utilisateurs (\(d.users.count))").font(.headline)
                    ForEach(d.users) { u in
                        GlassCard {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(u.full_name).font(.subheadline.bold())
                                    Text("\(u.email) · \(u.role)").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                StatusPill(text: u.account_status, colorName: u.account_status == "active" ? "green" : "red")
                            }
                        }
                    }

                    GlassCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Statut de l'entreprise").font(.headline)
                            HStack(spacing: 10) {
                                KomptaButton(label: "Activer", icon: "checkmark.circle", style: .glass, isLoading: updatingStatus) {
                                    pendingStatus = "active"; showStatusConfirm = true
                                }
                                KomptaButton(label: "Suspendre", icon: "pause.circle", style: .destructive, isLoading: updatingStatus) {
                                    pendingStatus = "suspended"; showStatusConfirm = true
                                }
                            }
                        }
                    }
                }
                .padding()
            } else if state.isLoading {
                VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in ShimmerBox(height: 70) } }.padding()
            } else if let err = state.error {
                ContentUnavailableView { Label("Erreur", systemImage: "exclamationmark.triangle.fill") } description: { Text(err) }
            }
        }
        .navigationTitle(summary.name)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog("Confirmer le changement de statut ?", isPresented: $showStatusConfirm, titleVisibility: .visible) {
            Button(pendingStatus == "active" ? "Activer l'entreprise" : "Suspendre l'entreprise", role: pendingStatus == "active" ? nil : .destructive) {
                Task { await updateStatus() }
            }
            Button("Annuler", role: .cancel) { }
        }
    }

    private func severityColor(_ s: String) -> String {
        switch s {
        case "critical", "high": return "red"
        case "medium": return "orange"
        default: return "blue"
        }
    }

    private func load() async { await state.load { try await APIClient.shared.adminCompanyDetail(companyId) } }
    private func updateStatus() async {
        updatingStatus = true
        do { _ = try await APIClient.shared.adminUpdateCompanyStatus(companyId, pendingStatus) }
        catch { }
        updatingStatus = false
    }
}

// MARK: - Utilisateurs

struct AdminUsersView: View {
    @StateObject private var state = Loadable<[AdminUserRow]>()
    @State private var search = ""

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun utilisateur", emptyIcon: "person.2", reload: load) { users in
            List {
                ForEach(filtered(users)) { u in
                    NavigationLink { AdminUserDetailView(user: u) } label: {
                        HStack(spacing: 12) {
                            AvatarView(initials: userInitials(u.full_name), size: 38, color: .teal)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(u.full_name).font(.subheadline.bold())
                                Text(u.email).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                HStack(spacing: 5) {
                                    Text(u.role).font(.caption2.bold())
                                        .padding(.horizontal, 6).padding(.vertical, 1)
                                        .background(.indigo.opacity(0.15), in: Capsule()).foregroundStyle(.indigo)
                                    if let c = u.company_name { Text(c).font(.caption2).foregroundStyle(.tertiary).lineLimit(1) }
                                }
                            }
                            Spacer()
                            StatusPill(text: u.account_status, colorName: u.account_status == "active" ? "green" : "orange")
                        }
                        .padding(.vertical, 3)
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .searchable(text: $search, prompt: "Nom, e-mail")
        .navigationTitle("Utilisateurs")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
        .refreshable { await load() }
    }

    private func userInitials(_ name: String) -> String {
        name.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined().uppercased()
    }
    private func filtered(_ u: [AdminUserRow]) -> [AdminUserRow] {
        search.isEmpty ? u : u.filter {
            $0.full_name.localizedCaseInsensitiveContains(search) || $0.email.localizedCaseInsensitiveContains(search)
        }
    }
    private func load() async { await state.load { try await APIClient.shared.adminUsers() } }
}

struct AdminUserDetailView: View {
    let user: AdminUserRow
    @State private var status: String
    @State private var saving = false
    @State private var showResetConfirm = false
    @State private var resetting = false
    @State private var resetResult: ResetPasswordResult?
    @State private var showImpersonateConfirm = false
    @State private var impersonating = false
    @State private var impersonateResult: ImpersonateResult?

    init(user: AdminUserRow) {
        self.user = user
        _status = State(initialValue: user.account_status)
    }

    @State private var contactTitle = ""
    @State private var contactMessage = ""
    @State private var contactSending = false
    @State private var contactSent = false

    private var heroInitials: String {
        user.full_name.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined().uppercased()
    }

    var body: some View {
        Form {
            Section {
                HStack(spacing: 14) {
                    AvatarView(initials: heroInitials, size: 52, color: .teal)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(user.full_name).font(.headline)
                        Text(user.role).font(.caption.bold())
                            .padding(.horizontal, 8).padding(.vertical, 2)
                            .background(.indigo.opacity(0.15), in: Capsule()).foregroundStyle(.indigo)
                    }
                    Spacer()
                    StatusPill(text: status, colorName: status == "active" ? "green" : "orange")
                }
                .padding(.vertical, 4)
            }
            Section("Informations") {
                LabeledContent("Nom", value: user.full_name)
                LabeledContent("E-mail", value: user.email)
                LabeledContent("Rôle", value: user.role)
                if let cr = user.custom_role {
                    LabeledContent("Rôle d'accès", value: cr.name)
                }
                if let p = user.phone, !p.isEmpty { LabeledContent("Téléphone", value: p) }
                if let a = user.address, !a.isEmpty { LabeledContent("Adresse", value: a) }
                LabeledContent("Entreprise", value: user.company_name ?? "—")
            }
            Section("Connexion & localisation") {
                LabeledContent("Dernière connexion", value: shortDate(user.last_login_at))
                LabeledContent("Ville estimée", value: (user.last_login_city?.isEmpty == false ? user.last_login_city! : "—"))
                LabeledContent("Adresse IP", value: (user.last_login_ip?.isEmpty == false ? user.last_login_ip! : "—"))
            }
            Section("Statut du compte") {
                Picker("Statut", selection: $status) {
                    Text("Actif").tag("active")
                    Text("Suspendu").tag("suspended")
                    Text("Désactivé").tag("disabled")
                    Text("Archivé").tag("archived")
                }
                KomptaButton(label: "Enregistrer le statut", icon: "checkmark", isLoading: saving) { await saveStatus() }
            }
            Section {
                TextField("Objet", text: $contactTitle)
                TextField("Message à l'utilisateur…", text: $contactMessage, axis: .vertical).lineLimit(2...5)
                Button {
                    Task { await contact() }
                } label: {
                    HStack { if contactSending { ProgressView().controlSize(.small) }
                        Label(contactSent ? "Message envoyé ✓" : "Envoyer le message", systemImage: "paperplane.fill") }
                }
                .disabled(contactTitle.isEmpty || contactMessage.isEmpty || contactSending || user.company_id == nil)
            } header: {
                Label("Contacter l'utilisateur", systemImage: "envelope.fill")
            } footer: {
                Text("Le message est notifié à l'entreprise de l'utilisateur (\(user.company_name ?? "—")).")
            }
            Section("Actions sensibles") {
                Button { showResetConfirm = true } label: {
                    Label("Réinitialiser le mot de passe", systemImage: "key.fill")
                }
                Button { showImpersonateConfirm = true } label: {
                    Label("Obtenir un jeton de connexion", systemImage: "person.fill.questionmark")
                }
            }
            if let r = resetResult {
                Section("Mot de passe temporaire") {
                    Text(r.temp_password).font(.system(.body, design: .monospaced)).textSelection(.enabled)
                    Text(r.message).font(.caption).foregroundStyle(.secondary)
                }
            }
            if let r = impersonateResult {
                Section("Jeton de session") {
                    Text(r.token).font(.caption2.monospaced()).textSelection(.enabled).lineLimit(3)
                    Text("Pour \(r.user_email)").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle(user.full_name)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .confirmationDialog("Générer un mot de passe temporaire pour cet utilisateur ?", isPresented: $showResetConfirm, titleVisibility: .visible) {
            Button("Réinitialiser", role: .destructive) { Task { await resetPassword() } }
            Button("Annuler", role: .cancel) { }
        }
        .confirmationDialog("Obtenir un jeton de session pour agir au nom de \(user.full_name) ?", isPresented: $showImpersonateConfirm, titleVisibility: .visible) {
            Button("Continuer", role: .destructive) { Task { await impersonate() } }
            Button("Annuler", role: .cancel) { }
        }
    }

    private func saveStatus() async {
        saving = true
        do { _ = try await APIClient.shared.adminUpdateUserStatus(user.id, status) }
        catch { }
        saving = false
    }
    private func resetPassword() async {
        resetting = true
        do { resetResult = try await APIClient.shared.adminResetPassword(user.id) }
        catch { }
        resetting = false
    }
    private func impersonate() async {
        impersonating = true
        do { impersonateResult = try await APIClient.shared.adminImpersonate(user.id) }
        catch { }
        impersonating = false
    }
    private func contact() async {
        guard let cid = user.company_id else { return }
        contactSending = true; contactSent = false
        let payload = BroadcastPayload(title: contactTitle, message: contactMessage, type: "info", target: "company_id:\(cid)")
        if (try? await APIClient.shared.adminBroadcast(payload)) != nil {
            contactSent = true; contactTitle = ""; contactMessage = ""
            Task { try? await Task.sleep(nanoseconds: 2_500_000_000); contactSent = false }
        }
        contactSending = false
    }
}

// MARK: - Tickets support

struct AdminTicketsView: View {
    @StateObject private var state = Loadable<[AdminTicket]>()

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun ticket", emptyIcon: "lifepreserver", reload: load) { tickets in
            List {
                ForEach(tickets) { t in
                    NavigationLink { AdminTicketDetailView(ticketId: t.id) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(t.subject).font(.subheadline.bold())
                                Text("\(t.company_name) · \(t.requester_name)").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 4) {
                                StatusPill(text: t.status, colorName: statusColor(t.status))
                                StatusPill(text: t.priority, colorName: priorityColor(t.priority))
                            }
                        }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Tickets support")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
        .refreshable { await load() }
    }

    private func statusColor(_ s: String) -> String {
        switch s { case "resolved", "closed": return "green"; case "in_progress": return "blue"; default: return "orange" }
    }
    private func priorityColor(_ p: String) -> String {
        switch p { case "critical", "high": return "red"; case "medium": return "orange"; default: return "blue" }
    }
    private func load() async { await state.load { try await APIClient.shared.adminTickets() } }
}

struct AdminTicketDetailView: View {
    let ticketId: Int
    @StateObject private var state = Loadable<AdminTicket>()
    @State private var reply = ""
    @State private var sending = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                if let t = state.value {
                    VStack(alignment: .leading, spacing: 14) {
                        GlassCard {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(t.subject).font(.headline)
                                Text(t.body).font(.callout)
                                HStack {
                                    StatusPill(text: t.status, colorName: "blue")
                                    StatusPill(text: t.priority, colorName: "orange")
                                    StatusPill(text: t.category, colorName: "gray")
                                }
                            }
                        }
                        Picker("Statut", selection: statusBinding(t)) {
                            Text("Ouvert").tag("open"); Text("En cours").tag("in_progress")
                            Text("Résolu").tag("resolved"); Text("Fermé").tag("closed")
                        }
                        .pickerStyle(.segmented)

                        ForEach(t.messages) { m in
                            HStack {
                                if m.is_staff { Spacer(minLength: 40) }
                                VStack(alignment: m.is_staff ? .trailing : .leading, spacing: 3) {
                                    Text(m.author_name.isEmpty ? (m.is_staff ? "Support KOMPTA" : "Client") : m.author_name)
                                        .font(.caption2.bold()).foregroundStyle(m.is_staff ? .blue : .secondary)
                                    Text(m.body).font(.subheadline)
                                        .padding(.horizontal, 12).padding(.vertical, 8)
                                        .background(m.is_staff ? Color.blue.opacity(0.15) : Color.secondary.opacity(0.1),
                                                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                }
                                if !m.is_staff { Spacer(minLength: 40) }
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
            Divider()
            HStack {
                TextField("Répondre…", text: $reply)
                    .textFieldStyle(.roundedBorder)
                Button { Task { await sendReply() } } label: { Image(systemName: "arrow.up.circle.fill").font(.title2) }
                    .disabled(reply.trimmingCharacters(in: .whitespaces).isEmpty || sending)
            }
            .padding()
        }
        .navigationTitle("Ticket #\(ticketId)")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
    }

    private func statusBinding(_ t: AdminTicket) -> Binding<String> {
        Binding(get: { t.status }, set: { newValue in Task { await updateStatus(newValue) } })
    }

    private func load() async { await state.load { try await APIClient.shared.adminTicket(ticketId) } }
    private func updateStatus(_ status: String) async {
        await state.load { try await APIClient.shared.adminUpdateTicket(ticketId, AdminTicketUpdatePayload(status: status)) }
    }
    private func sendReply() async {
        sending = true
        let body = reply
        await state.load { try await APIClient.shared.adminReplyTicket(ticketId, AdminTicketReplyPayload(body: body)) }
        reply = ""
        sending = false
    }
}

// MARK: - Journal d'audit

struct AdminAuditLogsView: View {
    @StateObject private var state = Loadable<[AdminAuditLogEntry]>()
    @State private var search = ""
    @State private var exportURL: URL?

    private func filtered(_ logs: [AdminAuditLogEntry]) -> [AdminAuditLogEntry] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return logs }
        return logs.filter {
            $0.action.lowercased().contains(q) || ($0.actor_name ?? "").lowercased().contains(q)
            || ($0.details ?? "").lowercased().contains(q) || ($0.target_name ?? "").lowercased().contains(q)
        }
    }

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune entrée", emptyIcon: "doc.text.magnifyingglass", reload: load) { logs in
            List {
                if let exportURL {
                    ShareLink(item: exportURL) {
                        Label("Télécharger le journal (CSV)", systemImage: "square.and.arrow.down")
                    }
                }
                ForEach(filtered(logs)) { l in
                    HStack(spacing: 10) {
                        Image(systemName: actionIcon(l.action)).foregroundStyle(actionColor(l.action)).frame(width: 22)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text(l.action).font(.subheadline.bold())
                                Spacer()
                                Text(shortDate(l.created_at)).font(.caption2).foregroundStyle(.secondary)
                            }
                            if let actor = l.actor_name { Text("Par \(actor)").font(.caption).foregroundStyle(.secondary) }
                            if let details = l.details, !details.isEmpty { Text(details).font(.caption2).foregroundStyle(.tertiary).lineLimit(2) }
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .searchable(text: $search, prompt: "Action, utilisateur, détail")
        .navigationTitle("Journal d'audit")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { exportCSV() } label: { Image(systemName: "square.and.arrow.down") }
                    .disabled(state.value?.isEmpty ?? true)
                    .help("Exporter le journal d'audit")
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func actionIcon(_ a: String) -> String {
        switch a { case "create": return "plus.circle.fill"; case "delete": return "minus.circle.fill"
        case "update": return "pencil.circle.fill"; case "login", "logout": return "person.circle.fill"
        default: return "circle.fill" }
    }
    private func actionColor(_ a: String) -> Color {
        switch a { case "create": return .green; case "delete": return .red; case "update": return .blue; default: return .secondary }
    }
    private func exportCSV() {
        guard let logs = state.value else { return }
        var csv = "Date,Action,Utilisateur,Ressource,Détails\n"
        for l in logs {
            func esc(_ s: String) -> String { "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\"" }
            csv += [shortDate(l.created_at), l.action, l.actor_name ?? "", l.target_name ?? "", l.details ?? ""]
                .map(esc).joined(separator: ",") + "\n"
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("audit-\(Int(Date().timeIntervalSince1970)).csv")
        try? csv.write(to: url, atomically: true, encoding: .utf8)
        exportURL = url
    }
    private func load() async { await state.load { try await APIClient.shared.adminAuditLogs() } }
}

// MARK: - Analytique

struct AdminAnalyticsView: View {
    @StateObject private var analytics = Loadable<PlatformAnalytics>()
    @StateObject private var feed = Loadable<[AdminActivityEvent]>()
    @State private var analysis: String?
    @State private var analysisLoading = false
    @State private var exportURL: URL?

    var body: some View {
        ScrollView {
            if let a = analytics.value {
                VStack(spacing: 14) {
                    AIAnalysisPanel(
                        title: "Analyse Limule de la plateforme",
                        runLabel: "Analyser",
                        loadingLabel: "Limule analyse la plateforme…",
                        emptyLabel: "Lancez l'analyse pour un diagnostic global (croissance, risques, priorités).",
                        analysis: analysis, isLoading: analysisLoading,
                        onRun: { Task { await runAnalysis(a) } }
                    )
                    if let exportURL {
                        ShareLink(item: exportURL) {
                            Label("Télécharger le rapport (.md / texte)", systemImage: "square.and.arrow.down")
                                .frame(maxWidth: .infinity).padding(.vertical, 11)
                                .background(Color.indigo.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                                .foregroundStyle(.indigo)
                        }
                        .buttonStyle(.plain)
                    }
                    HStack(spacing: 12) {
                        MetricCard(title: "Entreprises", value: "\(a.companies_total)", icon: "building.2.fill", color: .indigo,
                                   subtitle: "+\(a.new_companies_this_month) ce mois")
                        MetricCard(title: "Actives 30j", value: "\(a.companies_active_30d)", icon: "bolt.fill", color: .green)
                    }
                    HStack(spacing: 12) {
                        MetricCard(title: "Utilisateurs", value: "\(a.users_total)", icon: "person.2.fill", color: .teal,
                                   subtitle: "+\(a.new_users_this_month) ce mois")
                        MetricCard(title: "Score Teras moyen", value: a.avg_teras_score != nil ? "\(Int(a.avg_teras_score!))" : "—", icon: KomptaBrand.limuleIcon, color: .purple)
                    }
                    MetricCard(title: "Revenu plateforme", value: fcfa(a.total_revenue_platform), icon: "banknote.fill", color: .green)
                    MetricCard(title: "Ventes plateforme", value: fcfa(a.total_sales_platform), icon: "cart.fill", color: .blue)

                    if !a.monthly_growth.isEmpty {
                        SectionCard(title: "Croissance mensuelle", subtitle: "Entreprises & utilisateurs") {
                            Chart {
                                ForEach(a.monthly_growth) { m in
                                    BarMark(x: .value("Mois", m.month), y: .value("n", m.companies), width: .fixed(14))
                                        .foregroundStyle(by: .value("Type", "Entreprises"))
                                        .position(by: .value("Type", "Entreprises"), span: .ratio(0.7))
                                    BarMark(x: .value("Mois", m.month), y: .value("n", m.users), width: .fixed(14))
                                        .foregroundStyle(by: .value("Type", "Utilisateurs"))
                                        .position(by: .value("Type", "Utilisateurs"), span: .ratio(0.7))
                                }
                            }
                            .chartForegroundStyleScale(["Entreprises": Color.indigo, "Utilisateurs": Color.teal])
                            .chartLegend(position: .top)
                            .frame(height: 180)
                        }
                    }

                    if !a.companies_by_industry.isEmpty {
                        SectionCard(title: "Répartition par secteur", subtitle: "\(a.companies_total) entreprise(s)") {
                            AdminBreakdownChart(rows: a.companies_by_industry.map { ($0.industry.capitalized, $0.count) })
                        }
                    }
                    if !a.companies_by_country.isEmpty {
                        SectionCard(title: "Répartition par pays", subtitle: nil) {
                            AdminBreakdownChart(rows: a.companies_by_country.map { ($0.country.capitalized, $0.count) })
                        }
                    }

                    if let f = feed.value, !f.isEmpty {
                        Text("Activité récente").font(.headline).frame(maxWidth: .infinity, alignment: .leading)
                        ForEach(f) { e in
                            GlassCard {
                                HStack {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(activityLabel(e)).font(.subheadline.bold())
                                        Text(shortDate(e.created_at)).font(.caption2).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if let amount = e.amount { Text(fcfa(amount)).font(.caption.bold()) }
                                }
                            }
                        }
                    }
                }
                .padding()
            } else if analytics.isLoading {
                VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in ShimmerBox(height: 70) } }.padding()
            } else if let err = analytics.error {
                ContentUnavailableView { Label("Erreur", systemImage: "exclamationmark.triangle.fill") } description: { Text(err) }
            }
        }
        .navigationTitle("Analytique plateforme")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { if let a = analytics.value { exportReport(a) } } label: {
                    Image(systemName: "square.and.arrow.down")
                }
                .disabled(analytics.value == nil)
                .help("Exporter le rapport analytique")
            }
        }
        .task { await loadAll() }
        .refreshable { await loadAll() }
    }

    private func buildReport(_ a: PlatformAnalytics) -> String {
        var s = "# Rapport analytique — Plateforme KOMPTA\n\n"
        s += "_Généré le \(Date().formatted(date: .long, time: .shortened))_\n\n"
        s += "## Indicateurs clés\n"
        s += "- Entreprises : \(a.companies_total) (+\(a.new_companies_this_month) ce mois)\n"
        s += "- Entreprises actives (30j) : \(a.companies_active_30d)\n"
        s += "- Utilisateurs : \(a.users_total) (+\(a.new_users_this_month) ce mois)\n"
        if let t = a.avg_teras_score { s += "- Score TERAS moyen : \(Int(t))/100\n" }
        s += "- Revenu plateforme : \(fcfa(a.total_revenue_platform))\n"
        s += "- Ventes plateforme : \(fcfa(a.total_sales_platform))\n\n"
        if !a.companies_by_industry.isEmpty {
            s += "## Répartition par secteur\n"
            for r in a.companies_by_industry { s += "- \(r.industry.capitalized) : \(r.count)\n" }
            s += "\n"
        }
        if !a.companies_by_country.isEmpty {
            s += "## Répartition par pays\n"
            for r in a.companies_by_country { s += "- \(r.country.capitalized) : \(r.count)\n" }
            s += "\n"
        }
        if !a.monthly_growth.isEmpty {
            s += "## Croissance mensuelle\n"
            for m in a.monthly_growth { s += "- \(m.month) : \(m.companies) entreprise(s), \(m.users) utilisateur(s), \(fcfa(m.revenue))\n" }
            s += "\n"
        }
        if let analysis { s += "## Analyse Limule\n\(analysis)\n" }
        return s
    }

    private func exportReport(_ a: PlatformAnalytics) {
        let text = buildReport(a)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("rapport-analytique-\(Int(Date().timeIntervalSince1970)).md")
        try? text.write(to: url, atomically: true, encoding: .utf8)
        exportURL = url
    }

    private func runAnalysis(_ a: PlatformAnalytics) async {
        analysisLoading = true; analysis = nil
        let prompt = """
        Analyse la santé de la plateforme KOMPTA à partir de ces indicateurs et donne 3-4 priorités concrètes : \
        \(a.companies_total) entreprises (+\(a.new_companies_this_month)/mois), \(a.companies_active_30d) actives sur 30j, \
        \(a.users_total) utilisateurs (+\(a.new_users_this_month)/mois), revenu \(fcfa(a.total_revenue_platform)), \
        ventes \(fcfa(a.total_sales_platform)), TERAS moyen \(a.avg_teras_score.map { String(Int($0)) } ?? "n/d").
        """
        if let r = try? await APIClient.shared.adminLimuleChat(prompt) {
            analysis = r.answer
        } else {
            analysis = "Analyse indisponible pour le moment."
        }
        analysisLoading = false
    }

    private func activityLabel(_ e: AdminActivityEvent) -> String {
        switch e.type {
        case "invoice_created": return "Facture créée — \(e.company_name ?? "")"
        case "sale_created": return "Vente — \(e.company_name ?? "")"
        case "user_created": return "Nouvel utilisateur — \(e.user_name ?? "")"
        case "company_created": return "Nouvelle entreprise — \(e.company_name ?? "")"
        default: return e.type
        }
    }
    private func loadAll() async {
        await analytics.load { try await APIClient.shared.adminPlatformAnalytics() }
        await feed.load { try await APIClient.shared.adminActivityFeed() }
    }
}

// MARK: - Diffusion

struct AdminBroadcastView: View {
    @State private var title = ""
    @State private var message = ""
    @State private var type = "info"
    @State private var target = "all"
    @State private var sending = false
    @State private var result: BroadcastResult?
    @State private var showConfirm = false

    var body: some View {
        Form {
            Section("Message") {
                TextField("Titre", text: $title)
                TextField("Message", text: $message, axis: .vertical).lineLimit(3...8)
            }
            Section("Diffusion") {
                Picker("Type", selection: $type) {
                    Text("Info").tag("info"); Text("Avertissement").tag("warning")
                    Text("Succès").tag("success"); Text("Critique").tag("critical")
                }
                Picker("Cible", selection: $target) {
                    Text("Toutes les entreprises").tag("all")
                    Text("Admins seulement").tag("admins")
                }
            }
            Section {
                KomptaButton(label: "Envoyer la diffusion", icon: "megaphone.fill", isLoading: sending) { showConfirm = true }
                    .disabled(title.isEmpty || message.isEmpty)
            }
            if let r = result {
                Section("Résultat") {
                    Text(r.message)
                    Text("Envoyé à \(r.sent_to) destinataire(s)").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Diffusion")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .confirmationDialog("Envoyer cette diffusion à toute la plateforme ?", isPresented: $showConfirm, titleVisibility: .visible) {
            Button("Envoyer", role: .destructive) { Task { await send() } }
            Button("Annuler", role: .cancel) { }
        }
    }

    private func send() async {
        sending = true
        do { result = try await APIClient.shared.adminBroadcast(BroadcastPayload(title: title, message: message, type: type, target: target)) }
        catch { }
        sending = false
    }
}

// MARK: - Système (santé / préflight / drapeaux / e-mail)

struct AdminSystemView: View {
    @State private var tab = 0
    @StateObject private var health = Loadable<SystemHealthResponse>()
    @StateObject private var preflight = Loadable<PreflightReport>()
    @StateObject private var flags = Loadable<[FeatureFlag]>()
    @StateObject private var emailStatus = Loadable<EmailStatus>()
    @State private var showNewFlag = false
    @State private var testEmailTo = ""
    @State private var sendingTestEmail = false
    @State private var testEmailResult: TestEmailResult?

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                Text("Santé").tag(0); Text("Préflight").tag(1); Text("Drapeaux").tag(2)
            }
            .pickerStyle(.segmented)
            .padding()

            ScrollView {
                if tab == 0 { healthTab }
                else if tab == 1 { preflightTab }
                else { flagsTab }
            }
        }
        .navigationTitle("Système")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            if tab == 2 {
                ToolbarItem(placement: .primaryAction) { Button { showNewFlag = true } label: { Image(systemName: "plus") } }
            }
        }
        .task { await loadAll() }
        .refreshable { await loadAll() }
        .sheet(isPresented: $showNewFlag) {
            AdminFeatureFlagFormView { await flags.load { try await APIClient.shared.adminFeatureFlags() } }
        }
    }

    @ViewBuilder private var healthTab: some View {
        if let h = health.value {
            VStack(spacing: 12) {
                MetricCard(title: "Statut global", value: h.status.capitalized, icon: "heart.text.square.fill",
                           color: h.status == "healthy" ? .green : (h.status == "down" ? .red : .orange))
                ForEach(h.services) { s in
                    GlassCard {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(s.name.capitalized).font(.subheadline.bold())
                                if let note = s.note { Text(note).font(.caption2).foregroundStyle(.secondary) }
                                if let err = s.error { Text(err).font(.caption2).foregroundStyle(.red) }
                            }
                            Spacer()
                            StatusPill(text: s.status, colorName: serviceColor(s.status))
                        }
                    }
                }
                Text("v\(h.version) · \(h.environment)").font(.caption2).foregroundStyle(.secondary)

                if let e = emailStatus.value {
                    GlassCard {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text("E-mail (\(e.provider))").font(.subheadline.bold())
                                Spacer()
                                StatusPill(text: e.enabled ? "activé" : "désactivé", colorName: e.enabled ? "green" : "gray")
                            }
                            if let host = e.host { Text("\(host):\(e.port ?? 0)").font(.caption).foregroundStyle(.secondary) }
                            HStack {
                                TextField("Adresse de test", text: $testEmailTo)
                                    #if os(iOS)
                                    .textFieldStyle(.roundedBorder)
                                    .keyboardType(.emailAddress)
                                    #endif
                                Button("Tester") { Task { await sendTestEmail() } }
                                    .disabled(testEmailTo.isEmpty || sendingTestEmail)
                            }
                            if let r = testEmailResult { Text(r.message).font(.caption2).foregroundStyle(.secondary) }
                        }
                    }
                }
            }
            .padding()
        } else if health.isLoading {
            VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in ShimmerBox(height: 50) } }.padding()
        } else if let err = health.error {
            ContentUnavailableView { Label("Erreur", systemImage: "exclamationmark.triangle.fill") } description: { Text(err) }
        }
    }

    @ViewBuilder private var preflightTab: some View {
        if let p = preflight.value {
            VStack(alignment: .leading, spacing: 14) {
                MetricCard(title: "Score de préparation", value: "\(p.score)%", icon: "checkmark.shield.fill",
                           color: p.status == "pass" ? .green : (p.status == "fail" ? .red : .orange))
                ForEach(p.sections) { sec in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(sec.title).font(.headline)
                            Spacer()
                            StatusPill(text: sec.status, colorName: checkColor(sec.status))
                        }
                        ForEach(sec.items) { item in
                            GlassCard {
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text(item.title).font(.subheadline.bold())
                                        Spacer()
                                        StatusPill(text: item.status, colorName: checkColor(item.status))
                                    }
                                    Text(item.detail).font(.caption).foregroundStyle(.secondary)
                                    if !item.action.isEmpty { Text(item.action).font(.caption2).foregroundStyle(.blue) }
                                }
                            }
                        }
                    }
                }
            }
            .padding()
        } else if preflight.isLoading {
            VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in ShimmerBox(height: 70) } }.padding()
        } else if let err = preflight.error {
            ContentUnavailableView { Label("Erreur", systemImage: "exclamationmark.triangle.fill") } description: { Text(err) }
        }
    }

    @ViewBuilder private var flagsTab: some View {
        if let f = flags.value {
            VStack(spacing: 10) {
                if f.isEmpty {
                    ContentUnavailableView("Aucun drapeau", systemImage: "flag")
                } else {
                    ForEach(f) { flag in
                        GlassCard {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(flag.key).font(.subheadline.bold())
                                    Text(flag.description).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Toggle("", isOn: Binding(
                                    get: { flag.enabled },
                                    set: { newValue in Task { await toggleFlag(flag.key, newValue) } }
                                )).labelsHidden()
                                Button { Task { await deleteFlag(flag.key) } } label: {
                                    Image(systemName: "trash").foregroundStyle(.red)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .padding()
        } else if flags.isLoading {
            VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in ShimmerBox(height: 50) } }.padding()
        } else if let err = flags.error {
            ContentUnavailableView { Label("Erreur", systemImage: "exclamationmark.triangle.fill") } description: { Text(err) }
        }
    }

    private func serviceColor(_ s: String) -> String {
        switch s { case "healthy": return "green"; case "down", "degraded": return "red"; case "test_mode": return "orange"; default: return "gray" }
    }
    private func checkColor(_ s: String) -> String {
        switch s { case "pass": return "green"; case "fail": return "red"; case "warn": return "orange"; default: return "gray" }
    }

    private func loadAll() async {
        await health.load { try await APIClient.shared.adminSystemHealth() }
        await preflight.load { try await APIClient.shared.adminSystemPreflight() }
        await flags.load { try await APIClient.shared.adminFeatureFlags() }
        await emailStatus.load { try await APIClient.shared.adminEmailStatus() }
    }
    private func toggleFlag(_ key: String, _ enabled: Bool) async {
        await flags.load {
            _ = try await APIClient.shared.adminUpdateFeatureFlag(key, FeatureFlagUpdatePayload(enabled: enabled))
            return try await APIClient.shared.adminFeatureFlags()
        }
    }
    private func deleteFlag(_ key: String) async {
        await flags.load {
            _ = try await APIClient.shared.adminDeleteFeatureFlag(key)
            return try await APIClient.shared.adminFeatureFlags()
        }
    }
    private func sendTestEmail() async {
        sendingTestEmail = true
        do { testEmailResult = try await APIClient.shared.adminTestEmail(testEmailTo) }
        catch { }
        sendingTestEmail = false
    }
}

struct AdminFeatureFlagFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var key = ""
    @State private var value = ""
    @State private var description = ""
    @State private var enabled = true
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Drapeau") {
                    TextField("Clé *", text: $key)
                    TextField("Valeur", text: $value)
                    TextField("Description", text: $description, axis: .vertical).lineLimit(2...4)
                    Toggle("Activé", isOn: $enabled)
                }
            }
            .navigationTitle("Nouveau drapeau")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Créer") { Task { await save() } }.disabled(key.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        do {
            _ = try await APIClient.shared.adminCreateFeatureFlag(FeatureFlagCreatePayload(key: key, value: value, description: description, enabled: enabled))
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}

// MARK: - Intégration (onboarding)

struct AdminOnboardingView: View {
    @StateObject private var state = Loadable<[OnboardingStatRow]>()

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune entreprise", emptyIcon: "checklist", reload: load) { rows in
            List {
                ForEach(rows) { r in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(r.company_name).font(.subheadline.bold())
                            Spacer()
                            Text(r.completion_score != nil ? "\(Int(r.completion_score!))%" : "—")
                                .font(.caption.bold()).foregroundStyle(scoreColor(r.completion_score))
                        }
                        if let score = r.completion_score {
                            ProgressView(value: score, total: 100).tint(scoreColor(score))
                        }
                        HStack(spacing: 10) {
                            onboardingBadge("Employés", r.has_employees)
                            onboardingBadge("Factures", r.has_invoices)
                            onboardingBadge("Ventes", r.has_sales)
                            onboardingBadge("Documents", r.has_documents)
                        }
                        Text("Dernière activité : \(shortDate(r.last_activity))").font(.caption2).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Intégration")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
        .refreshable { await load() }
    }

    private func scoreColor(_ score: Double?) -> Color {
        guard let score else { return .gray }
        if score >= 75 { return .green }
        if score >= 40 { return .orange }
        return .red
    }
    @ViewBuilder private func onboardingBadge(_ label: String, _ done: Bool) -> some View {
        Label(label, systemImage: done ? "checkmark.circle.fill" : "circle")
            .font(.caption2)
            .foregroundStyle(done ? .green : .secondary)
    }
    private func load() async { await state.load { try await APIClient.shared.adminOnboardingStats() } }
}

// MARK: - Limule IA (aperçu / Grand Sage / jeu de données)

struct AdminLimuleView: View {
    @State private var tab = 0
    @StateObject private var insights = Loadable<AdminLimuleInsights>()
    @StateObject private var dataset = Loadable<[AdminLimuleDatasetRecord]>()
    @State private var prompt = ""
    @State private var asking = false
    @State private var chatResponse: AdminLimuleChatResponse?
    @State private var exportURL: URL?
    @State private var exporting = false

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                Text("Aperçu").tag(0); Text("Grand Sage").tag(1); Text("Jeu de données").tag(2)
            }
            .pickerStyle(.segmented)
            .padding()

            ScrollView {
                if tab == 0 { insightsTab }
                else if tab == 1 { grandSageTab }
                else { datasetTab }
            }
        }
        .navigationTitle("Limule Admin")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task {
            await insights.load { try await APIClient.shared.adminLimuleInsights() }
            await dataset.load { try await APIClient.shared.adminLimuleDataset() }
        }
    }

    @ViewBuilder private var insightsTab: some View {
        if let i = insights.value {
            VStack(spacing: 14) {
                HStack(spacing: 12) {
                    MetricCard(title: "Interactions", value: "\(i.total_interactions)", icon: "bubble.left.and.bubble.right.fill", color: .purple)
                    MetricCard(title: "7 derniers jours", value: "\(i.last_7_days)", icon: "calendar", color: .blue)
                }
                HStack(spacing: 12) {
                    MetricCard(title: "Notées", value: "\(i.rated)", icon: "star.fill", color: .yellow,
                               subtitle: i.avg_rating != nil ? "\(i.avg_rating!)/5" : nil)
                    MetricCard(title: "Prêtes (entraînement)", value: "\(i.training_ready)", icon: "checkmark.seal.fill", color: .green)
                }
                if !i.by_module.isEmpty {
                    SectionCard(title: "Interactions par module", subtitle: "\(i.total_interactions) au total") {
                        Chart(i.by_module) { m in
                            BarMark(x: .value("n", m.count), y: .value("Module", m.module.capitalized))
                                .foregroundStyle(KomptaBrand.limuleBlue.gradient)
                                .cornerRadius(4)
                                .annotation(position: .trailing) { Text("\(m.count)").font(.caption2.bold()).foregroundStyle(.secondary) }
                        }
                        .frame(height: CGFloat(max(120, i.by_module.count * 34)))
                    }
                }
                if !i.recent.isEmpty {
                    Text("Récentes").font(.headline).frame(maxWidth: .infinity, alignment: .leading)
                    ForEach(i.recent) { r in
                        GlassCard {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(r.prompt).font(.caption).lineLimit(3)
                                HStack {
                                    Text("\(r.company ?? "—") · \(r.module ?? "—")").font(.caption2).foregroundStyle(.secondary)
                                    Spacer()
                                    Text(shortDate(r.created_at)).font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            .padding()
        } else if insights.isLoading {
            VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in ShimmerBox(height: 70) } }.padding()
        } else if let err = insights.error {
            ContentUnavailableView { Label("Erreur", systemImage: "exclamationmark.triangle.fill") } description: { Text(err) }
        }
    }

    @ViewBuilder private var grandSageTab: some View {
        VStack(alignment: .leading, spacing: 18) {
            GlassCard {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Interroger le Grand Sage").font(.headline)
                    Text("Vue d'ensemble cross-entreprises avec signaux et KPIs.").font(.caption).foregroundStyle(.secondary)
                    TextField("Votre question…", text: $prompt, axis: .vertical).lineLimit(2...5)
                        #if os(iOS)
                        .textFieldStyle(.roundedBorder)
                        #endif
                    KomptaButton(label: "Demander à Limule", icon: KomptaBrand.limuleIcon, isLoading: asking) { await ask() }
                        .disabled(prompt.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            if let r = chatResponse {
                GlassCard {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 6) { LimuleMark(size: 18, showAura: false); Text("Réponse du Grand Sage").font(.subheadline.bold()) }
                        Divider()
                        AIMarkdownText(text: r.answer, accent: KomptaBrand.limuleBlue).textSelection(.enabled)
                    }
                }
                if !r.signals.isEmpty {
                    ForEach(r.signals) { s in
                        GlassCard {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(s.label).font(.subheadline.bold())
                                    if let module = s.module { Text(module).font(.caption2).foregroundStyle(.secondary) }
                                }
                                Spacer()
                                StatusPill(text: s.severity, colorName: s.severity == "critical" || s.severity == "high" ? "red" : "orange")
                            }
                        }
                    }
                }
                HStack(spacing: 12) {
                    MetricCard(title: "Entreprises", value: "\(r.kpis.companies)", icon: "building.2.fill", color: .indigo)
                    MetricCard(title: "Alertes ouvertes", value: "\(r.kpis.alerts_open)", icon: "bell.badge.fill", color: .red)
                }
                HStack(spacing: 12) {
                    MetricCard(title: "Tickets ouverts", value: "\(r.kpis.tickets_open)", icon: "lifepreserver", color: .orange)
                    MetricCard(title: "Utilisateurs", value: "\(r.kpis.users)", icon: "person.2.fill", color: .teal)
                }
            }
        }
        .padding()
    }

    private func exportDataset() async {
        exporting = true
        defer { exporting = false }
        guard let data = try? await APIClient.shared.adminLimuleDatasetExport() else { return }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("limule-dataset-\(Int(Date().timeIntervalSince1970)).jsonl")
        try? data.write(to: url)
        exportURL = url
    }

    @ViewBuilder private var datasetTab: some View {
        if let d = dataset.value {
            VStack(spacing: 10) {
                HStack {
                    if let exportURL {
                        ShareLink(item: exportURL) { Label("Exporter (JSONL)", systemImage: "square.and.arrow.down") }
                    } else {
                        Button { Task { await exportDataset() } } label: {
                            if exporting { ProgressView() } else { Label("Exporter le jeu de données (JSONL)", systemImage: "square.and.arrow.down") }
                        }.disabled(exporting)
                    }
                    Spacer()
                }
                .padding(.horizontal)
                if d.isEmpty {
                    ContentUnavailableView("Aucune donnée", systemImage: "tray")
                } else {
                    ForEach(d) { r in
                        GlassCard {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(r.company?.name ?? "—").font(.subheadline.bold())
                                    Spacer()
                                    Text(r.module ?? "—").font(.caption2).foregroundStyle(.secondary)
                                }
                                if let input = r.input { Text(input).font(.caption).lineLimit(2) }
                                if let rating = r.rating { Text("Note : \(rating)/5").font(.caption2).foregroundStyle(.yellow) }
                            }
                        }
                    }
                }
            }
            .padding()
        } else if dataset.isLoading {
            VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in ShimmerBox(height: 50) } }.padding()
        } else if let err = dataset.error {
            ContentUnavailableView { Label("Erreur", systemImage: "exclamationmark.triangle.fill") } description: { Text(err) }
        }
    }

    private func ask() async {
        asking = true
        do { chatResponse = try await APIClient.shared.adminLimuleChat(prompt) }
        catch { }
        asking = false
    }
}

// MARK: - Abonnements (forfaits / promotions / entreprises)

struct AdminSubscriptionsView: View {
    @State private var tab = 0
    @StateObject private var plans = Loadable<[SubscriptionPlan]>()
    @StateObject private var promos = Loadable<[Promotion]>()
    @StateObject private var companies = Loadable<[CompanySubscriptionRow]>()
    @State private var showNewPlan = false
    @State private var showNewPromo = false
    @State private var editPlan: SubscriptionPlan?
    @State private var editPromo: Promotion?
    @State private var grantTarget: CompanySubscriptionRow?

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                Text("Forfaits").tag(0); Text("Promotions").tag(1); Text("Entreprises").tag(2)
            }
            .pickerStyle(.segmented)
            .padding()

            ScrollView {
                if tab == 0 { plansTab }
                else if tab == 1 { promosTab }
                else { companiesTab }
            }
        }
        .navigationTitle("Abonnements")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            if tab == 0 {
                ToolbarItem(placement: .primaryAction) { Button { showNewPlan = true } label: { Image(systemName: "plus") } }
            } else if tab == 1 {
                ToolbarItem(placement: .primaryAction) { Button { showNewPromo = true } label: { Image(systemName: "plus") } }
            }
        }
        .task { await loadAll() }
        .refreshable { await loadAll() }
        .sheet(isPresented: $showNewPlan) { AdminPlanFormView { await plans.load { try await APIClient.shared.adminPlans() } } }
        .sheet(isPresented: $showNewPromo) { AdminPromoFormView { await promos.load { try await APIClient.shared.adminPromos() } } }
        .sheet(item: $editPlan) { plan in
            AdminPlanFormView(existing: plan) { await plans.load { try await APIClient.shared.adminPlans() } }
        }
        .sheet(item: $editPromo) { promo in
            AdminPromoFormView(existing: promo) { await promos.load { try await APIClient.shared.adminPromos() } }
        }
        .sheet(item: $grantTarget) { row in
            AdminGrantFormView(row: row) { await companies.load { try await APIClient.shared.adminCompanySubs() } }
        }
    }

    @ViewBuilder private var plansTab: some View {
        if let p = plans.value {
            VStack(spacing: 10) {
                if p.isEmpty { ContentUnavailableView("Aucun forfait", systemImage: "creditcard") }
                ForEach(p) { plan in
                    GlassCard {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(plan.name).font(.subheadline.bold())
                                Spacer()
                                StatusPill(text: plan.is_active ? "actif" : "inactif", colorName: plan.is_active ? "green" : "gray")
                            }
                            Text("\(plan.code) · \(fcfa(Double(plan.price_cents) / 100)) / \(plan.period)")
                                .font(.caption).foregroundStyle(.secondary)
                            if !plan.features.isEmpty {
                                Text(plan.features.joined(separator: " · ")).font(.caption2).foregroundStyle(.secondary)
                            }
                            HStack(spacing: 16) {
                                Button("Modifier") { editPlan = plan }.font(.caption)
                                Button("Supprimer", role: .destructive) { Task { await deletePlan(plan.code) } }.font(.caption)
                            }
                        }
                    }
                }
            }
            .padding()
        } else if plans.isLoading {
            VStack(spacing: 12) { ForEach(0..<3, id: \.self) { _ in ShimmerBox(height: 60) } }.padding()
        } else if let err = plans.error {
            ContentUnavailableView { Label("Erreur", systemImage: "exclamationmark.triangle.fill") } description: { Text(err) }
        }
    }

    @ViewBuilder private var promosTab: some View {
        if let p = promos.value {
            VStack(spacing: 10) {
                if p.isEmpty { ContentUnavailableView("Aucune promotion", systemImage: "tag") }
                ForEach(p) { promo in
                    GlassCard {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(promo.code).font(.subheadline.bold())
                                Spacer()
                                StatusPill(text: promo.is_active ? "active" : "inactive", colorName: promo.is_active ? "green" : "gray")
                            }
                            Text("-\(promo.percent_off)% · \(promo.times_redeemed)/\(promo.max_redemptions == 0 ? "∞" : "\(promo.max_redemptions)") utilisées")
                                .font(.caption).foregroundStyle(.secondary)
                            HStack(spacing: 16) {
                                Button("Modifier") { editPromo = promo }.font(.caption)
                                Button("Supprimer", role: .destructive) { Task { await deletePromo(promo.code) } }.font(.caption)
                            }
                        }
                    }
                }
            }
            .padding()
        } else if promos.isLoading {
            VStack(spacing: 12) { ForEach(0..<3, id: \.self) { _ in ShimmerBox(height: 60) } }.padding()
        } else if let err = promos.error {
            ContentUnavailableView { Label("Erreur", systemImage: "exclamationmark.triangle.fill") } description: { Text(err) }
        }
    }

    @ViewBuilder private var companiesTab: some View {
        if let c = companies.value {
            VStack(spacing: 10) {
                if c.isEmpty { ContentUnavailableView("Aucune entreprise", systemImage: "building.2") }
                ForEach(c) { row in
                    GlassCard {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(row.company_name).font(.subheadline.bold())
                                    Text("\(row.plan_code ?? "—") · \(shortDate(row.current_period_end))")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                StatusPill(text: row.company_status, colorName: row.company_status == "active" ? "green" : "red")
                            }
                            HStack(spacing: 16) {
                                if row.company_status == "active" {
                                    Button("Suspendre", role: .destructive) { Task { await suspend(row) } }.font(.caption)
                                } else {
                                    Button("Réactiver") { Task { await reactivate(row) } }.font(.caption)
                                }
                                Spacer()
                                Button("Accorder un forfait") { grantTarget = row }.font(.caption)
                            }
                        }
                    }
                }
            }
            .padding()
        } else if companies.isLoading {
            VStack(spacing: 12) { ForEach(0..<3, id: \.self) { _ in ShimmerBox(height: 70) } }.padding()
        } else if let err = companies.error {
            ContentUnavailableView { Label("Erreur", systemImage: "exclamationmark.triangle.fill") } description: { Text(err) }
        }
    }

    private func loadAll() async {
        await plans.load { try await APIClient.shared.adminPlans() }
        await promos.load { try await APIClient.shared.adminPromos() }
        await companies.load { try await APIClient.shared.adminCompanySubs() }
    }
    private func deletePlan(_ code: String) async {
        await plans.load {
            _ = try await APIClient.shared.adminDeletePlan(code)
            return try await APIClient.shared.adminPlans()
        }
    }
    private func deletePromo(_ code: String) async {
        await promos.load {
            _ = try await APIClient.shared.adminDeletePromo(code)
            return try await APIClient.shared.adminPromos()
        }
    }
    private func suspend(_ row: CompanySubscriptionRow) async {
        await companies.load {
            _ = try await APIClient.shared.adminSuspendCompany(row.company_id)
            return try await APIClient.shared.adminCompanySubs()
        }
    }
    private func reactivate(_ row: CompanySubscriptionRow) async {
        await companies.load {
            _ = try await APIClient.shared.adminReactivateCompany(row.company_id)
            return try await APIClient.shared.adminCompanySubs()
        }
    }
}

struct AdminPlanFormView: View {
    var existing: SubscriptionPlan? = nil
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var code: String
    @State private var name: String
    @State private var priceText: String
    @State private var currency: String
    @State private var period: String
    @State private var trialDays: Int
    @State private var isActive: Bool
    @State private var maxUsers: Int
    @State private var modules: Set<String>
    @State private var saving = false

    // Modules premium gateables (clé = segment de route, miroir backend/web).
    private static let moduleOptions: [(key: String, label: String)] = [
        ("employees", "RH / Employés"), ("payroll", "Paie"), ("accounting", "Comptabilité"),
        ("declarations", "Déclarations"), ("fiscal", "Fiscalité"), ("assistants", "Rédaction IA"),
        ("limule", "Limule IA"), ("projects", "Projets"), ("kanban", "Kanban"),
        ("meetings", "Réunions"), ("chat", "Chat"), ("reports", "Rapports"),
        ("investments", "Investissements"), ("groups", "Groupes & Tontines"),
        ("reports-teras", "TERAS (rapports)"), ("teras", "TERAS Connect"),
    ]

    init(existing: SubscriptionPlan? = nil, onSaved: @escaping () async -> Void) {
        self.existing = existing
        self.onSaved = onSaved
        _code = State(initialValue: existing?.code ?? "")
        _name = State(initialValue: existing?.name ?? "")
        _priceText = State(initialValue: "\(existing?.price_cents ?? 0)")
        _currency = State(initialValue: existing?.currency ?? "XAF")
        _period = State(initialValue: existing?.period ?? "month")
        _trialDays = State(initialValue: existing?.trial_days ?? 0)
        _isActive = State(initialValue: existing?.is_active ?? true)
        _maxUsers = State(initialValue: existing?.max_users ?? 0)
        _modules = State(initialValue: Set(existing?.included_modules ?? []))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Forfait") {
                    TextField("Code *", text: $code).disabled(existing != nil)
                    TextField("Nom *", text: $name)
                    TextField("Prix (centimes)", text: $priceText)
                        #if os(iOS)
                        .keyboardType(.numberPad)
                        #endif
                    Picker("Période", selection: $period) {
                        Text("Mois").tag("month"); Text("Année").tag("year")
                    }
                    Stepper("Essai : \(trialDays) j", value: $trialDays, in: 0...365)
                    Stepper(maxUsers == 0 ? "Utilisateurs : illimité" : "Utilisateurs max : \(maxUsers)", value: $maxUsers, in: 0...500)
                    Toggle("Actif", isOn: $isActive)
                }
                Section {
                    ForEach(Self.moduleOptions, id: \.key) { opt in
                        Button {
                            if modules.contains(opt.key) { modules.remove(opt.key) } else { modules.insert(opt.key) }
                        } label: {
                            HStack {
                                Text(opt.label).foregroundStyle(.primary)
                                Spacer()
                                if modules.contains(opt.key) { Image(systemName: "checkmark").foregroundStyle(.green) }
                            }
                        }
                    }
                } header: { Text("Modules inclus") } footer: {
                    Text("Les modules non cochés seront verrouillés pour ce forfait. Les modules de base restent toujours accessibles.")
                }
            }
            .navigationTitle(existing == nil ? "Nouveau forfait" : "Modifier le forfait")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(existing == nil ? "Créer" : "Enregistrer") { Task { await save() } }.disabled(code.isEmpty || name.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        let payload = PlanUpsertPayload(code: code, name: name, price_cents: Int(priceText) ?? 0,
                                        currency: currency, period: period,
                                        included_modules: Array(modules), max_users: maxUsers,
                                        trial_days: trialDays, is_active: isActive)
        do {
            if let existing { _ = try await APIClient.shared.adminUpdatePlan(existing.id, payload) }
            else { _ = try await APIClient.shared.adminCreatePlan(payload) }
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}

struct AdminPromoFormView: View {
    var existing: Promotion? = nil
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var code: String
    @State private var percentOff: Int
    @State private var planCode: String
    @State private var maxRedemptions: Int
    @State private var isActive: Bool
    @State private var saving = false

    init(existing: Promotion? = nil, onSaved: @escaping () async -> Void) {
        self.existing = existing
        self.onSaved = onSaved
        _code = State(initialValue: existing?.code ?? "")
        _percentOff = State(initialValue: existing?.percent_off ?? 10)
        _planCode = State(initialValue: existing?.plan_code ?? "")
        _maxRedemptions = State(initialValue: existing?.max_redemptions ?? 0)
        _isActive = State(initialValue: existing?.is_active ?? true)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Promotion") {
                    TextField("Code *", text: $code).disabled(existing != nil)
                    Stepper("Réduction : \(percentOff)%", value: $percentOff, in: 0...100, step: 5)
                    TextField("Code forfait ciblé", text: $planCode)
                    Stepper("Limite d'utilisations : \(maxRedemptions == 0 ? "∞" : "\(maxRedemptions)")", value: $maxRedemptions, in: 0...1000, step: 10)
                    Toggle("Active", isOn: $isActive)
                }
            }
            .navigationTitle(existing == nil ? "Nouvelle promotion" : "Modifier la promotion")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(existing == nil ? "Créer" : "Enregistrer") { Task { await save() } }.disabled(code.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        let payload = PromoUpsertPayload(code: code, percent_off: percentOff, is_active: isActive, plan_code: planCode, max_redemptions: maxRedemptions)
        do {
            if let existing { _ = try await APIClient.shared.adminUpdatePromo(existing.code, payload) }
            else { _ = try await APIClient.shared.adminCreatePromo(payload) }
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}

struct AdminGrantFormView: View {
    let row: CompanySubscriptionRow
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var planCode = ""
    @State private var days = 365
    @State private var plans: [SubscriptionPlan] = []
    @State private var saving = false

    private let presets: [(label: String, days: Int)] = [
        ("1 mois", 30), ("3 mois", 90), ("1 an", 365), ("Gratuit à vie", 3650),
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section(row.company_name) {
                    if plans.isEmpty {
                        TextField("Code forfait *", text: $planCode)
                    } else {
                        Picker("Forfait", selection: $planCode) {
                            Text("— Choisir —").tag("")
                            ForEach(plans) { p in
                                Text("\(p.name)\(p.max_users == 0 ? " · illimité" : " · \(p.max_users) users")").tag(p.code)
                            }
                        }
                    }
                    Picker("Durée", selection: $days) {
                        ForEach(presets, id: \.days) { Text($0.label).tag($0.days) }
                    }
                    Stepper("\(days) jour(s)", value: $days, in: 1...3650, step: 30)
                }
            }
            .task { plans = (try? await APIClient.shared.adminPlans()) ?? [] }
            .navigationTitle("Accorder un forfait")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Accorder") { Task { await save() } }.disabled(planCode.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        do {
            _ = try await APIClient.shared.adminGrantSubscription(row.company_id, GrantRequestPayload(plan_code: planCode, days: days))
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}

// MARK: - Admin breakdown donut (sectors / countries)

struct AdminBreakdownChart: View {
    let rows: [(String, Int)]
    @EnvironmentObject private var theme: CompanyTheme

    private var top: [(label: String, count: Int)] {
        rows.sorted { $0.1 > $1.1 }.prefix(6).map { (label: $0.0, count: $0.1) }
    }
    private var total: Int { top.reduce(0) { $0 + $1.count } }
    private let palette: [Color] = [.indigo, .teal, .orange, .pink, .green, .blue]

    var body: some View {
        if top.isEmpty || total == 0 { EmptyView() } else {
            HStack(alignment: .center, spacing: 16) {
                Chart(Array(top.enumerated()), id: \.offset) { idx, row in
                    SectorMark(angle: .value("n", row.count), innerRadius: .ratio(0.6), angularInset: 1.5)
                        .cornerRadius(3)
                        .foregroundStyle(palette[idx % palette.count])
                }
                .frame(width: 120, height: 120)

                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(top.enumerated()), id: \.offset) { idx, row in
                        HStack(spacing: 8) {
                            Circle().fill(palette[idx % palette.count]).frame(width: 9, height: 9)
                            Text(row.label).font(.caption).lineLimit(1)
                            Spacer(minLength: 8)
                            Text("\(row.count)").font(.caption.bold()).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
