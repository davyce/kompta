import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var auth:  AuthManager
    @EnvironmentObject private var theme: CompanyTheme
    @EnvironmentObject private var currency: CurrencyManager

    var body: some View {
        // Observing `currency.code` here re-renders the whole tree when the user
        // switches display currency, so every `fcfa(...)` refreshes immediately.
        let _ = currency.code
        return Group {
            switch auth.state {
            case .loading:
                SplashView()
            case .unauthenticated:
                LoginView()
            case .authenticated:
                if auth.currentUser?.must_change_password == true {
                    // Mot de passe temporaire (reset admin, première connexion) :
                    // bloque tout le reste de l'app jusqu'à résolution.
                    ActivationView()
                } else if auth.currentUser?.isPlatformAdmin == true {
                    // super_admin OU staff plateforme (rôle personnalisé scope "admin") :
                    // atterrit sur la console admin, avec les sections filtrées selon
                    // les permissions de son rôle (enforcement backend en plus).
                    SuperAdminShell()
                        .id("super-admin-\(auth.currentUser?.id ?? -1)")
                        .task {
                            if let company = auth.company { theme.apply(from: company) }
                        }
                } else {
                    AppShell()
                        .id("company-\(auth.currentUser?.id ?? -1)-\(auth.currentUser?.role ?? "")")
                        .task {
                            if let company = auth.company { theme.apply(from: company) }
                        }
                }
            }
        }
        .animation(.easeInOut(duration: 0.3), value: auth.state == .authenticated)
        // L'interface est conçue avec des surfaces claires fixes (cartes blanches,
        // champs gris clair). Le mode sombre rendait le texte blanc sur blanc :
        // on verrouille donc l'app en clair tant que le thème sombre n'est pas
        // entièrement adapté. (Le réglage d'apparence reste pour un usage futur.)
        .preferredColorScheme(.light)
        .installKeyboardDismiss()
    }
}

// MARK: - Splash / loading screen

struct SplashView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @State private var pulse = false

    var body: some View {
        ZStack {
            theme.gradient.ignoresSafeArea()

            VStack(spacing: 28) {
                ZStack {
                    ForEach([1.4, 1.2, 1.0], id: \.self) { scale in
                        Circle()
                            .fill(.white.opacity(0.07))
                            .frame(width: 90, height: 90)
                            .scaleEffect(pulse ? scale : 1)
                    }
                    Text("K")
                        .font(.system(size: 46, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                }
                .animation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true), value: pulse)

                ProgressView()
                    .tint(.white)
                    .scaleEffect(1.2)
            }
        }
        .onAppear { pulse = true }
    }
}
