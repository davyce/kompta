//
//  StoreKitManager.swift
//  Achat intégré Apple (StoreKit 2) pour l'abonnement KOMPTA.
//
//  Contexte : suite au rejet App Store (Guideline 3.1.1 / 2.1(b)), l'achat
//  d'un abonnement KOMPTA depuis l'app iOS doit passer par l'In-App Purchase
//  d'Apple (Apple prélève sa commission mais l'inscription/achat reste
//  utilisable dans l'app — pas de redirection vers un paiement externe).
//
//  Flux :
//  1. `products` : catalogue chargé depuis App Store Connect via StoreKit.
//  2. `purchase(_:)` : lance l'achat, récupère la transaction signée (JWS),
//     l'envoie au backend (`APIClient.verifyApplePurchase`) pour activer
//     l'abonnement de l'entreprise, puis appelle `transaction.finish()`.
//  3. `transactionUpdatesTask` : écoute en tâche de fond les renouvellements/
//     restaurations qui arrivent hors d'un achat explicite (StoreKit 2
//     `StoreKit.Transaction.updates`), et les forwarde aussi au backend — utile si
//     l'app était fermée pendant un renouvellement et que l'utilisateur la
//     rouvre ensuite.
//
import Foundation
import StoreKit

@MainActor
final class StoreKitManager: ObservableObject {
    static let shared = StoreKitManager()

    /// Identifiants produits App Store Connect. À créer manuellement dans
    /// App Store Connect (groupe d'abonnements "Abonnement KOMPTA"), avec ces
    /// mêmes identifiants exacts, puis à associer au `SubscriptionPlan.code`
    /// correspondant côté admin backend (champ `apple_product_id`).
    enum ProductID: String, CaseIterable {
        case musalaMonthly = "com.adansonia.kompta.subscription.musala.monthly"
        case mokonziMonthly = "com.adansonia.kompta.subscription.mokonzi.monthly"

        /// Code du plan KOMPTA correspondant (voir backend/app/services/subscriptions.py DEFAULT_PLANS).
        /// Note : le forfait Standard est gratuit — pas de produit StoreKit associé.
        var planCode: String {
            switch self {
            case .musalaMonthly: return "pro"
            case .mokonziMonthly: return "business"
            }
        }
    }

    @Published private(set) var products: [StoreKit.Product] = []
    @Published private(set) var isLoadingProducts = false
    @Published private(set) var purchaseInProgress = false
    @Published var lastError: String?

    private var transactionUpdatesTask: Task<Void, Never>?

    private init() {}

    /// À appeler une fois au lancement de l'app (ex. dans KomptaApp.init ou
    /// .task { } de la vue racine) pour capter les renouvellements/
    /// restaurations qui arrivent pendant que l'app tourne.
    func startListeningForTransactionUpdates() {
        guard transactionUpdatesTask == nil else { return }
        transactionUpdatesTask = Task.detached { [weak self] in
            for await update in StoreKit.Transaction.updates {
                await self?.handle(update: update)
            }
        }
    }

    func stopListening() {
        transactionUpdatesTask?.cancel()
        transactionUpdatesTask = nil
    }

    /// Charge le catalogue de produits depuis App Store Connect (ou la config
    /// StoreKit Testing locale en simulateur/debug).
    func loadProducts() async {
        isLoadingProducts = true
        defer { isLoadingProducts = false }
        do {
            products = try await StoreKit.Product.products(for: ProductID.allCases.map { $0.rawValue })
                .sorted { $0.price < $1.price }
        } catch {
            lastError = "Impossible de charger les offres : \(error.localizedDescription)"
        }
    }

    /// Lance l'achat d'un produit. Retourne le résultat de vérification du
    /// backend une fois l'abonnement activé côté serveur.
    @discardableResult
    func purchase(_ product: StoreKit.Product) async throws -> AppleVerifyResult {
        purchaseInProgress = true
        defer { purchaseInProgress = false }

        let result = try await product.purchase()

        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)
            let planCode = ProductID(rawValue: product.id)?.planCode ?? ""
            let verifyResult = try await sendToBackend(jws: verification.jwsRepresentation, planCode: planCode)
            await transaction.finish()
            return verifyResult

        case .userCancelled:
            throw StoreKitManagerError.userCancelled

        case .pending:
            // Achat en attente (ex. "Ask to Buy" parental) : sera repris via
            // StoreKit.Transaction.updates quand il sera finalisé.
            throw StoreKitManagerError.pending

        @unknown default:
            throw StoreKitManagerError.unknown
        }
    }

    /// Restaure les achats existants (ex. réinstallation de l'app / nouvel
    /// appareil) — relit l'historique StoreKit et le renvoie au backend.
    func restorePurchases() async {
        do {
            try await AppStore.sync()
            for await result in StoreKit.Transaction.currentEntitlements {
                if let transaction = try? checkVerified(result) {
                    let planCode = ProductID(rawValue: transaction.productID)?.planCode ?? ""
                    _ = try? await sendToBackend(jws: result.jwsRepresentation, planCode: planCode)
                    await transaction.finish()
                }
            }
        } catch {
            lastError = "Restauration impossible : \(error.localizedDescription)"
        }
    }

    // MARK: - Internals

    private func handle(update: VerificationResult<StoreKit.Transaction>) async {
        guard let transaction = try? checkVerified(update) else { return }
        let planCode = ProductID(rawValue: transaction.productID)?.planCode ?? ""
        _ = try? await sendToBackend(jws: update.jwsRepresentation, planCode: planCode)
        await transaction.finish()
        await EntitlementsManager.shared.load()
    }

    private func sendToBackend(jws: String, planCode: String) async throws -> AppleVerifyResult {
        let result = try await APIClient.shared.verifyApplePurchase(signedTransaction: jws, planCode: planCode)
        await EntitlementsManager.shared.load()
        return result
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw StoreKitManagerError.unverifiedTransaction
        case .verified(let safe):
            return safe
        }
    }
}

enum StoreKitManagerError: LocalizedError {
    case userCancelled
    case pending
    case unverifiedTransaction
    case unknown

    var errorDescription: String? {
        switch self {
        case .userCancelled: return "Achat annulé."
        case .pending: return "Achat en attente de validation (autorisation parentale ou autre)."
        case .unverifiedTransaction: return "Transaction non vérifiable par l'appareil — réessayez."
        case .unknown: return "Erreur d'achat inconnue."
        }
    }
}
