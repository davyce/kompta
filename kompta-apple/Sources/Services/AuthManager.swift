import SwiftUI

@MainActor
final class AuthManager: ObservableObject {
    @Published var state: AuthState = .loading
    @Published var currentUser: KomptaUser?
    @Published var company: KomptaCompany?

    enum AuthState { case loading, unauthenticated, authenticated }

    var isAuthenticated: Bool { state == .authenticated }
    var isLoading: Bool      { state == .loading }

    private let api = APIClient.shared

    init() { Task { await restoreSession() } }

    // MARK: - Session restore

    private func restoreSession() async {
        guard KeychainHelper.get("auth_token") != nil else { state = .unauthenticated; return }
        // Ne déconnecte QUE sur un rejet explicite du serveur (token invalide/expiré,
        // compte suspendu). Une erreur réseau/serveur transitoire ne doit jamais
        // effacer la session — sinon un simple accroc de connexion mobile déconnecte
        // l'utilisateur et le renvoie à l'écran de connexion à chaque démarrage.
        for attempt in 0..<2 {
            do {
                async let user    = api.me()
                async let company = api.company()
                (currentUser, self.company) = try await (user, company)
                state = .authenticated
                return
            } catch APIError.unauthorized {
                KeychainHelper.clearAll()
                state = .unauthenticated
                return
            } catch {
                if attempt == 0 {
                    try? await Task.sleep(nanoseconds: 700_000_000)
                    continue
                }
                // Toujours en échec après un essai : on reste connecté avec le jeton
                // existant (probable coupure réseau) plutôt que de forcer une
                // reconnexion. Les écrans referont leurs propres appels au besoin.
                state = .authenticated
            }
        }
    }

    // MARK: - Login

    func login(email: String, password: String) async throws {
        state = .loading
        do {
            let token = try await api.login(email: email, password: password)
            await api.setToken(token.access_token)
            async let user    = api.me()
            async let company = api.company()
            (currentUser, self.company) = try await (user, company)
            state = .authenticated
        } catch {
            state = .unauthenticated
            throw error
        }
    }

    func registerCompany(_ payload: CompanyRegistrationPayload) async throws {
        state = .loading
        do {
            let token = try await api.registerCompany(payload)
            await api.setToken(token.access_token)
            async let user    = api.me()
            async let company = api.company()
            (currentUser, self.company) = try await (user, company)
            state = .authenticated
        } catch {
            state = .unauthenticated
            throw error
        }
    }

    /// Crée une nouvelle entreprise pour l'utilisateur courant puis bascule
    /// immédiatement dessus (nouvelle session).
    func createCompany(_ payload: CompanyCreatePayload) async throws {
        state = .loading
        do {
            let token = try await api.createCompany(payload)
            await api.setToken(token.access_token)
            async let user    = api.me()
            async let company = api.company()
            (currentUser, self.company) = try await (user, company)
            state = .authenticated
        } catch {
            state = .authenticated
            throw error
        }
    }

    /// Liste toutes les entreprises rattachées au même email.
    func myCompanies() async throws -> [CompanyMembership] {
        try await api.myCompanies()
    }

    /// Bascule la session active vers une autre entreprise rattachée au même email
    /// (repasse par `.loading` pour forcer la reconstruction de la racine de nav).
    func switchCompany(_ companyId: Int) async throws {
        state = .loading
        do {
            let token = try await api.switchCompany(companyId)
            await api.setToken(token.access_token)
            async let user    = api.me()
            async let company = api.company()
            (currentUser, self.company) = try await (user, company)
            state = .authenticated
        } catch {
            state = .authenticated
            throw error
        }
    }

    /// Re-fetch the current user (after a self-profile edit, role change, etc.).
    func refreshUser() async {
        if let user = try? await api.me() { currentUser = user }
    }

    /// Marque la visite guidée comme vue, côté serveur — persiste au-delà d'une
    /// réinstallation ou d'un changement d'appareil (contrairement à un flag local).
    func markOnboardingDone() async {
        if let user = try? await api.markOnboardingDone() { currentUser = user }
    }

    // MARK: - Logout

    func logout() {
        Task { await api.clearToken() }
        currentUser = nil
        company = nil
        state = .unauthenticated
    }
}
