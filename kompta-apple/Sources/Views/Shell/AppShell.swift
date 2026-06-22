import SwiftUI

struct AppShell: View {
    @EnvironmentObject private var theme: CompanyTheme
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var ent: EntitlementsManager

    var body: some View {
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

    // MARK: - iOS: TabView

    private var iOSShell: some View {
        TabView {
            NavigationStack { DashboardView() }
                .tabItem { Label("Tableau de bord", systemImage: "chart.bar.fill") }

            if RolePermissions.canAccess(role: auth.currentUser?.role, moduleId: "pos") {
                NavigationStack { POSView() }
                    .tabItem { Label("Caisse", systemImage: "cart.fill") }
            }

            NavigationStack { LimuleChatView() }
                .tabItem {
                    Label {
                        Text("Limule")
                    } icon: {
                        Image("LimuleAvatar").renderingMode(.original)
                    }
                }

            NavigationStack { ModuleHubView() }
                .tabItem { Label("Modules", systemImage: "square.grid.2x2.fill") }

            NavigationStack { SettingsView() }
                .tabItem { Label("Réglages", systemImage: "gearshape.fill") }
        }
        .tint(theme.primary)
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
    }

    @ViewBuilder
    private func detailView(for id: String) -> some View {
        if ent.isLocked(moduleId: id) {
            UpgradeRequiredView(title: ModuleRegistry.all.first(where: { $0.id == id })?.title ?? "Cette fonctionnalité")
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
                if RolePermissions.canAccess(role: auth.currentUser?.role, moduleId: "pos") {
                    SidebarRow(id: "pos", title: "Caisse (POS)", icon: "cart.fill", tint: .pink)
                }
                SidebarRow(id: "limule", title: "Limule", icon: KomptaBrand.limuleIcon, tint: KomptaBrand.limuleBlue)
            }
            ForEach(ModuleRegistry.visibleSections(role: auth.currentUser?.role), id: \.self) { section in
                Section(section) {
                    ForEach(ModuleRegistry.visibleModules(in: section, role: auth.currentUser?.role)) { m in
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

// Écran affiché quand un module n'est pas inclus dans l'offre courante.
struct UpgradeRequiredView: View {
    let title: String
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "lock.fill").font(.system(size: 40)).foregroundStyle(.orange)
            Text("« \(title) » n'est pas inclus dans votre offre")
                .font(.headline).multilineTextAlignment(.center)
            Text("Passez à une offre supérieure dans Réglages → Abonnement pour débloquer cette fonctionnalité.")
                .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
#endif

// ============================================================================
//  MARK: - Notification center (aggregated activity feed)
// ============================================================================

@MainActor
final class NotificationManager: ObservableObject {
    static let shared = NotificationManager()

    @Published private(set) var items: [AppNotification] = []
    @Published private(set) var isLoading = false

    var unreadCount: Int { items.filter { !$0.isRead }.count }

    func markRead(_ id: UUID) {
        if let i = items.firstIndex(where: { $0.id == id }) { items[i].isRead = true }
    }

    func markAllRead() { for i in items.indices { items[i].isRead = true } }

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

        items = collected
        isLoading = false
    }
}

struct NotificationsView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @ObservedObject private var manager = NotificationManager.shared
    @Environment(\.dismiss) private var dismiss

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
                            NotificationRow(notif: notif)
                                .listRowBackground(notif.isRead ? Color.clear : theme.primary.opacity(0.05))
                                .onTapGesture { manager.markRead(notif.id) }
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
        }
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
            if !notif.isRead { Circle().fill(.blue).frame(width: 8, height: 8) }
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
                        .padding(3).background(.red, in: Circle()).offset(x: 6, y: -6)
                }
            }
        }
        .sheet(isPresented: $showSheet) { NotificationsView() }
        .task { await manager.refresh() }
    }
}
