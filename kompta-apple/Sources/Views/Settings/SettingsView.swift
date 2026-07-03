import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    @EnvironmentObject private var auth:  AuthManager
    @EnvironmentObject private var theme: CompanyTheme

    @AppStorage("api_base_url") private var apiURL = "https://kompta0.com/api"
    @AppStorage("appAppearance") private var appearanceRaw = AppAppearance.system.rawValue
    @AppStorage("kompta_setup_dismissed") private var setupDismissed = false
    @AppStorage("kompta_force_setup") private var forceSetup = false
    @AppStorage("kompta_force_tour") private var forceTour = false
    @AppStorage("notif_invoices")     private var notifInvoices    = true
    @AppStorage("notif_meetings")     private var notifMeetings     = true
    @AppStorage("notif_transactions") private var notifTransactions = true
    @AppStorage("notif_support")      private var notifSupport      = true
    @ObservedObject private var currency = CurrencyManager.shared
    @State private var showLogoutAlert = false
    @State private var avatarData: Data?
    @State private var showAvatarPicker = false
    @State private var uploadingAvatar = false
    @State private var loyaltyEnabled = false
    @State private var loyaltyPointsPer1000 = 1
    @State private var savingLoyalty = false

    private var isManager: Bool {
        ["super_admin", "admin_entreprise", "manager_entreprise"].contains(auth.currentUser?.role ?? "")
    }

    var body: some View {
        Form {
            // Profile
            Section {
                HStack(spacing: 14) {
                    Button { showAvatarPicker = true } label: {
                        ZStack(alignment: .bottomTrailing) {
                            if let avatarData, let img = avatarImage(avatarData) {
                                img.resizable().scaledToFill().frame(width: 56, height: 56).clipShape(Circle())
                            } else {
                                AvatarView(initials: auth.currentUser?.initials ?? "?", size: 56, color: theme.primary)
                            }
                            Image(systemName: uploadingAvatar ? "hourglass" : "camera.circle.fill")
                                .font(.system(size: 18)).symbolRenderingMode(.palette)
                                .foregroundStyle(.white, theme.primary).background(Circle().fill(.background))
                                .offset(x: 3, y: 3)
                        }
                    }
                    .buttonStyle(.plain).disabled(uploadingAvatar)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(auth.currentUser?.displayName ?? "—").font(.headline)
                        Text(auth.currentUser?.email ?? "—").font(.subheadline).foregroundStyle(.secondary)
                        Text(auth.currentUser?.role ?? "—")
                            .font(.caption.bold())
                            .padding(.horizontal, 8).padding(.vertical, 2)
                            .background(theme.primary.opacity(0.15))
                            .foregroundStyle(theme.primary)
                            .clipShape(Capsule())
                    }
                }
                .padding(.vertical, 4)
                NavigationLink {
                    MyProfileEditView()
                } label: {
                    Label("Mes informations", systemImage: "person.text.rectangle")
                }
            } header: { Text("Mon profil") } footer: {
                Text("Touchez la photo pour changer votre avatar.")
            }

            Section {
                NavigationLink {
                    SecurityView()
                } label: {
                    Label("Sécurité (2FA)", systemImage: "lock.shield")
                }
            } header: { Text("Sécurité") }

            // Company
            if let c = auth.company {
                Section("Entreprise") {
                    LabeledContent("Nom",      value: c.name)
                    LabeledContent("Pays",     value: c.country ?? "—")
                    LabeledContent("Secteur",  value: c.industry ?? "—")
                }
                if isManager {
                    Section {
                        Toggle("Activer les points de fidélité", isOn: $loyaltyEnabled)
                            .disabled(savingLoyalty)
                            .onChange(of: loyaltyEnabled) { _, _ in Task { await saveLoyalty() } }
                        Stepper(
                            "\(loyaltyPointsPer1000) point(s) par tranche de 1 000",
                            value: $loyaltyPointsPer1000,
                            in: 0...100
                        )
                        .disabled(!loyaltyEnabled || savingLoyalty)
                        .onChange(of: loyaltyPointsPer1000) { _, _ in Task { await saveLoyalty() } }
                    } header: {
                        Text("Fidélité clients")
                    } footer: {
                        Text("Les points sont crédités automatiquement quand une vente est liée à un client de votre fichier.")
                    }
                }
            }

            // Roles management (managers/admins)
            if isManager {
                Section("Équipe & accès") {
                    NavigationLink {
                        RolesManagementView(scope: "company", title: "Rôles & accès")
                    } label: {
                        Label("Rôles personnalisés", systemImage: "person.badge.shield.checkmark")
                    }
                }
                Section {
                    NavigationLink {
                        CollectionMethodsView()
                    } label: {
                        Label("Encaissement", systemImage: "creditcard.and.123")
                    }
                } header: {
                    Text("Paiements")
                } footer: {
                    Text("Méthodes par lesquelles vos clients vous paient (MoMo, espèces, virement, carte).")
                }
            }

            // Appearance
            Section("Apparence") {
                Picker(selection: $appearanceRaw) {
                    ForEach(AppAppearance.allCases, id: \.rawValue) { mode in
                        Label(mode.label, systemImage: mode.icon).tag(mode.rawValue)
                    }
                } label: {
                    Label("Thème", systemImage: "circle.lefthalf.filled")
                }
                Toggle(isOn: $theme.useLiquidGlass) {
                    Label("Liquid Glass (iOS 26+)", systemImage: "sparkles")
                }
                Toggle(isOn: $theme.useRoundedDesign) {
                    Label("Design arrondi", systemImage: "rectangle.roundedtop.fill")
                }
                ColorPicker(selection: $theme.primary, supportsOpacity: false) {
                    Label("Couleur principale", systemImage: "paintpalette")
                }
            }

            // Currency
            Section {
                Picker(selection: $currency.code) {
                    ForEach(CurrencyManager.supported) { c in
                        Text("\(c.code) — \(c.name)").tag(c.code)
                    }
                } label: {
                    Label("Devise d'affichage", systemImage: "coloncurrencysign.circle")
                }
                HStack {
                    Label("Aperçu", systemImage: "eye")
                    Spacer()
                    Text(fcfa(500)).foregroundStyle(.secondary)
                }
                if currency.approximate {
                    Label("Taux indicatif basé sur la parité FCFA/EUR — le taux temps réel sera utilisé dès qu'il est disponible.",
                          systemImage: "info.circle")
                        .font(.caption).foregroundStyle(.secondary)
                }
            } header: {
                Text("Devise & région")
            } footer: {
                Text("Tous les montants (ventes, factures, paie, stocks…) sont convertis depuis le FCFA vers la devise choisie.")
            }

            // Notifications
            Section("Notifications") {
                Toggle(isOn: $notifInvoices) {
                    Label("Factures non payées", systemImage: "doc.text.fill")
                }
                Toggle(isOn: $notifMeetings) {
                    Label("Réunions à venir", systemImage: "calendar.badge.clock")
                }
                Toggle(isOn: $notifTransactions) {
                    Label("Transactions importantes", systemImage: "arrow.down.circle.fill")
                }
                Toggle(isOn: $notifSupport) {
                    Label("Demandes de support", systemImage: "lifepreserver.fill")
                }
            }

            Section("Aide & visite") {
                Button { forceTour = true } label: {
                    Label("Revoir la visite guidée", systemImage: "sparkles")
                }
                .help("Relancer la présentation des fonctions de KOMPTA.")
                if auth.currentUser?.role == "admin_entreprise" {
                    Button {
                        setupDismissed = false
                        forceSetup = true
                    } label: {
                        Label("Configuration de l'entreprise", systemImage: "building.2.crop.circle")
                    }
                    .help("Reprendre l'assistant de configuration pas à pas du profil de l'entreprise.")
                }
            }

            // Advanced
            Section("Avancé") {
                VStack(alignment: .leading, spacing: 4) {
                    Text("URL de l'API").font(.caption).foregroundStyle(.secondary)
                    TextField("https://kompta0.com/api", text: $apiURL)
                        .font(.footnote.monospaced())
                        #if os(iOS)
                        .autocapitalization(.none)
                        .keyboardType(.URL)
                        #endif
                        .autocorrectionDisabled()
                }
            }

            // App info
            Section("À propos") {
                LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                LabeledContent("Build",   value: Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—")
                LabeledContent("Plateforme") {
                    #if os(iOS)
                    Text("iOS \(UIDevice.current.systemVersion)")
                    #else
                    Text("macOS")
                    #endif
                }
            }

            // Changer d'espace
            Section {
                NavigationLink {
                    WorkspaceSwitcherView()
                } label: {
                    Label("Changer d'espace de travail", systemImage: "square.grid.2x2")
                }
            } header: {
                Text("Espaces de travail")
            } footer: {
                Text("Accédez à votre entreprise ou à vos groupes & organisations depuis une seule interface.")
            }

            // Danger zone
            Section {
                Button(role: .destructive) { showLogoutAlert = true } label: {
                    Label("Se déconnecter", systemImage: "rectangle.portrait.and.arrow.right")
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Réglages")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.large)
        #endif
        .task {
            avatarData = try? await APIClient.shared.myAvatarData()
            loyaltyEnabled = auth.company?.loyalty_enabled ?? false
            loyaltyPointsPer1000 = auth.company?.loyalty_points_per_1000 ?? 1
        }
        .fileImporter(isPresented: $showAvatarPicker, allowedContentTypes: [.png, .jpeg, .image]) { result in
            Task { await handleAvatar(result) }
        }
        .alert("Se déconnecter ?", isPresented: $showLogoutAlert) {
            Button("Annuler", role: .cancel) {}
            Button("Déconnecter", role: .destructive) { auth.logout() }
        } message: {
            Text("Vous devrez vous reconnecter pour accéder à KOMPTA.")
        }
    }

    private func avatarImage(_ data: Data) -> Image? {
        #if os(macOS)
        return NSImage(data: data).map { Image(nsImage: $0) }
        #else
        return UIImage(data: data).map { Image(uiImage: $0) }
        #endif
    }
    private func handleAvatar(_ result: Result<URL, Error>) async {
        guard case .success(let url) = result else { return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { return }
        let ext = url.pathExtension.lowercased()
        let mime = ext == "png" ? "image/png" : (ext == "webp" ? "image/webp" : "image/jpeg")
        uploadingAvatar = true
        if (try? await APIClient.shared.uploadMyAvatar(data, fileName: url.lastPathComponent, mime: mime)) != nil {
            avatarData = data
        }
        uploadingAvatar = false
    }

    private func saveLoyalty() async {
        guard !savingLoyalty else { return }
        savingLoyalty = true
        var payload = CompanyUpdatePayload()
        payload.loyalty_enabled = loyaltyEnabled
        payload.loyalty_points_per_1000 = loyaltyPointsPer1000
        if let company = try? await APIClient.shared.updateCompany(payload) {
            auth.company = company
        }
        savingLoyalty = false
    }
}

// ============================================================================
//  Sélecteur d'espace de travail — entreprise ou groupe.
// ============================================================================

struct WorkspaceSwitcherView: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var groupsState = Loadable<[OrgGroup]>()
    @State private var companies: [CompanyMembership] = []
    @State private var companiesLoading = false
    @State private var switchingCompanyId: Int?
    @State private var showCreateSheet = false

    var body: some View {
        List {
            // Espaces entreprise — toutes les entreprises rattachées au même email.
            Section("Espace entreprise") {
                if companiesLoading {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else {
                    ForEach(companies) { membership in
                        Button {
                            switchTo(membership)
                        } label: {
                            HStack {
                                Label {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(membership.company_name).font(.headline)
                                        Text(membership.company_id == auth.company?.id ? "Entreprise active" : "Basculer sur cette entreprise")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                } icon: {
                                    Image(systemName: "building.2.fill")
                                        .foregroundStyle(theme.primary)
                                }
                                Spacer()
                                if switchingCompanyId == membership.company_id {
                                    ProgressView()
                                } else if membership.company_id == auth.company?.id {
                                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                                }
                            }
                        }
                        .disabled(switchingCompanyId != nil)
                        .buttonStyle(.plain)
                    }
                    Button {
                        showCreateSheet = true
                    } label: {
                        Label("Créer une nouvelle entreprise", systemImage: "plus.circle.fill")
                    }
                }
            }

            // Groupes & organisations
            Section("Groupes & organisations") {
                if groupsState.isLoading {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if let groups = groupsState.value, !groups.isEmpty {
                    ForEach(groups) { group in
                        NavigationLink {
                            GroupHubView(group: group)
                        } label: {
                            Label {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(group.name).font(.headline)
                                    HStack(spacing: 4) {
                                        Text(group.type.capitalized)
                                        Text("·").foregroundStyle(.tertiary)
                                        Text(group.city)
                                        if let count = group.member_count, count > 0 {
                                            Text("·").foregroundStyle(.tertiary)
                                            Label("\(count)", systemImage: "person.2.fill")
                                                .labelStyle(.titleAndIcon)
                                        }
                                    }
                                    .font(.caption).foregroundStyle(.secondary)
                                }
                            } icon: {
                                Image(systemName: "person.3.fill").foregroundStyle(.blue)
                            }
                        }
                    }
                } else if groupsState.value != nil {
                    Text("Aucun groupe rejoint pour l'instant.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Changer d'espace")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task {
            await groupsState.load { try await APIClient.shared.groups() }
            await loadCompanies()
        }
        .sheet(isPresented: $showCreateSheet) {
            CreateCompanySheet { payload in
                try await auth.createCompany(payload)
                await loadCompanies()
            }
        }
    }

    private func loadCompanies() async {
        companiesLoading = true
        companies = (try? await auth.myCompanies()) ?? []
        companiesLoading = false
    }

    private func switchTo(_ membership: CompanyMembership) {
        guard membership.company_id != auth.company?.id else { return }
        switchingCompanyId = membership.company_id
        Task {
            try? await auth.switchCompany(membership.company_id)
            switchingCompanyId = nil
        }
    }
}

// ============================================================================
//  Formulaire de création d'une nouvelle entreprise (multi-entreprise).
// ============================================================================

struct CreateCompanySheet: View {
    @Environment(\.dismiss) private var dismiss
    var onCreate: (CompanyCreatePayload) async throws -> Void

    @State private var companyName = ""
    @State private var legalName = ""
    @State private var industry = "Services"
    @State private var organizationType = "PME"
    @State private var country = "Congo"
    @State private var creating = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Entreprise") {
                    TextField("Nom de l'entreprise", text: $companyName)
                    TextField("Raison sociale", text: $legalName)
                    TextField("Secteur", text: $industry)
                    TextField("Type d'organisation", text: $organizationType)
                    TextField("Pays", text: $country)
                }
                if let errorMessage {
                    Text(errorMessage).font(.caption).foregroundStyle(.red)
                }
            }
            .navigationTitle("Nouvelle entreprise")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if creating {
                        ProgressView()
                    } else {
                        Button("Créer") { create() }
                            .disabled(companyName.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
        }
    }

    private func create() {
        creating = true
        errorMessage = nil
        Task {
            do {
                try await onCreate(CompanyCreatePayload(
                    company_name: companyName.trimmingCharacters(in: .whitespaces),
                    legal_name: legalName,
                    industry: industry,
                    organization_type: organizationType,
                    country: country
                ))
                creating = false
                dismiss()
            } catch {
                creating = false
                errorMessage = "Impossible de créer l'entreprise. Réessayez."
            }
        }
    }
}

// ============================================================================
//  Self-service profile editing — any user updates their own contact details.
// ============================================================================

struct MyProfileEditView: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var theme: CompanyTheme
    @Environment(\.dismiss) private var dismiss

    @State private var fullName = ""
    @State private var phone = ""
    @State private var address = ""
    @State private var saving = false
    @State private var saved = false
    @State private var errorMsg: String?

    var body: some View {
        Form {
            Section("Identité") {
                TextField("Nom complet", text: $fullName)
                LabeledContent("E-mail", value: auth.currentUser?.email ?? "—")
            }
            Section("Coordonnées") {
                TextField("Téléphone", text: $phone)
                    #if os(iOS)
                    .keyboardType(.phonePad)
                    #endif
                TextField("Adresse", text: $address, axis: .vertical).lineLimit(1...4)
            }
            if let cr = auth.currentUser?.custom_role {
                Section("Rôle d'accès") {
                    HStack {
                        Image(systemName: "shield.lefthalf.filled")
                            .foregroundStyle(Color(hex: cr.color) ?? theme.primary)
                        Text(cr.name)
                    }
                }
            }
            if let city = auth.currentUser?.last_login_city, !city.isEmpty {
                Section("Dernière connexion") {
                    LabeledContent("Localisation", value: city)
                    if let ip = auth.currentUser?.last_login_ip, !ip.isEmpty {
                        LabeledContent("Adresse IP", value: ip)
                    }
                }
            }
            if let errorMsg { Section { Text(errorMsg).foregroundStyle(.red).font(.caption) } }
            Section {
                KomptaButton(label: saved ? "Enregistré ✓" : "Enregistrer mes informations",
                             icon: "checkmark", isLoading: saving) { await save() }
            }
        }
        .navigationTitle("Mes informations")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .onAppear {
            fullName = auth.currentUser?.full_name ?? ""
            phone = auth.currentUser?.phone ?? ""
            address = auth.currentUser?.address ?? ""
        }
    }

    private func save() async {
        saving = true; errorMsg = nil; saved = false
        do {
            try await APIClient.shared.updateMyProfile(fullName: fullName, phone: phone, address: address)
            await auth.refreshUser()
            saved = true
        } catch {
            errorMsg = (error as? LocalizedError)?.errorDescription ?? "Échec de l'enregistrement"
        }
        saving = false
    }
}
