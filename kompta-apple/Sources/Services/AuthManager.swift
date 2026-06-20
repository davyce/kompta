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
        do {
            async let user    = api.me()
            async let company = api.company()
            (currentUser, self.company) = try await (user, company)
            state = .authenticated
        } catch {
            KeychainHelper.clearAll()
            state = .unauthenticated
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

    /// Re-fetch the current user (after a self-profile edit, role change, etc.).
    func refreshUser() async {
        if let user = try? await api.me() { currentUser = user }
    }

    // MARK: - Logout

    func logout() {
        Task { await api.clearToken() }
        currentUser = nil
        company = nil
        state = .unauthenticated
    }
}
