import SwiftUI

// ============================================================================
//  ActivationView — forced password change, mirrors the web app's /activation
//  route. Shown instead of the rest of the app whenever
//  AuthManager.currentUser?.must_change_password is true (fresh account,
//  admin-issued temporary password, or group-member invite).
// ============================================================================

struct ActivationView: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var theme: CompanyTheme

    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var saving = false
    @State private var errorMsg: String?
    @FocusState private var focus: Field?

    private enum Field { case current, new, confirm }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                theme.gradient.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 0) {
                        Spacer().frame(height: geo.size.height * 0.08)
                        logoSection
                        Spacer().frame(height: 32)
                        formCard
                        Spacer().frame(height: 32)
                    }
                    .frame(minHeight: geo.size.height)
                }
            }
        }
        .onAppear { focus = .current }
    }

    private var logoSection: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle().fill(.white.opacity(0.2)).frame(width: 72, height: 72)
                Image(systemName: "key.fill").font(.title).foregroundStyle(.white)
            }
            Text("Nouveau mot de passe requis")
                .font(.title3.bold())
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
            Text("Pour sécuriser votre compte, choisissez un mot de passe personnel avant de continuer.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.75))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
    }

    private var formCard: some View {
        GlassCard(padding: 28, cornerRadius: 28) {
            VStack(spacing: 22) {
                field(label: "Mot de passe temporaire", icon: "lock", placeholder: "••••••••",
                      text: $currentPassword, this: .current, next: .new)
                field(label: "Nouveau mot de passe (8 caractères min.)", icon: "key", placeholder: "••••••••",
                      text: $newPassword, this: .new, next: .confirm)
                field(label: "Confirmer le nouveau mot de passe", icon: "checkmark.shield", placeholder: "••••••••",
                      text: $confirmPassword, this: .confirm, next: nil)

                if let errorMsg {
                    Label(errorMsg, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }

                KomptaButton(label: "Valider et continuer", icon: "arrow.right", isLoading: saving) { await submit() }
                    .disabled(!isValid)

                Button("Se déconnecter") { auth.logout() }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 24)
        .animation(.spring(duration: 0.3), value: errorMsg != nil)
    }

    @ViewBuilder
    private func field(label: String, icon: String, placeholder: String,
                        text: Binding<String>, this: Field, next: Field?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption.weight(.medium)).foregroundStyle(.secondary)
            HStack(spacing: 10) {
                Image(systemName: icon).foregroundStyle(.secondary).frame(width: 18)
                SecureField(placeholder, text: text)
                    .textContentType(this == .current ? .password : .newPassword)
                    .focused($focus, equals: this)
                    .submitLabel(next != nil ? .next : .go)
                    .onSubmit {
                        if let next { focus = next } else { Task { await submit() } }
                    }
            }
            .padding(12)
            .background(.quaternary.opacity(0.6))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    private var isValid: Bool {
        !currentPassword.isEmpty && newPassword.count >= 8 && newPassword == confirmPassword
    }

    private func submit() async {
        guard isValid, !saving else { return }
        saving = true
        errorMsg = nil
        do {
            let updated = try await APIClient.shared.firstLoginChangePassword(currentPassword: currentPassword, newPassword: newPassword)
            auth.currentUser = updated
        } catch {
            errorMsg = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        saving = false
    }
}
