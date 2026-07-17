import SwiftUI

// ============================================================================
//  ModuleHub — the central registry of every app module + the grid screen
//  that lets iOS users reach them (macOS uses the sidebar). New modules are
//  registered here once and appear on both platforms automatically.
// ============================================================================

struct AppModule: Identifiable {
    let id: String
    let title: String
    let icon: String
    let tint: Color
    let section: String
    let make: () -> AnyView

    init<V: View>(_ id: String, _ title: String, icon: String, tint: Color,
                  section: String, @ViewBuilder make: @escaping () -> V) {
        self.id = id; self.title = title; self.icon = icon; self.tint = tint
        self.section = section; self.make = { AnyView(make()) }
    }
}

enum ModuleRegistry {
    /// Every module reachable from the hub / sidebar, in display order.
    static let all: [AppModule] = [
        // ── Entreprise & pilotage ───────────────────────────────────────
        AppModule("company", "Entreprise", icon: "building.2.fill",
                  tint: .teal, section: "Entreprise") { CompanyProfileView() },
        AppModule("reports", "Rapports", icon: "chart.bar.doc.horizontal.fill",
                  tint: .indigo, section: "Pilotage") { ReportsHubNativeView() },
        AppModule("analytics", "Analytique", icon: "chart.line.uptrend.xyaxis",
                  tint: .blue, section: "Pilotage") { CompanyAnalyticsNativeView() },
        AppModule("audit", "Audit entreprise", icon: "doc.text.magnifyingglass",
                  tint: .purple, section: "Pilotage") { CompanyAuditLogsView() },
        // ── Ventes & clients ────────────────────────────────────────────
        AppModule("clients", "Clients", icon: "person.crop.circle.badge.checkmark",
                  tint: .blue, section: "Ventes & clients") { ClientsView() },
        AppModule("crm", "CRM", icon: "target",
                  tint: .pink, section: "Ventes & clients") { CrmView() },
        AppModule("billing", "Facturation", icon: "doc.text.fill",
                  tint: .indigo, section: "Ventes & clients") { BillingView() },
        AppModule("inventory", "Inventaire", icon: "shippingbox.fill",
                  tint: .orange, section: "Ventes & clients") { InventoryView() },
        AppModule("purchases", "Achats", icon: "cart.badge.plus",
                  tint: .brown, section: "Ventes & clients") { PurchasesView() },
        // ── Finance ─────────────────────────────────────────────────────
        AppModule("transactions", "Transactions", icon: "arrow.left.arrow.right",
                  tint: .teal, section: "Finance") { TransactionsView() },
        AppModule("bank_reconciliation", "Rapprochement bancaire", icon: "arrow.triangle.2.circlepath",
                  tint: .teal, section: "Finance") { BankReconciliationView() },
        AppModule("budget", "Budget", icon: "chart.pie.fill",
                  tint: .purple, section: "Finance") { BudgetView() },
        AppModule("investments", "Investissements", icon: "chart.line.uptrend.xyaxis",
                  tint: .mint, section: "Finance") { InvestmentsView() },
        AppModule("payment_accounts", "Comptes de paiement", icon: "creditcard.fill",
                  tint: .cyan, section: "Finance") { PaymentAccountsView() },
        AppModule("accounting", "Comptabilité", icon: "building.columns.fill",
                  tint: .green, section: "Finance") { AccountingFinanceNativeView() },
        // ── Intelligence ────────────────────────────────────────────────
        AppModule("teras", "Intelligence Teras", icon: KomptaBrand.limuleIcon,
                  tint: .indigo, section: "Intelligence") { TerasView() },
        AppModule("reports_teras", "Rapport TERAS", icon: "shield.checkered",
                  tint: .red, section: "Intelligence") { ReportsTerasNativeView() },
        AppModule("declarations", "Déclarations", icon: "doc.badge.clock.fill",
                  tint: .brown, section: "Intelligence") { DeclarationsView() },
        AppModule("legislation", "Législation", icon: "books.vertical.fill",
                  tint: .mint, section: "Intelligence") { LegislationNativeView() },
        AppModule("fiscal", "Agenda fiscal", icon: "calendar.badge.exclamationmark",
                  tint: .orange, section: "Intelligence") { AgendaFiscalNativeView() },
        // ── Collaboration ───────────────────────────────────────────────
        AppModule("work", "Travail", icon: "briefcase.fill",
                  tint: .teal, section: "Collaboration") { WorkHubView() },
        AppModule("tasks", "Tâches", icon: "checklist",
                  tint: .pink, section: "Collaboration") { TasksKanbanView() },
        AppModule("projects", "Projets", icon: "folder.fill.badge.gearshape",
                  tint: .indigo, section: "Collaboration") { ProjectsNativeView() },
        AppModule("calendar", "Calendrier", icon: "calendar",
                  tint: .purple, section: "Collaboration") { CompanyCalendarView() },
        AppModule("chat", "Canaux", icon: "bubble.left.and.bubble.right.fill",
                  tint: .blue, section: "Collaboration") { ChatChannelsView() },
        AppModule("meetings", "Réunions", icon: "calendar.badge.clock",
                  tint: .indigo, section: "Collaboration") { MeetingsView() },
        AppModule("notes", "Notes", icon: "note.text",
                  tint: .yellow, section: "Collaboration") { NotesView() },
        AppModule("documents", "Documents", icon: "doc.on.doc.fill",
                  tint: .gray, section: "Collaboration") { DocumentsView() },
        // ── Groupes & Tontines ──────────────────────────────────────────
        AppModule("groups", "Groupes & Tontines", icon: "person.3.fill",
                  tint: .indigo, section: "Groupes & Tontines") { GroupsListView() },
        // ── Ressources humaines ─────────────────────────────────────────
        AppModule("hr", "Employés", icon: "person.2.fill",
                  tint: .green, section: "Ressources humaines") { HRView() },
        AppModule("payroll", "Paie", icon: "banknote.fill",
                  tint: .green, section: "Ressources humaines") { PayrollView() },
        // ── Limule & support ────────────────────────────────────────────
        AppModule("ai_writing", "Studio Limule", icon: KomptaBrand.limuleIcon,
                  tint: KomptaBrand.limuleBlue, section: "Limule & support") { AIWritingView() },
        AppModule("help", "Aide & support", icon: "lifepreserver",
                  tint: .red, section: "Limule & support") { HelpCenterView() },
        AppModule("safe_mode", "Safe Mode", icon: "lifepreserver.fill",
                  tint: .orange, section: "Limule & support") { SafeModeNativeView() },
    ]

    static var sections: [String] {
        var seen = Set<String>(); var order = [String]()
        for m in all where !seen.contains(m.section) { seen.insert(m.section); order.append(m.section) }
        return order
    }
    static func modules(in section: String) -> [AppModule] { all.filter { $0.section == section } }

    /// Modules this role is allowed to see, in registry order. `super_admin`
    /// never reaches this grid at all (dedicated SuperAdminShell instead),
    /// but is included here defensively in case of a transient render.
    static func visibleModules(for user: KomptaUser?) -> [AppModule] {
        all.filter { RolePermissions.canAccess(user: user, moduleId: $0.id) }
    }
    static func visibleSections(for user: KomptaUser?) -> [String] {
        var seen = Set<String>(); var order = [String]()
        for m in visibleModules(for: user) where !seen.contains(m.section) { seen.insert(m.section); order.append(m.section) }
        return order
    }
    static func visibleModules(in section: String, for user: KomptaUser?) -> [AppModule] {
        visibleModules(for: user).filter { $0.section == section }
    }
}

// ============================================================================
//  RolePermissions — mirrors the web app's ROLE_ROUTES table (Shell.tsx).
//  Each non-admin role only ever sees a subset of modules; "super_admin" and
//  "admin_entreprise" have unrestricted access ("*"). Module ids below match
//  ModuleRegistry.all's `id` field, not the web app's URL paths directly, but
//  the *coverage* mirrors it 1:1 (groups stays ungated for everyone — same as
//  the web app's GroupsProtectedRoute, which performs no role check).
// ============================================================================

enum RolePermissions {
    private static let unrestricted: Set<String> = ["super_admin", "admin_entreprise"]

    /// Module ids each role may see, beyond the universally-available ones.
    private static let table: [String: Set<String>] = [
        "manager_entreprise": [
            "company", "hr", "documents", "payroll", "billing", "clients", "crm", "pos", "inventory",
            "work", "tasks", "reports", "analytics", "fiscal", "teras", "reports_teras", "ai_writing",
            "declarations", "legislation", "accounting", "projects", "investments",
            "budget", "transactions", "bank_reconciliation", "audit", "payment_accounts", "safe_mode",
        ],
        "comptable": [
            "accounting", "billing", "clients", "crm", "reports", "analytics", "fiscal", "teras", "reports_teras",
            "declarations", "legislation", "ai_writing", "documents", "investments",
            "budget", "transactions", "bank_reconciliation", "payment_accounts",
        ],
        "rh_entreprise": ["hr", "documents", "payroll", "reports", "ai_writing", "declarations"],
        "responsable_pos": ["pos", "inventory", "billing", "clients", "crm", "work", "tasks", "reports", "transactions"],
        "caissier_pos": ["pos", "inventory"],
        "employe": ["work", "tasks"],
        "membre_groupe": ["documents", "investments", "projects", "work", "tasks", "ai_writing"],
    ]

    /// Available to literally every authenticated non-super_admin role —
    /// matches the routes every single ROLE_ROUTES entry in the web app includes,
    /// plus "settings" (kept universal in the native app since it's also where
    /// "Se déconnecter" lives — the web exposes logout outside RBAC entirely,
    /// via the sidebar footer, regardless of which role is signed in).
    private static let universal: Set<String> = ["dashboard", "groups", "chat", "calendar", "meetings", "notes", "help", "limule", "settings", "ai_writing", "safe_mode"]

    /// Clé de permission (catalogue rôles) correspondant à un module. `nil` =
    /// module universel toujours visible (collaboration, support, paramètres).
    /// Quelques modules partagent une clé (ex. reports_teras → teras).
    private static func permissionKey(for moduleId: String) -> String? {
        switch moduleId {
        case "payment_accounts":     return "transactions"
        case "bank_reconciliation":  return "transactions"
        case "reports_teras":        return "teras"
        case "work":                 return "tasks"
        case "crm":                  return "clients"
        case "dashboard", "groups", "chat", "calendar", "meetings",
             "notes", "help", "limule", "settings", "ai_writing", "safe_mode":
            return nil
        default:                 return moduleId   // company, hr, billing, pos, …
        }
    }

    /// Gating par utilisateur : un rôle personnalisé (permissions non vides)
    /// SURCLASSE le rôle de base — c'est ce qui rend les restrictions effectives.
    /// Sans rôle personnalisé, on retombe sur la table par rôle (comportement web).
    static func canAccess(user: KomptaUser?, moduleId: String) -> Bool {
        guard let user else { return false }
        let role = user.role
        if moduleId == "admin" { return role == "super_admin" }
        if unrestricted.contains(role) { return true }

        // Rôle personnalisé scope entreprise → allowlist par permissions.
        let perms = Set(user.permissions ?? [])
        if user.custom_role?.scope == "company", !perms.isEmpty {
            if universal.contains(moduleId) { return true }
            guard let key = permissionKey(for: moduleId) else { return true }
            return perms.contains(key)
        }

        // Fallback : table par rôle de base (inchangé).
        if universal.contains(moduleId) { return true }
        let allowed = table[role] ?? table["employe"] ?? []
        return allowed.contains(moduleId)
    }
}

// MARK: - iOS hub grid

struct ModuleHubView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var ent: EntitlementsManager
    @State private var lockedModuleTitle: String?
    @State private var showSubscriptionPurchase = false
    private let cols = [GridItem(.adaptive(minimum: 150), spacing: 14)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if ent.showTrialBanner {
                    TrialBanner(text: ent.trialBannerText, critical: ent.trialBannerIsCritical) {
                        showSubscriptionPurchase = true
                    }
                }
                ForEach(ModuleRegistry.visibleSections(for: auth.currentUser), id: \.self) { section in
                    VStack(alignment: .leading, spacing: 12) {
                        Text(section)
                            .font(.headline)
                            .padding(.horizontal, 4)
                        LazyVGrid(columns: cols, spacing: 14) {
                            ForEach(ModuleRegistry.visibleModules(in: section, for: auth.currentUser)) { m in
                                if ent.isLocked(moduleId: m.id) {
                                    Button { lockedModuleTitle = m.title } label: { ModuleTile(module: m, locked: true) }
                                        .buttonStyle(.plain)
                                } else {
                                    NavigationLink { m.make() } label: { ModuleTile(module: m) }
                                        .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
            }
            .padding()
        }
        .alert("Fonctionnalité non incluse", isPresented: Binding(get: { lockedModuleTitle != nil }, set: { if !$0 { lockedModuleTitle = nil } })) {
            Button("Compris", role: .cancel) { lockedModuleTitle = nil }
        } message: {
            Text("« \(lockedModuleTitle ?? "") » n'est pas inclus dans votre offre. Passez à une offre supérieure dans Réglages → Abonnement pour le débloquer.")
        }
        .navigationTitle("Modules")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.large)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) { NotificationBell() }
        }
        #if os(iOS)
        .sheet(isPresented: $showSubscriptionPurchase) {
            NavigationStack { SubscriptionPurchaseView() }
        }
        #endif
    }
}

struct TrialBanner: View {
    let text: String
    let critical: Bool
    var onTap: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "lock.fill")
            Text(text).font(.footnote.weight(.medium)).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            if onTap != nil {
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background((critical ? Color.red : Color.orange).opacity(0.15), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .foregroundStyle(critical ? Color.red : Color.orange)
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .onTapGesture { onTap?() }
    }
}

struct ModuleTile: View {
    let module: AppModule
    var locked: Bool = false
    var body: some View {
        GlassCard(padding: 16, cornerRadius: 18) {
            VStack(alignment: .leading, spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(module.tint.opacity(0.15))
                        .frame(width: 44, height: 44)
                    BrandedIcon(
                        name: module.icon,
                        tint: module.tint,
                        size: module.icon == KomptaBrand.limuleIcon ? 34 : 22
                    )
                }
                HStack(spacing: 4) {
                    Text(module.title).font(.subheadline.bold())
                    if locked {
                        Spacer(minLength: 0)
                        Image(systemName: "lock.fill").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .opacity(locked ? 0.55 : 1)
    }
}

// ============================================================================
//  Shared async-state scaffolding used by every module screen.
// ============================================================================

/// A tiny load-state machine so each screen stays terse and consistent.
@MainActor
final class Loadable<T>: ObservableObject {
    @Published var value: T?
    @Published var isLoading = false
    @Published var error: String?
    /// Code HTTP de la dernière erreur, quand connu — 402 (hors offre) et 403
    /// (permission refusée) déclenchent LimuleRestrictedView au lieu de
    /// l'erreur générique dans AsyncList.
    @Published var errorCode: Int?

    func load(_ op: @escaping () async throws -> T) async {
        guard !isLoading else { return }
        isLoading = true; error = nil; errorCode = nil
        do { value = try await op() }
        catch {
            self.error = Loadable.friendlyMessage(for: error)
            self.errorCode = (error as? APIError)?.httpStatusCode
        }
        isLoading = false
    }

    /// Turns a raw thrown error into a message safe to show end users.
    /// `DecodingError` in particular carries Foundation's cryptic default text
    /// ("The data couldn't be read because it is missing.") which isn't
    /// actionable for a non-technical user — so it's replaced with a friendly
    /// French message while the technical detail is still logged for debugging
    /// (visible in the Xcode console / device logs).
    static func friendlyMessage(for error: Error) -> String {
        if let decodingError = error as? DecodingError {
            #if DEBUG
            print("[Loadable] DecodingError: \(decodingError)")
            #endif
            return "Un problème est survenu lors du chargement des données. Contactez le support si le problème persiste."
        }
        return (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
}

/// Standard loading / error / empty wrapper around list content.
struct AsyncList<T, Content: View>: View {
    @ObservedObject var state: Loadable<[T]>
    let emptyTitle: String
    let emptyIcon: String
    let reload: () async -> Void
    @ViewBuilder let content: ([T]) -> Content

    var body: some View {
        Group {
            if let items = state.value {
                if items.isEmpty {
                    ContentUnavailableView(emptyTitle, systemImage: emptyIcon)
                } else {
                    content(items)
                }
            } else if state.isLoading {
                List(0..<6, id: \.self) { _ in
                    ShimmerBox(height: 46, cornerRadius: 10).padding(.vertical, 4)
                }
                #if os(iOS)
                .listStyle(.insetGrouped)
                #endif
            } else if let err = state.error {
                if let kind = LimuleRestrictedView.Kind(httpStatusCode: state.errorCode) {
                    LimuleRestrictedView(kind: kind, detail: err)
                } else {
                    ContentUnavailableView {
                        Label("Erreur", systemImage: "exclamationmark.triangle.fill")
                    } description: {
                        Text(err)
                    } actions: {
                        Button("Réessayer") { Task { await reload() } }
                    }
                }
            } else {
                // Initial state (task not yet fired or was cancelled) — trigger reload.
                Color.clear.onAppear { Task { await reload() } }
            }
        }
    }
}
