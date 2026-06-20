import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    @EnvironmentObject private var auth:  AuthManager
    @EnvironmentObject private var theme: CompanyTheme

    @AppStorage("api_base_url") private var apiURL = "https://kompta0.com/api"
    @AppStorage("notif_invoices")     private var notifInvoices    = true
    @AppStorage("notif_meetings")     private var notifMeetings     = true
    @AppStorage("notif_transactions") private var notifTransactions = true
    @AppStorage("notif_support")      private var notifSupport      = true
    @AppStorage("appAppearance")      private var appearanceRaw = AppAppearance.system.rawValue
    @ObservedObject private var currency = CurrencyManager.shared
    @State private var showLogoutAlert = false
    @State private var avatarData: Data?
    @State private var showAvatarPicker = false
    @State private var uploadingAvatar = false

    private var isManager: Bool {
        ["super_admin", "admin_entreprise", "manager_entreprise"].contains(auth.currentUser?.role ?? "")
    }

    private var appearance: Binding<AppAppearance> {
        Binding(
            get: { AppAppearance(rawValue: appearanceRaw) ?? .system },
            set: { appearanceRaw = $0.rawValue }
        )
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
                Picker(selection: appearance) {
                    ForEach(AppAppearance.allCases) { a in
                        Label(a.label, systemImage: a.icon).tag(a)
                    }
                } label: {
                    Label("Thème", systemImage: "circle.lefthalf.filled")
                }
                .pickerStyle(.segmented)
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
        .task { avatarData = try? await APIClient.shared.myAvatarData() }
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
