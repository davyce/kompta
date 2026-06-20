import SwiftUI

// ============================================================================
//  SuperAdminShell — the EXCLUSIVE entry point for super_admin accounts,
//  mirroring the web app's AdminShell.tsx: a super_admin never sees the
//  regular company Dashboard/POS/Modules grid at all (see ContentView.swift),
//  they land directly in the platform console built in Wave 6 (AdminHubView
//  and its 11 screens). This file is just the navigation chrome around that
//  existing content — no new admin screens, only how they're reached.
// ============================================================================

struct SuperAdminShell: View {
    @EnvironmentObject private var theme: CompanyTheme
    @EnvironmentObject private var auth: AuthManager

    /// A sidebar item is visible if the user is super_admin or their custom role
    /// grants the matching permission.
    private func granted(_ perm: String) -> Bool {
        let p = auth.currentUser?.adminPermissions ?? []
        return p.contains("*") || p.contains(perm)
    }

    var body: some View {
        #if os(iOS)
        iOSShell
        #else
        macOSShell
        #endif
    }

    // MARK: - iOS: TabView (Administration hub + Réglages for logout)

    private var iOSShell: some View {
        TabView {
            NavigationStack { AdminHubView() }
                .tabItem { Label("Administration", systemImage: "shield.lefthalf.filled") }

            NavigationStack { SettingsView() }
                .tabItem { Label("Réglages", systemImage: "gearshape.fill") }
        }
        .tint(theme.primary)
    }

    // MARK: - macOS: dedicated sidebar (mirrors AdminShell.tsx's 4 sections)
    //
    // Selection-driven like AppShell: the detail column hosts its own
    // NavigationStack so admin drill-downs (company/user/ticket detail) get
    // real macOS back buttons. (A plain `detail:` view breaks them.)

    #if os(macOS)
    @State private var selection = "overview"
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    private var macOSShell: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            sidebar
                .navigationSplitViewColumnWidth(min: 210, ideal: 240, max: 290)
        } detail: {
            NavigationStack { detailView(for: selection) }
        }
        .navigationSplitViewStyle(.balanced)
    }

    @ViewBuilder
    private func detailView(for id: String) -> some View {
        switch id {
        case "overview":      AdminOverviewView()
        case "analytics":     AdminAnalyticsView()
        case "companies":     AdminCompaniesView()
        case "subscriptions": AdminSubscriptionsView()
        case "users":         AdminUsersView()
        case "roles":         RolesManagementView(scope: "admin", title: "Rôles & staff")
        case "onboarding":    AdminOnboardingView()
        case "tickets":       AdminTicketsView()
        case "broadcast":     AdminBroadcastView()
        case "limule":        AdminLimuleView()
        case "system":        AdminSystemView()
        case "audit":         AdminAuditLogsView()
        case "settings":      SettingsView()
        default:              AdminOverviewView()
        }
    }

    private var sidebar: some View {
        List(selection: $selection) {
            Section("Pilotage") {
                if granted("admin_overview") { AdminRow(id: "overview", label: "Vue d'ensemble", icon: "gauge.with.dots.needle.67percent") }
                if granted("admin_analytics") { AdminRow(id: "analytics", label: "Analytique", icon: "chart.line.uptrend.xyaxis") }
            }
            Section("Gestion") {
                if granted("admin_companies") { AdminRow(id: "companies", label: "Entreprises", icon: "building.2.fill") }
                if granted("admin_subscriptions") { AdminRow(id: "subscriptions", label: "Abonnements", icon: "creditcard.fill") }
                if granted("admin_users") { AdminRow(id: "users", label: "Utilisateurs", icon: "person.2.fill") }
                if granted("admin_users") { AdminRow(id: "roles", label: "Rôles & staff", icon: "person.badge.shield.checkmark") }
                if granted("admin_overview") { AdminRow(id: "onboarding", label: "Intégration", icon: "checklist") }
            }
            Section("Support") {
                if granted("admin_tickets") { AdminRow(id: "tickets", label: "Tickets support", icon: "lifepreserver") }
                if granted("admin_broadcast") { AdminRow(id: "broadcast", label: "Diffusion", icon: "megaphone.fill") }
            }
            Section("Système") {
                if granted("admin_overview") { AdminRow(id: "limule", label: "Limule", icon: KomptaBrand.limuleIcon) }
                if granted("admin_system") { AdminRow(id: "system", label: "Système", icon: "heart.text.square.fill") }
                if granted("admin_audit") { AdminRow(id: "audit", label: "Journal d'audit", icon: "doc.text.magnifyingglass") }
            }
            Section("Compte") {
                AdminRow(id: "settings", label: "Réglages", icon: "gearshape.fill")
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("KOMPTA · Super Admin")
        .onAppear {
            // Si la section sélectionnée n'est pas autorisée, basculer vers une autorisée.
            if !granted("admin_overview"), selection == "overview" {
                if granted("admin_tickets") { selection = "tickets" }
                else if granted("admin_companies") { selection = "companies" }
                else if granted("admin_analytics") { selection = "analytics" }
                else { selection = "settings" }
            }
        }
    }
    #endif
}

#if os(macOS)
private struct AdminRow: View {
    let id: String
    let label: String
    let icon: String
    var body: some View {
        Label {
            Text(label)
        } icon: {
            if icon == KomptaBrand.limuleIcon { LimuleMark(size: 18, showAura: false) }
            else { Image(systemName: icon) }
        }
        .tag(id)
    }
}
#endif
