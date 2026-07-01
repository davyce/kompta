import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var theme: CompanyTheme

    @State private var mode: AuthMode = .login
    @State private var email = ""
    @State private var password = ""
    @State private var resetIdentifier = ""
    @State private var resetToken = ""
    @State private var newPassword = ""
    @State private var resetResult: PasswordResetRequestResponse?
    @State private var registration = RegistrationDraft()
    @State private var isLoading = false
    @State private var errorMsg: String?
    @State private var successMsg: String?
    @FocusState private var focus: Field?
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    fileprivate enum AuthMode: String, CaseIterable {
        case login, register, reset, resetConfirm
    }
    private enum Field { case email, password, company, admin, resetIdentifier, resetToken, newPassword }
    private var isCompact: Bool { horizontalSizeClass == .compact }

    var body: some View {
        GeometryReader { geo in
            let isWide = geo.size.width >= 900
            ZStack {
                (Color(hex: "#f7f8fa") ?? .white).ignoresSafeArea()

                if isWide {
                    HStack(spacing: 0) {
                        MarketingPanel()
                            .frame(width: min(geo.size.width * 0.52, 720))
                        formColumn(isWide: true, availableHeight: geo.size.height)
                            .frame(maxWidth: .infinity)
                    }
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            mobileHeader
                            formCard
                            MiniFeatureGrid()
                            trustRow
                            footer
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 18)
                        .frame(maxWidth: 520)
                        .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .onAppear { focus = .email }
    }

    private func formColumn(isWide: Bool, availableHeight: CGFloat = 0) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                formCard
                if isWide {
                    trustRow
                    footer
                }
            }
            .padding(.horizontal, isWide ? 52 : 18)
            .padding(.vertical, isWide ? 48 : 22)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
            .frame(minHeight: isWide ? max(availableHeight - 96, 560) : 0, alignment: .center)
        }
    }

    private var mobileHeader: some View {
        HStack(spacing: 12) {
            KomptaLogoMark(size: 46, cornerRadius: 14)
            VStack(alignment: .leading, spacing: 2) {
                Text("KOMPTA")
                    .font(.system(size: 26, weight: .black, design: .rounded))
                    .foregroundStyle(Color(hex: "#17211f") ?? .primary)
                Text("ERP IA pour PME · CEMAC · SYSCOHADA")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .layoutPriority(1)
            Spacer()
            Group {
                if isCompact {
                    LimuleMark(size: 24, showAura: false)
                        .padding(9)
                } else {
                    HStack(spacing: 5) {
                        LimuleMark(size: 18, showAura: false)
                        Text("Limule")
                            .font(.caption.bold())
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                }
            }
            .background(KomptaBrand.primary.opacity(0.1))
            .foregroundStyle(KomptaBrand.primary)
            .clipShape(Capsule())
        }
    }

    private var formCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(KomptaBrand.primary.opacity(0.1))
                    headerIcon
                }
                .frame(width: 46, height: 46)

                VStack(alignment: .leading, spacing: 4) {
                    Text(formTitle)
                        .font(.title2.bold())
                        .foregroundStyle(Color(hex: "#17211f") ?? .primary)
                    Text(formSubtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if mode == .login || mode == .register {
                AuthModeTabs(mode: $mode)
            }

            VStack(spacing: 14) {
                switch mode {
                case .login:
                    loginFields
                case .register:
                    registerFields
                case .reset:
                    resetRequestFields
                case .resetConfirm:
                    resetConfirmFields
                }
            }

            if let errorMsg {
                AuthNotice(text: errorMsg, icon: "exclamationmark.triangle.fill", color: .red)
            }
            if let successMsg {
                AuthNotice(text: successMsg, icon: "checkmark.seal.fill", color: KomptaBrand.primary)
            }

            Button { Task { await submit() } } label: {
                HStack(spacing: 10) {
                    if isLoading {
                        LimuleMark(size: 24, showAura: false)
                    } else {
                        BrandedIcon(name: primaryActionIcon, tint: .white, size: 18)
                    }
                    Text(primaryActionTitle)
                        .font(.headline)
                }
                .frame(maxWidth: .infinity)
                .minHeight(52)
                .background(canSubmit ? KomptaBrand.primary : (Color(hex: "#c7ded6") ?? KomptaBrand.primary.opacity(0.26)))
                .foregroundStyle(canSubmit ? .white : (Color(hex: "#2f7662") ?? KomptaBrand.primary))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(!canSubmit || isLoading)
            .opacity(isLoading ? 0.72 : 1)

            bottomActions

            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "building.2.fill")
                    .foregroundStyle(.secondary)
                Text("Connectez votre entreprise, vos caisses, votre comptabilité et Limule dans un seul espace.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(12)
            .background(Color.black.opacity(0.035))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .padding(isCompact ? 18 : 22)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: .black.opacity(0.08), radius: 24, x: 0, y: 12)
        .animation(.spring(duration: 0.28), value: mode)
        .animation(.spring(duration: 0.28), value: errorMsg != nil)
    }

    @ViewBuilder private var headerIcon: some View {
        switch mode {
        case .login:
            Image(systemName: "key.fill").foregroundStyle(KomptaBrand.primary)
        case .register:
            Image(systemName: "person.badge.plus.fill").foregroundStyle(KomptaBrand.primary)
        case .reset, .resetConfirm:
            Image(systemName: "shield.checkered").foregroundStyle(KomptaBrand.primary)
        }
    }

    private var loginFields: some View {
        Group {
            AuthTextField(
                label: "Email ou téléphone",
                icon: "envelope.fill",
                placeholder: "admin@kompta.local",
                text: $email,
                // .username (pas .email) : le champ accepte aussi un numéro de
                // téléphone, et c'est le contentType qu'iOS associe fiablement au
                // mot de passe pour proposer l'enregistrement dans le Trousseau.
                kind: .username
            )
            .focused($focus, equals: .email)

            AuthSecureField(
                label: "Mot de passe",
                icon: "lock.fill",
                placeholder: "Mot de passe",
                text: $password,
                kind: .password
            )
            .focused($focus, equals: .password)

            Button {
                setMode(.reset)
            } label: {
                Text("Mot de passe oublié ?")
                    .font(.caption.bold())
                    .foregroundStyle(KomptaBrand.primary)
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var registerFields: some View {
        Group {
            AuthTextField(label: "Nom de l'entreprise", icon: "building.2.fill", placeholder: "ADANSONIA SARL", text: $registration.companyName)
                .focused($focus, equals: .company)
            AuthTextField(label: "Raison sociale", icon: "doc.text.fill", placeholder: "ADANSONIA SARL", text: $registration.legalName)
            HStack(spacing: 10) {
                AuthTextField(label: "Secteur", icon: "briefcase.fill", placeholder: "Commerce et services", text: $registration.industry)
                AuthTextField(label: "Pays", icon: "globe", placeholder: "Congo", text: $registration.country)
            }
            HStack(spacing: 10) {
                AuthTextField(label: "Responsable", icon: "person.fill", placeholder: "Nom complet", text: $registration.adminName)
                AuthTextField(label: "Téléphone", icon: "phone.fill", placeholder: "+242...", text: $registration.adminPhone, kind: .phone)
            }
            AuthTextField(label: "Email admin", icon: "envelope.fill", placeholder: "admin@entreprise.com", text: $registration.adminEmail, kind: .email)
            AuthSecureField(label: "Mot de passe admin", icon: "lock.fill", placeholder: "8 caractères minimum", text: $registration.password, kind: .newPassword)

            VStack(alignment: .leading, spacing: 8) {
                Text("CONSENTEMENT").font(.caption2.bold()).foregroundStyle(.secondary)
                AuthTextField(label: "Nom du signataire", icon: "signature", placeholder: "Votre nom", text: $registration.signatoryName)
                Toggle(isOn: $registration.acceptPrivacy) {
                    Text("J'accepte la Politique de confidentialité.").font(.caption)
                }
                Toggle(isOn: $registration.acceptTerms) {
                    Text("J'accepte les Conditions d'utilisation.").font(.caption)
                }
                Toggle(isOn: $registration.acceptDisclaimer) {
                    Text("Décharge : KOMPTA est fourni « en l'état », sans garantie ; mes données peuvent être hébergées hors de mon pays ; l'IA est non contractuelle et indicative ; la responsabilité de l'éditeur est limitée. Je reste seul responsable de mes sauvegardes, déclarations et obligations.").font(.caption)
                }
            }
            .padding(12)
            .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private var resetRequestFields: some View {
        Group {
            AuthTextField(label: "Email ou téléphone", icon: "envelope.fill", placeholder: "Votre identifiant", text: $resetIdentifier, kind: .username)
                .focused($focus, equals: .resetIdentifier)
            Button("Retour à la connexion") { setMode(.login) }
                .font(.caption.bold())
                .foregroundStyle(.secondary)
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var resetConfirmFields: some View {
        Group {
            if let token = resetResult?.reset_token {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Token de réinitialisation")
                        .font(.caption.bold())
                    Text(token)
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                    if let note = resetResult?.note {
                        Text(note).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                .padding(12)
                .background(Color.orange.opacity(0.09))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            AuthTextField(label: "Token", icon: "number", placeholder: "Coller le token", text: $resetToken)
                .focused($focus, equals: .resetToken)
            AuthSecureField(label: "Nouveau mot de passe", icon: "lock.fill", placeholder: "8 caractères minimum", text: $newPassword, kind: .newPassword)
                .focused($focus, equals: .newPassword)
            Button("Retour à la connexion") { setMode(.login) }
                .font(.caption.bold())
                .foregroundStyle(.secondary)
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var bottomActions: some View {
        HStack(spacing: 8) {
            switch mode {
            case .login:
                Text("Pas encore de compte ?").foregroundStyle(.secondary)
                Button("Créer une entreprise") { setMode(.register) }
                    .foregroundStyle(KomptaBrand.primary)
            case .register:
                Text("Déjà inscrit ?").foregroundStyle(.secondary)
                Button("Se connecter") { setMode(.login) }
                    .foregroundStyle(KomptaBrand.primary)
            case .reset, .resetConfirm:
                Text("Vous avez retrouvé votre accès ?").foregroundStyle(.secondary)
                Button("Connexion") { setMode(.login) }
                    .foregroundStyle(KomptaBrand.primary)
            }
        }
        .font(.caption.bold())
        .buttonStyle(.plain)
    }

    private var trustRow: some View {
        HStack(spacing: 0) {
            TrustItem(icon: "lock.fill", text: "Chiffré")
            Divider().frame(height: 18)
            TrustItem(icon: "shield.checkered", text: "Multi-tenant")
            Divider().frame(height: 18)
            TrustItem(icon: "checkmark.seal.fill", text: "SYSCOHADA")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color.white)
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.black.opacity(0.06), lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var footer: some View {
        Text("KOMPTA · v2.0 · Propulsé par Limule")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .center)
    }

    private var formTitle: String {
        switch mode {
        case .login: return "Connexion"
        case .register: return "Créer votre entreprise"
        case .reset: return "Réinitialiser l'accès"
        case .resetConfirm: return "Changer le mot de passe"
        }
    }

    private var formSubtitle: String {
        switch mode {
        case .login: return "Entrez dans votre cockpit KOMPTA."
        case .register: return "Créez votre espace entreprise en quelques champs."
        case .reset: return "Recevez ou générez un token sécurisé."
        case .resetConfirm: return "Utilisez le token reçu pour définir un nouveau mot de passe."
        }
    }

    private var primaryActionTitle: String {
        if isLoading { return "Limule vérifie..." }
        switch mode {
        case .login: return "Entrer dans KOMPTA"
        case .register: return "Créer et entrer"
        case .reset: return "Demander le token"
        case .resetConfirm: return "Changer le mot de passe"
        }
    }

    private var primaryActionIcon: String {
        switch mode {
        case .login: return "shield.checkered"
        case .register: return "person.badge.plus.fill"
        case .reset, .resetConfirm: return "key.fill"
        }
    }

    private var canSubmit: Bool {
        switch mode {
        case .login:
            return !email.trimmed.isEmpty && !password.trimmed.isEmpty
        case .register:
            return registration.isValid
        case .reset:
            return !resetIdentifier.trimmed.isEmpty
        case .resetConfirm:
            return !resetToken.trimmed.isEmpty && newPassword.count >= 8
        }
    }

    private func setMode(_ next: AuthMode) {
        mode = next
        errorMsg = nil
        successMsg = nil
        if next != .resetConfirm { resetResult = nil }
    }

    private func submit() async {
        guard canSubmit, !isLoading else { return }
        isLoading = true
        errorMsg = nil
        successMsg = nil
        do {
            switch mode {
            case .login:
                try await auth.login(email: email.trimmed, password: password.trimmed)
            case .register:
                try await auth.registerCompany(registration.payload)
            case .reset:
                let result = try await APIClient.shared.requestPasswordReset(identifier: resetIdentifier.trimmed)
                resetResult = result
                resetToken = result.reset_token ?? ""
                successMsg = result.message
                mode = .resetConfirm
            case .resetConfirm:
                let result = try await APIClient.shared.resetPassword(token: resetToken.trimmed, newPassword: newPassword.trimmed)
                successMsg = result.message
                password = ""
                newPassword = ""
                mode = .login
            }
        } catch {
            errorMsg = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        isLoading = false
    }
}

private struct MarketingPanel: View {
    var body: some View {
        ZStack {
            Color(hex: "#17211f") ?? .black
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 12) {
                    KomptaLogoMark(size: 48, cornerRadius: 12)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("KOMPTA")
                            .font(.title2.weight(.black))
                        Text("Propulsé par Limule · ERP intelligent")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.62))
                    }
                }

                Spacer(minLength: 48)

                VStack(alignment: .leading, spacing: 26) {
                    Text("GESTION ENTREPRISE, TERRAIN ET CONFORMITÉ")
                        .font(.caption.bold())
                        .foregroundStyle(Color(hex: "#a7f3d0") ?? .green)
                    Text("Un cockpit unique pour piloter l'activité.")
                        .font(.system(size: 46, weight: .black, design: .rounded))
                        .lineSpacing(2)
                        .minimumScaleFactor(0.82)
                    HStack(spacing: 12) {
                        HeroFeature(title: "RH + Paie", text: "Dossiers, bulletins, validations")
                        HeroFeature(title: "POS + Stock", text: "Scan, panier, alertes terrain")
                        HeroFeature(title: "TERAS", text: "Score, risques, actions")
                    }
                    .frame(maxWidth: 620)

                    HStack(spacing: 16) {
                        LimuleMark(size: 64)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("VOTRE GRAND SAGE")
                                .font(.caption2.bold())
                                .foregroundStyle(Color(hex: "#a7f3d0") ?? .green)
                            Text("Limule")
                                .font(.title3.weight(.black))
                            Text("Analyse · Rédaction · Conformité · Prévisions")
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.58))
                        }
                    }
                    .padding(16)
                    .background(.white.opacity(0.06))
                    .overlay {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(.white.opacity(0.1), lineWidth: 1)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .frame(maxWidth: 500, alignment: .leading)
                }

                Spacer(minLength: 48)

                HStack(spacing: 8) {
                    LimuleMark(size: 18, showAura: false)
                    Text("KOMPTA · v2.0 · Mobile et Mac natifs")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.42))
                }
            }
            .foregroundStyle(.white)
            .padding(44)
        }
    }
}

private struct HeroFeature: View {
    let title: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.headline)
            Text(text)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.62))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
        .background(.white.opacity(0.06))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(.white.opacity(0.1), lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct MiniFeatureGrid: View {
    private let items: [(String, String, String, Bool)] = [
        ("receipt.fill", "Factures", "PDF, paiements", false),
        ("wallet.pass.fill", "Caisse", "POS mobile", false),
        ("person.3.fill", "Groupes", "Tontines", false),
        ("chart.bar.xaxis", "Compta", "OHADA", false),
        (KomptaBrand.limuleIcon, "Limule", "Grand Sage", true),
        ("iphone", "Mobile", "iOS + Mac", false),
    ]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 10)], spacing: 10) {
            ForEach(items, id: \.1) { icon, title, hint, _ in
                VStack(spacing: 7) {
                    BrandedIcon(name: icon, tint: KomptaBrand.primary, size: icon == KomptaBrand.limuleIcon ? 24 : 20)
                    Text(title)
                        .font(.caption.bold())
                        .foregroundStyle(Color(hex: "#17211f") ?? .primary)
                    Text(hint)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, minHeight: 86)
                .background(Color.white)
                .overlay {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.black.opacity(0.08), lineWidth: 1)
                }
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }
}

private struct AuthTextField: View {
    let label: String
    let icon: String
    let placeholder: String
    @Binding var text: String
    var kind: AuthInputKind = .plain

    var body: some View {
        AuthFieldShell(label: label, icon: icon) {
            TextField(placeholder, text: $text)
                #if os(iOS)
                .textContentType(kind.textContentType)
                .keyboardType(kind.keyboardType)
                .textInputAutocapitalization(.never)
                #endif
                .autocorrectionDisabled()
                .textFieldStyle(.plain)
                .font(.body)
                .foregroundStyle(Color(hex: "#17211f") ?? .primary)
        }
    }
}

private struct AuthSecureField: View {
    let label: String
    let icon: String
    let placeholder: String
    @Binding var text: String
    var kind: AuthSecureKind = .password

    var body: some View {
        AuthFieldShell(label: label, icon: icon) {
            SecureField(placeholder, text: $text)
                #if os(iOS)
                .textContentType(kind.textContentType)
                #endif
                .textFieldStyle(.plain)
                .font(.body)
                .foregroundStyle(Color(hex: "#17211f") ?? .primary)
        }
    }
}

private enum AuthInputKind {
    case plain, username, email, phone

    #if os(iOS)
    var textContentType: UITextContentType? {
        switch self {
        case .plain: return nil
        case .username: return .username
        case .email: return .emailAddress
        case .phone: return .telephoneNumber
        }
    }

    var keyboardType: UIKeyboardType {
        switch self {
        case .email: return .emailAddress
        case .phone: return .phonePad
        case .plain, .username: return .default
        }
    }
    #endif
}

private enum AuthSecureKind {
    case password, newPassword

    #if os(iOS)
    var textContentType: UITextContentType {
        switch self {
        case .password: return .password
        case .newPassword: return .newPassword
        }
    }
    #endif
}

private struct AuthFieldShell<Content: View>: View {
    let label: String
    let icon: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label)
                .font(.caption.bold())
                .foregroundStyle(Color(hex: "#73777f") ?? .secondary)
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.footnote.bold())
                    .foregroundStyle(Color(hex: "#7b8088") ?? .secondary)
                    .frame(width: 18)
                content()
                    .frame(minHeight: 24)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .background(Color(hex: "#f3f5f4") ?? Color.black.opacity(0.045))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.black.opacity(0.045), lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        }
    }
}

private struct AuthModeTabs: View {
    @Binding var mode: LoginView.AuthMode

    var body: some View {
        HStack(spacing: 4) {
            tab("Connexion", .login)
            tab("Créer un compte", .register)
        }
        .padding(4)
        .background(Color.black.opacity(0.055))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func tab(_ title: String, _ tabMode: LoginView.AuthMode) -> some View {
        Button {
            withAnimation(.spring(duration: 0.22)) {
                mode = tabMode
            }
        } label: {
            Text(title)
                .font(.subheadline.bold())
                .lineLimit(1)
                .minimumScaleFactor(0.82)
                .frame(maxWidth: .infinity, minHeight: 38)
                .foregroundStyle(mode == tabMode ? (Color(hex: "#17211f") ?? .primary) : .secondary)
                .background(mode == tabMode ? Color.white : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct AuthNotice: View {
    let text: String
    let icon: String
    let color: Color

    var body: some View {
        Label(text, systemImage: icon)
            .font(.footnote)
            .foregroundStyle(color)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(color.opacity(0.09))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

private struct TrustItem: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.caption2.bold())
                .foregroundStyle(KomptaBrand.primary)
            Text(text)
                .font(.caption2.bold())
                .foregroundStyle(Color(hex: "#6b7280") ?? .secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

// KomptaLogoMark est défini dans Components/GlassComponents.swift (partagé
// avec le splash screen et toute autre vue qui a besoin du vrai logo).

private struct RegistrationDraft {
    var companyName = ""
    var legalName = ""
    var industry = "Commerce et services"
    var organizationType = "PME"
    var country = "Congo"
    var adminName = ""
    var adminEmail = ""
    var adminPhone = ""
    var password = ""
    var signatoryName = ""
    var acceptPrivacy = false
    var acceptTerms = false
    var acceptDisclaimer = false

    var isValid: Bool {
        companyName.trimmed.count >= 2 &&
        adminName.trimmed.count >= 2 &&
        !adminEmail.trimmed.isEmpty &&
        password.count >= 8 &&
        !signatoryName.trimmed.isEmpty &&
        acceptPrivacy && acceptTerms && acceptDisclaimer
    }

    var payload: CompanyRegistrationPayload {
        CompanyRegistrationPayload(
            company_name: companyName.trimmed,
            legal_name: legalName.trimmed.isEmpty ? companyName.trimmed : legalName.trimmed,
            industry: industry.trimmed.isEmpty ? "Services" : industry.trimmed,
            organization_type: organizationType.trimmed.isEmpty ? "PME" : organizationType.trimmed,
            country: country.trimmed.isEmpty ? "Congo" : country.trimmed,
            admin_full_name: adminName.trimmed,
            admin_email: adminEmail.trimmed,
            admin_phone: adminPhone.trimmed,
            password: password,
            signatory_name: signatoryName.trimmed,
            accept_privacy: acceptPrivacy,
            accept_terms: acceptTerms,
            accept_disclaimer: acceptDisclaimer
        )
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

private extension View {
    func minHeight(_ value: CGFloat) -> some View {
        frame(minHeight: value)
    }
}
