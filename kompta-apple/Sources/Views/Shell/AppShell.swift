import SwiftUI

struct AppShell: View {
    @EnvironmentObject private var theme: CompanyTheme
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var ent: EntitlementsManager

    @AppStorage("kompta_setup_dismissed") private var setupDismissed = false
    @AppStorage("kompta_force_setup") private var forceSetup = false
    @AppStorage("kompta_tour_done") private var tourDone = false
    @AppStorage("kompta_force_tour") private var forceTour = false

    /// Étape d'onboarding présentée. UN SEUL cover/sheet pilote l'affichage :
    /// empiler deux `.fullScreenCover` sur la même vue provoquait un écran noir
    /// figé lors du passage tour → assistant et à la réouverture.
    private enum OnboardingStage: Int, Identifiable { case tour, setup; var id: Int { rawValue } }
    @State private var stage: OnboardingStage?

    var body: some View {
        shell
            .task { evaluateOnboarding() }
            .onChange(of: forceSetup) { _, forced in if forced { presentSetup() } }
            .onChange(of: forceTour) { _, forced in if forced { stage = .tour } }
            #if os(iOS)
            .fullScreenCover(item: $stage) { stageView($0) }
            #else
            .sheet(item: $stage) { stageView($0).frame(minWidth: 520, minHeight: 620) }
            #endif
    }

    @ViewBuilder
    private func stageView(_ s: OnboardingStage) -> some View {
        switch s {
        case .tour:
            FeatureTour { finishTour() }.environmentObject(theme)
        case .setup:
            CompanySetupWizard { finishSetup() }.environmentObject(theme)
        }
    }

    @ViewBuilder private var shell: some View {
        #if os(iOS)
        iOSShell
        #else
        // Rounded-border text fields + grouped form style propagate via the
        // environment to every module form and its sheets, so macOS fields are
        // visibly bordered and forms lay out cleanly (the default plain style is
        // nearly invisible and the columnar form style overflows narrow sheets).
        macOSShell
            .textFieldStyle(.roundedBorder)
            .formStyle(.grouped)
        #endif
    }

    /// La visite guidée (carrousel de 16 cartes) ne se lance plus automatiquement
    /// à la première connexion : elle est désormais opt-in, relançable depuis
    /// Réglages (`forceTour`). L'aide "juste à temps" est prise en charge par
    /// les indices contextuels par module affichés à la première visite de
    /// chaque écran. L'assistant de configuration d'entreprise, lui, reste
    /// déclenché automatiquement pour un admin au profil incomplet — il porte
    /// des étapes réellement nécessaires (infos légales, coordonnées bancaires…).
    private func evaluateOnboarding() {
        guard stage == nil else { return }
        if forceTour { stage = .tour; return }
        if forceSetup { stage = .setup; return }
        if shouldShowSetup() { stage = .setup }
    }

    private func finishTour() {
        tourDone = true
        forceTour = false
        stage = nil
        Task { await auth.markOnboardingDone() }
        // Enchaîne proprement sur l'assistant APRÈS la fermeture du tour
        // (un seul cover à la fois : on attend la fin de l'animation de dismiss).
        guard shouldShowSetup(ignoreServerCompletion: true) else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { stage = .setup }
    }

    private func finishSetup() {
        setupDismissed = true
        forceSetup = false
        stage = nil
    }

    private func presentSetup() {
        stage = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { stage = .setup }
    }

    /// L'assistant ne s'affiche que pour un admin d'entreprise au profil incomplet
    /// et non encore reporté.
    private func shouldShowSetup(ignoreServerCompletion: Bool = false) -> Bool {
        guard auth.currentUser?.role == "admin_entreprise" else { return false }
        guard !setupDismissed else { return false }
        // Le flag serveur doit aussi empêcher l'assistant de réapparaître après
        // une réinstallation ou sur un nouvel appareil. On l'ignore uniquement
        // pendant l'enchaînement de la toute première visite guidée.
        if !ignoreServerCompletion && auth.currentUser?.onboarding_done == true { return false }
        return (auth.company?.completion_score ?? 100) < 100
    }

    // MARK: - iOS: TabView

    @State private var selectedTab: String = "dashboard"

    private var iOSShell: some View {
        TabView(selection: $selectedTab) {
            NavigationStack { DashboardView() }
                .tabItem { Label("Tableau de bord", systemImage: "chart.bar.fill") }
                .tag("dashboard")

            if RolePermissions.canAccess(user: auth.currentUser, moduleId: "pos") {
                NavigationStack { POSView() }
                    .tabItem { Label("Caisse", systemImage: "cart.fill") }
                    .tag("pos")
            }

            NavigationStack { LimuleChatView() }
                .tabItem {
                    Label {
                        Text("Limule")
                    } icon: {
                        // Imageset dédié, dimensionné pour la barre d'onglets
                        // (net et à la même taille optique que les autres icônes).
                        Image("LimuleTab")
                            .renderingMode(.original)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 22, height: 22)
                    }
                }
                .tag("limule")

            NavigationStack { ModuleHubView() }
                .tabItem { Label("Modules", systemImage: "square.grid.2x2.fill") }
                .tag("modules")

            NavigationStack { SettingsView() }
                .tabItem { Label("Réglages", systemImage: "gearshape.fill") }
                .tag("settings")
        }
        .tint(theme.primary)
        .onReceive(NotificationCenter.default.publisher(for: .komptaNavigate)) { note in
            if let moduleId = note.object as? String {
                let tab = moduleId == "settings" ? "settings" : "modules"
                selectedTab = tab
            }
        }
    }

    // MARK: - macOS: NavigationSplitView + sidebar
    //
    // Selection-driven: the sidebar selects a module id, and the detail column
    // hosts its own NavigationStack keyed to that id. This gives every module a
    // fresh navigation stack, so drill-downs (list → detail) get real macOS
    // back buttons, and switching modules resets cleanly.

    #if os(macOS)
    @State private var selection: String = "dashboard"
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    private var macOSShell: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            sidebar
                .navigationSplitViewColumnWidth(min: 220, ideal: 240, max: 300)
        } detail: {
            NavigationStack {
                VStack(spacing: 0) {
                    if ent.showTrialBanner {
                        TrialBanner(text: ent.trialBannerText, critical: ent.trialBannerIsCritical)
                            .padding([.horizontal, .top])
                    }
                    detailView(for: selection)
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .onReceive(NotificationCenter.default.publisher(for: .komptaNavigate)) { note in
            if let moduleId = note.object as? String { selection = moduleId }
        }
    }

    @ViewBuilder
    private func detailView(for id: String) -> some View {
        if ent.isLocked(moduleId: id) {
            LimuleRestrictedView(kind: .subscription)
        } else {
            switch id {
            case "dashboard": DashboardView()
            case "pos":       POSView()
            case "limule":    LimuleChatView()
            case "settings":  SettingsView()
            default:
                if let m = ModuleRegistry.all.first(where: { $0.id == id }) {
                    m.make()
                } else {
                    DashboardView()
                }
            }
        }
    }

    private var sidebar: some View {
        List(selection: $selection) {
            Section("Principal") {
                SidebarRow(id: "dashboard", title: "Tableau de bord", icon: "chart.bar.fill", tint: theme.primary)
                if RolePermissions.canAccess(user: auth.currentUser, moduleId: "pos") {
                    SidebarRow(id: "pos", title: "Caisse (POS)", icon: "cart.fill", tint: .pink)
                }
                SidebarRow(id: "limule", title: "Limule", icon: KomptaBrand.limuleIcon, tint: KomptaBrand.limuleBlue)
            }
            ForEach(ModuleRegistry.visibleSections(for: auth.currentUser), id: \.self) { section in
                Section(section) {
                    ForEach(ModuleRegistry.visibleModules(in: section, for: auth.currentUser)) { m in
                        SidebarRow(id: m.id, title: m.title, icon: m.icon, tint: m.tint, locked: ent.isLocked(moduleId: m.id))
                    }
                }
            }
            Section("Système") {
                SidebarRow(id: "settings", title: "Réglages", icon: "gearshape.fill", tint: .secondary)
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("KOMPTA")
    }
    #endif
}

// MARK: - macOS sidebar row (tagged for List selection)

#if os(macOS)
private struct SidebarRow: View {
    let id: String
    let title: String
    let icon: String
    var tint: Color = .secondary
    var locked: Bool = false

    var body: some View {
        Label {
            HStack {
                Text(title)
                if locked { Spacer(); Image(systemName: "lock.fill").font(.caption2).foregroundStyle(.secondary) }
            }
        } icon: {
            if icon == KomptaBrand.limuleIcon {
                LimuleMark(size: 18, showAura: false)
            } else {
                Image(systemName: icon).foregroundStyle(tint)
            }
        }
        .opacity(locked ? 0.5 : 1)
        .tag(id)
    }
}

#endif

// ============================================================================
//  MARK: - Notification center (aggregated activity feed)
// ============================================================================

extension Notification.Name {
    static let komptaNavigate = Notification.Name("komptaNavigate")
}

@MainActor
final class NotificationManager: ObservableObject {
    static let shared = NotificationManager()

    @Published private(set) var items: [AppNotification] = []
    @Published private(set) var isLoading = false

    private static let readKey = "kompta_read_notif_sigs"
    private var persistedReadSigs: Set<String> {
        get { Set(UserDefaults.standard.stringArray(forKey: Self.readKey) ?? []) }
        set { UserDefaults.standard.set(Array(newValue), forKey: Self.readKey) }
    }

    var unreadCount: Int { items.filter { !$0.isRead }.count }

    func markRead(_ id: UUID) {
        if let i = items.firstIndex(where: { $0.id == id }) {
            items[i].isRead = true
            var sigs = persistedReadSigs; sigs.insert(items[i].signature); persistedReadSigs = sigs
        }
    }

    func markAllRead() {
        var sigs = persistedReadSigs
        for i in items.indices { items[i].isRead = true; sigs.insert(items[i].signature) }
        persistedReadSigs = sigs
    }

    func refresh() async {
        guard !isLoading else { return }
        isLoading = true
        var collected: [AppNotification] = []

        // Diffusions admin (broadcasts) — affichées en tête.
        if let broadcasts = try? await APIClient.shared.broadcastNotifications() {
            for b in broadcasts.prefix(10) {
                let tint: String = b.type == "critical" ? "red" : (b.type == "warning" ? "orange" : "blue")
                let icon: String = b.type == "critical" ? "exclamationmark.octagon.fill"
                    : (b.type == "warning" ? "exclamationmark.triangle.fill" : "megaphone.fill")
                collected.append(AppNotification(
                    title: b.title, subtitle: b.message,
                    icon: icon, tint: tint, moduleId: "dashboard"
                ))
            }
        }

        // Invoices — unpaid / overdue
        if let invoices = try? await APIClient.shared.invoices() {
            for inv in invoices.filter({ $0.status == "sent" || $0.status == "overdue" }).prefix(5) {
                let overdue = inv.status == "overdue"
                collected.append(AppNotification(
                    title: overdue ? "Facture en retard" : "Facture non payée",
                    subtitle: "\(inv.number) · \(inv.customer_name) · \(fcfa(inv.total_amount))",
                    icon: overdue ? "exclamationmark.triangle.fill" : "doc.text.fill",
                    tint: overdue ? "red" : "orange", moduleId: "billing"
                ))
            }
        }

        // Meetings — upcoming
        if let meetings = try? await APIClient.shared.meetings() {
            let now = Date(); let iso = ISO8601DateFormatter()
            for m in meetings.filter({ iso.date(from: $0.start_at).map { $0 > now } ?? false }).prefix(3) {
                collected.append(AppNotification(
                    title: "Réunion à venir",
                    subtitle: "\(m.title) · \(shortDate(m.start_at))",
                    icon: "calendar.badge.clock", tint: "indigo", moduleId: "meetings"
                ))
            }
        }

        // Support tickets — open
        if let tickets = try? await APIClient.shared.tickets() {
            for t in tickets.filter({ $0.status != "resolved" }).prefix(3) {
                collected.append(AppNotification(
                    title: "Demande de support ouverte", subtitle: t.subject,
                    icon: "lifepreserver.fill", tint: "red", moduleId: "help"
                ))
            }
        }

        // Large debits
        if let txns = try? await APIClient.shared.transactions() {
            for t in txns.filter({ $0.amount < -100_000 }).prefix(3) {
                collected.append(AppNotification(
                    title: "Sortie importante",
                    subtitle: "\(t.label) · \(fcfa(abs(t.amount)))",
                    icon: "arrow.down.circle.fill", tint: "orange", moduleId: "transactions"
                ))
            }
        }

        // Alertes proactives Limule (trésorerie faible sous cash_low_threshold_cents,
        // stock bas, échéances fiscales, tâches, anniversaires, cotisations en retard).
        // Ces alertes sont calculées côté backend par compute_dashboard_alerts et
        // partagées avec le web (même source de vérité — évite toute divergence).
        if let alerts = try? await APIClient.shared.limuleAlerts() {
            for alert in alerts.prefix(8) {
                let tint: String = alert.severity == "critical" ? "red" : (alert.severity == "warning" ? "orange" : "blue")
                let icon: String
                let moduleId: String
                switch alert.type {
                case "cash_low": icon = "bell.badge.fill"; moduleId = "transactions"
                case "overdue_invoice": icon = "exclamationmark.triangle.fill"; moduleId = "billing"
                case "low_stock": icon = "shippingbox.fill"; moduleId = "inventory"
                case "fiscal_deadline": icon = "calendar.badge.exclamationmark"; moduleId = "fiscal"
                case "task_deadline": icon = "checklist"; moduleId = "tasks"
                case "birthday": icon = "gift.fill"; moduleId = "groups"
                case "overdue_contributions": icon = "person.2.badge.gearshape.fill"; moduleId = "groups"
                default: icon = "bell.fill"; moduleId = "dashboard"
                }
                collected.append(AppNotification(
                    title: alert.type == "cash_low" ? "Trésorerie faible" : "Alerte Limule",
                    subtitle: alert.message,
                    icon: icon, tint: tint, moduleId: moduleId
                ))
            }
        }

        // Restore persisted read state — prevents notifications from "coming back"
        // after every refresh by keying off a deterministic signature.
        let readSigs = persistedReadSigs
        for i in collected.indices {
            if readSigs.contains(collected[i].signature) { collected[i].isRead = true }
        }
        items = collected
        isLoading = false
    }
}

struct NotificationsView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @ObservedObject private var manager = NotificationManager.shared
    @Environment(\.dismiss) private var dismiss
    @State private var selected: AppNotification?

    var body: some View {
        NavigationStack {
            Group {
                if manager.isLoading {
                    VStack(spacing: 12) { ForEach(0..<5, id: \.self) { _ in ShimmerBox(height: 60, cornerRadius: 12) } }.padding()
                } else if manager.items.isEmpty {
                    ContentUnavailableView("Aucune notification", systemImage: "bell.slash.fill")
                } else {
                    List {
                        ForEach(manager.items) { notif in
                            Button {
                                manager.markRead(notif.id)
                                selected = notif
                            } label: {
                                NotificationRow(notif: notif)
                            }
                            .buttonStyle(.plain)
                            .listRowBackground(notif.isRead ? Color.clear : theme.primary.opacity(0.05))
                        }
                    }
                    #if os(iOS)
                    .listStyle(.insetGrouped)
                    #endif
                }
            }
            .navigationTitle("Notifications")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } }
                if manager.unreadCount > 0 {
                    ToolbarItem(placement: .confirmationAction) { Button("Tout lire") { manager.markAllRead() } }
                }
            }
            .task { await manager.refresh() }
            .refreshable { await manager.refresh() }
            // Petite page flottante avec le texte complet — avant, un tap
            // basculait direct vers le module concerné (pas le bon écran, cf.
            // retour utilisateur) ; on montre maintenant le détail d'abord,
            // avec un bouton explicite pour aller au module si besoin.
            .sheet(item: $selected) { notif in
                NotificationDetailView(notif: notif, onOpenModule: {
                    selected = nil
                    dismiss()
                    NotificationCenter.default.post(name: .komptaNavigate, object: notif.moduleId)
                })
                .environmentObject(theme)
            }
        }
    }
}

private struct NotificationDetailView: View {
    let notif: AppNotification
    var onOpenModule: () -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: CompanyTheme

    private var tintColor: Color {
        switch notif.tint {
        case "red": return .red; case "orange": return .orange; case "green": return .green
        case "blue": return .blue; case "indigo": return .indigo; case "purple": return .purple
        default: return .secondary
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 14) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 12).fill(tintColor.opacity(0.15)).frame(width: 48, height: 48)
                            Image(systemName: notif.icon).font(.system(size: 20)).foregroundStyle(tintColor)
                        }
                        Text(notif.title).font(.title3.bold())
                    }
                    Text(notif.subtitle)
                        .font(.body)
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    Button {
                        onOpenModule()
                    } label: {
                        Label("Aller au module concerné", systemImage: "arrow.right.circle.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(theme.primary)
                }
                .padding(24)
            }
            .navigationTitle("Notification")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } }
            }
        }
        #if os(iOS)
        .presentationDetents([.medium, .large])
        #endif
    }
}

private struct NotificationRow: View {
    let notif: AppNotification
    private var tintColor: Color {
        switch notif.tint {
        case "red": return .red; case "orange": return .orange; case "green": return .green
        case "blue": return .blue; case "indigo": return .indigo; case "purple": return .purple
        default: return .secondary
        }
    }
    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10).fill(tintColor.opacity(0.15)).frame(width: 40, height: 40)
                Image(systemName: notif.icon).font(.system(size: 18)).foregroundStyle(tintColor)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(notif.title).font(.subheadline.bold()).foregroundStyle(notif.isRead ? .secondary : .primary)
                Text(notif.subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer()
            HStack(spacing: 6) {
                if !notif.isRead { Circle().fill(.blue).frame(width: 8, height: 8) }
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
    }
}

struct NotificationBell: View {
    @ObservedObject private var manager = NotificationManager.shared
    @State private var showSheet = false

    var body: some View {
        Button { showSheet = true } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "bell.fill")
                if manager.unreadCount > 0 {
                    Text("\(min(manager.unreadCount, 99))")
                        .font(.system(size: 9, weight: .bold)).foregroundStyle(.white)
                        .padding(3).background(.red, in: Circle()).offset(x: 3, y: -4)
                }
            }
            // Place en .primaryAction (bord droit de la nav bar) : sans cette
            // marge, le badge de compteur déborde hors de l'écran et se
            // retrouve coupé (cf. capture utilisateur).
            .padding(.trailing, 4)
        }
        .accessibilityLabel("Notifications")
        .accessibilityValue(manager.unreadCount > 0 ? "\(manager.unreadCount) non lues" : "Aucune non lue")
        .sheet(isPresented: $showSheet) { NotificationsView() }
        .task { await manager.refresh() }
    }
}
