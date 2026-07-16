import SwiftUI
import UniformTypeIdentifiers

// ============================================================================
//  Assistant de configuration de l'entreprise (post-connexion).
//  Complète le profil entreprise pas à pas ; chaque étape persiste ses champs
//  via PATCH /company/profile, donc la progression est sauvegardée côté serveur.
//  Présenté à la 1re connexion d'un admin d'entreprise au profil incomplet,
//  passable et relançable depuis Réglages. Miroir natif de l'assistant web.
// ============================================================================

/// Brouillon mutable des champs éditables de l'entreprise.
struct CompanyDraft {
    var name = "", legalName = "", industry = "", organizationType = ""
    var country = "", city = "", address = ""
    var legalForm = "", rccm = "", niu = "", cnss = "", patente = "", taxRegime = ""
    var shareCapital = "", foundedDate = ""
    var phone = "", email = "", website = ""
    var managerName = "", managerTitle = ""
    var bankName = "", bankAccount = ""
    var primaryColor = "#047857", accentColor = "#065f46"
    var cashThreshold = ""   // en FCFA (unités)

    init() {}
    init(_ c: KomptaCompany) {
        name = c.name
        legalName = c.legal_name ?? ""
        industry = c.industry ?? ""
        organizationType = c.organization_type ?? ""
        country = c.country ?? ""
        city = c.city ?? ""
        address = c.address ?? ""
        legalForm = c.legal_form ?? ""
        rccm = c.rccm ?? ""
        niu = c.niu ?? ""
        cnss = c.cnss_number ?? ""
        patente = c.patente_number ?? ""
        taxRegime = c.tax_regime ?? ""
        shareCapital = c.share_capital ?? ""
        foundedDate = c.founded_date ?? ""
        phone = c.phone ?? ""
        email = c.email ?? ""
        website = c.website ?? ""
        managerName = c.manager_name ?? ""
        managerTitle = c.manager_title ?? ""
        bankName = c.bank_name ?? ""
        bankAccount = c.bank_account ?? ""
        primaryColor = c.primary_color ?? "#047857"
        accentColor = c.accent_color ?? "#065f46"
        if let cents = c.cash_low_threshold_cents { cashThreshold = String(cents / 100) }
    }
}

private enum SetupKind { case intro, form, logo, info, recap }

private struct SetupStep: Identifiable {
    let id = UUID()
    let key: String
    let title: String
    let subtitle: String
    let kind: SetupKind
}

private let setupSteps: [SetupStep] = [
    .init(key: "welcome", title: "Bienvenue dans KOMPTA", subtitle: "Configurons votre entreprise en quelques étapes. Chaque réponse est enregistrée au fur et à mesure — vous pouvez vous arrêter et reprendre quand vous voulez.", kind: .intro),
    .init(key: "org", title: "Type d'organisation", subtitle: "Quel type de structure gérez-vous ?", kind: .form),
    .init(key: "name", title: "Nom de l'entreprise", subtitle: "Le nom sous lequel vous opérez.", kind: .form),
    .init(key: "legalForm", title: "Forme juridique", subtitle: "La forme légale de votre structure.", kind: .form),
    .init(key: "location", title: "Localisation", subtitle: "Où votre entreprise est-elle établie ?", kind: .form),
    .init(key: "address", title: "Adresse", subtitle: "L'adresse physique de votre siège.", kind: .form),
    .init(key: "rccm", title: "Registre du commerce (RCCM)", subtitle: "Votre numéro d'immatriculation au registre du commerce.", kind: .form),
    .init(key: "niu", title: "Identifiant fiscal (NIU)", subtitle: "Votre numéro d'identification unique fiscal.", kind: .form),
    .init(key: "cnss", title: "Sécurité sociale (CNSS)", subtitle: "Votre numéro d'employeur auprès de la caisse sociale.", kind: .form),
    .init(key: "patente", title: "Patente", subtitle: "Votre numéro de patente / licence d'activité.", kind: .form),
    .init(key: "tax", title: "Régime fiscal", subtitle: "Sous quel régime votre entreprise est-elle imposée ?", kind: .form),
    .init(key: "capital", title: "Capital & création", subtitle: "Capital social et date de création (utiles pour vos documents légaux).", kind: .form),
    .init(key: "contact", title: "Coordonnées", subtitle: "Comment vos clients et partenaires vous joignent.", kind: .form),
    .init(key: "website", title: "Site web", subtitle: "Votre présence en ligne (optionnel).", kind: .form),
    .init(key: "manager", title: "Responsable", subtitle: "Le dirigeant ou gérant de l'entreprise.", kind: .form),
    .init(key: "bank", title: "Coordonnées bancaires", subtitle: "Pour vos factures et rapprochements.", kind: .form),
    .init(key: "threshold", title: "Alerte trésorerie", subtitle: "Limule vous alerte quand votre trésorerie passe sous ce seuil.", kind: .form),
    .init(key: "colors", title: "Couleurs de marque", subtitle: "Personnalisez l'apparence de votre espace et de vos documents.", kind: .form),
    .init(key: "logo", title: "Logo de l'entreprise", subtitle: "Il apparaîtra sur vos factures, devis et rapports. (PNG, JPEG ou WebP)", kind: .logo),
    .init(key: "payments", title: "Méthodes d'encaissement", subtitle: "Vous pourrez configurer Mobile Money, espèces, virement et carte dans Réglages → Encaissement.", kind: .info),
    .init(key: "team", title: "Votre équipe", subtitle: "Ajoutez vos employés et générez leurs accès depuis Modules → Employés.", kind: .info),
    .init(key: "catalog", title: "Vos produits / services", subtitle: "Constituez votre catalogue pour la caisse et la facturation depuis Modules → Inventaire.", kind: .info),
    .init(key: "recap", title: "Configuration prête !", subtitle: "Votre entreprise est configurée. Vous pourrez compléter ou modifier ces informations à tout moment depuis Réglages.", kind: .recap),
]

struct CompanySetupWizard: View {
    let onClose: () -> Void

    @EnvironmentObject private var theme: CompanyTheme
    @State private var idx = 0
    @State private var draft = CompanyDraft()
    @State private var completion = 0
    @State private var showLogoPicker = false
    @State private var logoPicked = false
    @State private var logoError: String?

    private var step: SetupStep { setupSteps[idx] }
    private var isLast: Bool { idx == setupSteps.count - 1 }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView { content.padding(20) }
            footer
        }
        .background(Color.wizardBg.ignoresSafeArea())
        .task { await loadCompany() }
        .fileImporter(isPresented: $showLogoPicker, allowedContentTypes: [.png, .jpeg, .image]) { result in
            if case .success(let url) = result { Task { await uploadLogo(url) } }
        }
    }

    // MARK: Header
    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 14).fill(.white.opacity(0.18)).frame(width: 44, height: 44)
                Image(systemName: step.kind == .intro || step.kind == .recap ? "sparkles" : "building.2.fill")
                    .foregroundStyle(.white)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text("Configuration · étape \(idx + 1)/\(setupSteps.count)")
                    .font(.caption2.bold()).foregroundStyle(.white.opacity(0.75))
                Text(step.title).font(.title3.bold()).foregroundStyle(.white)
            }
            Spacer(minLength: 0)
            Button { onClose() } label: { Image(systemName: "xmark").foregroundStyle(.white.opacity(0.85)).accessibilityLabel("Fermer") }
                .buttonStyle(.plain)
        }
        .padding(.horizontal, 20).padding(.top, 22).padding(.bottom, 18)
        .background(LinearGradient(colors: [theme.primary, theme.secondary], startPoint: .topLeading, endPoint: .bottomTrailing))
    }

    // MARK: Content
    @ViewBuilder private var content: some View {
        Text(step.subtitle).font(.subheadline).foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)

        switch step.kind {
        case .intro: EmptyView()
        case .form:  formFields.padding(.top, 14)
        case .logo:
            Button { showLogoPicker = true } label: {
                Label(logoPicked ? "Logo importé ✓" : "Importer un logo", systemImage: "square.and.arrow.up")
                    .frame(maxWidth: .infinity).padding(.vertical, 16)
            }
            .buttonStyle(.bordered).tint(theme.primary).padding(.top, 14)
            if let logoError {
                Text(logoError).font(.caption).foregroundStyle(.red).padding(.top, 6)
            }
        case .info:
            Image(systemName: "info.circle").font(.largeTitle).foregroundStyle(theme.primary.opacity(0.7))
                .frame(maxWidth: .infinity).padding(.top, 18)
        case .recap:
            VStack(spacing: 10) {
                HStack { Image(systemName: "checkmark.seal.fill").foregroundStyle(.green); Text("Profil complété à \(completion)%").font(.subheadline.bold()) }
                ProgressView(value: Double(completion), total: 100).tint(.green)
            }
            .padding(16).background(Color.green.opacity(0.1), in: RoundedRectangle(cornerRadius: 16)).padding(.top, 14)
        }

        ProgressView(value: Double(idx + 1), total: Double(setupSteps.count))
            .tint(theme.primary).padding(.top, 18)
    }

    @ViewBuilder private var formFields: some View {
        switch step.key {
        case "org":
            field("Type d'organisation", $draft.organizationType, "PME, Association, Coopérative…")
            field("Secteur d'activité", $draft.industry, "Commerce et services")
        case "name":
            field("Nom commercial", $draft.name, "ADANSONIA")
            field("Raison sociale", $draft.legalName, "ADANSONIA SARL")
        case "legalForm":
            field("Forme juridique", $draft.legalForm, "SARL, SA, SAS, Ets, Association…")
        case "location":
            field("Pays", $draft.country, "Congo")
            field("Ville", $draft.city, "Brazzaville")
        case "address":
            field("Adresse complète", $draft.address, "123 Avenue de la Paix")
        case "rccm":
            field("N° RCCM", $draft.rccm, "CG-BZV-01-2024-B12-00001")
        case "niu":
            field("N° NIU / NIF", $draft.niu, "M2024000000000A")
        case "cnss":
            field("N° CNSS", $draft.cnss, "Numéro employeur")
        case "patente":
            field("N° de patente", $draft.patente, "Numéro de patente")
        case "tax":
            field("Régime fiscal", $draft.taxRegime, "Réel, Forfait, TPE…")
        case "capital":
            field("Capital social", $draft.shareCapital, "1 000 000 FCFA")
            field("Date de création (AAAA-MM-JJ)", $draft.foundedDate, "2024-01-15")
        case "contact":
            field("Téléphone", $draft.phone, "+242 06 000 0000", kind: .phone)
            field("Email", $draft.email, "contact@entreprise.com", kind: .email)
        case "website":
            field("Site web", $draft.website, "https://entreprise.com")
        case "manager":
            field("Nom du responsable", $draft.managerName, "Nom complet")
            field("Fonction", $draft.managerTitle, "Gérant, Directeur Général…")
        case "bank":
            field("Banque", $draft.bankName, "Nom de la banque")
            field("N° de compte / IBAN", $draft.bankAccount, "Numéro de compte")
        case "threshold":
            field("Seuil d'alerte (FCFA)", $draft.cashThreshold, "50000", kind: .number)
        case "colors":
            colorRow("Couleur principale", $draft.primaryColor)
            colorRow("Couleur secondaire", $draft.accentColor)
        default: EmptyView()
        }
    }

    private func field(_ label: String, _ binding: Binding<String>, _ placeholder: String, kind: WizardFieldKind = .text) -> some View {
        WizardField(label: label, placeholder: placeholder, text: binding, kind: kind)
    }

    private func colorRow(_ label: String, _ binding: Binding<String>) -> some View {
        HStack {
            Text(label).font(.subheadline)
            Spacer()
            ColorPicker("", selection: Binding(
                get: { Color(hex: binding.wrappedValue) ?? theme.primary },
                set: { binding.wrappedValue = $0.hexString }
            ), supportsOpacity: false).labelsHidden()
        }
        .padding(12).background(Color.wizardField, in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: Footer
    private var footer: some View {
        HStack {
            Button("Terminer plus tard") { onClose() }
                .font(.caption.bold()).foregroundStyle(.secondary).buttonStyle(.plain)
            Spacer()
            if idx > 0 {
                Button { withAnimation { idx -= 1 } } label: { Label("Précédent", systemImage: "chevron.left") }
                    .buttonStyle(.bordered)
            }
            Button { next() } label: {
                HStack(spacing: 6) {
                    Text(isLast ? "Terminer" : "Suivant")
                    if !isLast { Image(systemName: "chevron.right") }
                }
            }
            .buttonStyle(.borderedProminent).tint(theme.primary)
        }
        .padding(.horizontal, 20).padding(.vertical, 14)
        .background(.regularMaterial)
    }

    // MARK: Actions
    private func loadCompany() async {
        if let c = try? await APIClient.shared.company() {
            draft = CompanyDraft(c)
            completion = c.completion_score ?? 0
            logoPicked = c.has_logo ?? false
        }
    }

    private func uploadLogo(_ url: URL) async {
        logoError = nil
        let needsStop = url.startAccessingSecurityScopedResource()
        defer { if needsStop { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else {
            logoError = "Lecture du fichier impossible"
            return
        }
        let ext = url.pathExtension.lowercased()
        let mime: String
        switch ext {
        case "png": mime = "image/png"
        case "webp": mime = "image/webp"
        case "pdf": mime = "application/pdf"
        default: mime = "image/jpeg"
        }
        do {
            _ = try await APIClient.shared.uploadCompanyLogo(data, fileName: url.lastPathComponent, mime: mime)
            logoPicked = true
        } catch {
            logoError = (error as? LocalizedError)?.errorDescription ?? "Échec de l'envoi du logo"
        }
    }

    /// Avance IMMÉDIATEMENT (UI synchrone, indépendante du réseau) et persiste
    /// l'étape quittée en arrière-plan. Évite tout blocage du bouton « Suivant »
    /// sur appareil réel si une requête réseau est lente ou échoue.
    private func next() {
        let leaving = step
        if isLast {
            persistInBackground(leaving)
            onClose()
        } else {
            withAnimation { idx += 1 }
            persistInBackground(leaving)
        }
    }

    /// Persiste les champs de l'étape donnée sans bloquer la navigation.
    private func persistInBackground(_ s: SetupStep) {
        guard let p = payload(for: s) else { return }
        Task { @MainActor in
            if let updated = try? await APIClient.shared.updateCompany(p) {
                completion = updated.completion_score ?? completion
            }
        }
    }

    /// Construit la charge utile des champs d'une étape de formulaire (nil sinon).
    private func payload(for s: SetupStep) -> CompanyUpdatePayload? {
        guard s.kind == .form else { return nil }
        var p = CompanyUpdatePayload()
        switch s.key {
        case "org": p.organization_type = draft.organizationType; p.industry = draft.industry
        case "name": p.name = draft.name; p.legal_name = draft.legalName
        case "legalForm": p.legal_form = draft.legalForm
        case "location": p.country = draft.country; p.city = draft.city
        case "address": p.address = draft.address
        case "rccm": p.rccm = draft.rccm
        case "niu": p.niu = draft.niu
        case "cnss": p.cnss_number = draft.cnss
        case "patente": p.patente_number = draft.patente
        case "tax": p.tax_regime = draft.taxRegime
        case "capital": p.share_capital = draft.shareCapital; p.founded_date = draft.foundedDate
        case "contact": p.phone = draft.phone; p.email = draft.email
        case "website": p.website = draft.website
        case "manager": p.manager_name = draft.managerName; p.manager_title = draft.managerTitle
        case "bank": p.bank_name = draft.bankName; p.bank_account = draft.bankAccount
        case "threshold": p.cash_low_threshold_cents = Int(draft.cashThreshold).map { $0 * 100 }
        case "colors": p.primary_color = draft.primaryColor; p.accent_color = draft.accentColor
        default: return nil
        }
        return p
    }
}

enum WizardFieldKind { case text, email, phone, number }

private struct WizardField: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    var kind: WizardFieldKind = .text

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased()).font(.caption2.bold()).foregroundStyle(.secondary)
            TextField(placeholder, text: $text)
                .textFieldStyle(.plain)
                .padding(.horizontal, 14).padding(.vertical, 12)
                .background(Color.wizardField, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.primary.opacity(0.08), lineWidth: 1))
                #if os(iOS)
                .keyboardType(keyboard)
                .textInputAutocapitalization(kind == .email ? .never : .sentences)
                .autocorrectionDisabled(kind == .email)
                #endif
        }
        .padding(.bottom, 6)
    }

    #if os(iOS)
    private var keyboard: UIKeyboardType {
        switch kind {
        case .email:  return .emailAddress
        case .phone:  return .phonePad
        case .number: return .numberPad
        case .text:   return .default
        }
    }
    #endif
}

private extension Color {
    /// Fonds adaptatifs cross-plateforme (iOS n'expose pas les mêmes que macOS).
    static var wizardBg: Color {
        #if os(iOS)
        Color(.secondarySystemBackground)
        #else
        Color(nsColor: .windowBackgroundColor)
        #endif
    }
    static var wizardField: Color {
        #if os(iOS)
        Color(uiColor: .tertiarySystemBackground)
        #else
        Color(nsColor: .controlBackgroundColor)
        #endif
    }

    /// Représentation hex "#RRGGBB" pour persister une couleur choisie.
    var hexString: String {
        #if canImport(UIKit)
        let ui = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "#%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
        #else
        let ns = NSColor(self).usingColorSpace(.sRGB) ?? .black
        return String(format: "#%02X%02X%02X", Int(ns.redComponent * 255), Int(ns.greenComponent * 255), Int(ns.blueComponent * 255))
        #endif
    }
}
