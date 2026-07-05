import Foundation
import PassKit

#if os(iOS)
import StripeApplePay

/// Encaissement Apple Pay au POS, via le SDK Stripe (STPApplePayContext).
///
/// Flux : on crée un PaymentIntent Stripe côté backend (même endpoint que le
/// paiement carte web, `/payments/stripe/intent`), puis on laisse
/// `STPApplePayContext` afficher la feuille PassKit et confirmer l'intent
/// directement avec le token Apple Pay — KOMPTA ne manipule jamais la carte.
///
/// Merchant ID : voir `com.apple.developer.in-app-payments` dans
/// `project.yml` — placeholder `merchant.com.adansonia.kompta`, à remplacer
/// par le vrai identifiant créé par l'utilisateur dans son compte Apple
/// Developer (ce code ne peut pas fonctionner en conditions réelles tant que
/// ce Merchant ID + la capacité Xcode ne sont pas configurés manuellement).
///
/// iOS uniquement : le SDK `stripe-ios` ne déclare pas de support macOS
/// (Package.swift : `platforms: [.iOS(.v13)]`) — StripeCore référence des
/// APIs UIKit qui n'existent pas sur macOS. KomptaMac garde le paiement carte
/// web/manuel existant (pas d'Apple Pay natif macOS pour l'instant).
@MainActor
final class ApplePayCheckout: NSObject {

    /// Identifiant marchand PLACEHOLDER — cf. note ci-dessus.
    static let merchantId = "merchant.com.adansonia.kompta"

    private var completion: ((Result<Int, Error>) -> Void)?
    private var transactionId: Int?
    private var clientSecret: String?
    private var activeContext: STPApplePayContext?

    enum CheckoutError: LocalizedError {
        case cannotMakePayments
        case presentationFailed

        var errorDescription: String? {
            switch self {
            case .cannotMakePayments:  return "Apple Pay n'est pas disponible sur cet appareil."
            case .presentationFailed:  return "Impossible d'afficher la feuille Apple Pay."
            }
        }
    }

    /// Démarre un paiement Apple Pay pour le montant donné (en centimes XAF).
    /// Crée d'abord le PaymentIntent Stripe, puis présente PassKit.
    func start(
        amountCents: Int,
        currency: String = "XAF",
        label: String = "KOMPTA",
        saleId: Int? = nil,
        description: String = "",
        completion: @escaping (Result<Int, Error>) -> Void
    ) {
        guard PKPaymentAuthorizationController.canMakePayments() else {
            completion(.failure(CheckoutError.cannotMakePayments))
            return
        }
        self.completion = completion

        Task {
            do {
                let intent = try await APIClient.shared.createStripeIntent(
                    StripeIntentPayload(
                        amount_cents: amountCents,
                        currency: currency,
                        sale_id: saleId,
                        description: description
                    )
                )
                self.transactionId = intent.transaction_id
                self.clientSecret = intent.client_secret

                let request = PKPaymentRequest()
                request.merchantIdentifier = Self.merchantId
                request.countryCode = "CM"
                request.currencyCode = currency
                request.supportedNetworks = [.visa, .masterCard, .amex]
                request.merchantCapabilities = .threeDSecure
                let amountDecimal = NSDecimalNumber(value: Double(amountCents) / 100.0)
                request.paymentSummaryItems = [
                    PKPaymentSummaryItem(label: label, amount: amountDecimal)
                ]

                guard let applePayContext = STPApplePayContext(paymentRequest: request, delegate: self) else {
                    completion(.failure(CheckoutError.presentationFailed))
                    return
                }
                applePayContext.presentApplePay()
                // Conserve une référence forte le temps du paiement (delegate faible côté SDK).
                self.activeContext = applePayContext
            } catch {
                completion(.failure(error))
            }
        }
    }
}

extension ApplePayCheckout: ApplePayContextDelegate {
    nonisolated func applePayContext(
        _ context: STPApplePayContext,
        didCreatePaymentMethod paymentMethod: StripeAPI.PaymentMethod,
        paymentInformation: PKPayment,
        completion: @escaping STPIntentClientSecretCompletionBlock
    ) {
        // Le PaymentIntent est déjà créé (backend) ; on renvoie simplement son secret.
        Task { @MainActor in
            completion(self.clientSecret, nil)
        }
    }

    nonisolated func applePayContext(
        _ context: STPApplePayContext,
        didCompleteWith status: STPApplePayContext.PaymentStatus,
        error: Error?
    ) {
        Task { @MainActor in
            self.activeContext = nil
            switch status {
            case .success:
                if let txnId = self.transactionId {
                    self.completion?(.success(txnId))
                } else {
                    self.completion?(.failure(CheckoutError.presentationFailed))
                }
            case .error:
                self.completion?(.failure(error ?? CheckoutError.presentationFailed))
            case .userCancellation:
                self.completion?(.failure(CocoaError(.userCancelled)))
            @unknown default:
                self.completion?(.failure(CheckoutError.presentationFailed))
            }
        }
    }
}

#else

/// Stub macOS : Apple Pay natif via le SDK Stripe n'est pas disponible sur
/// KomptaMac (cf. note ci-dessus). `canMakePayments()` renvoie toujours
/// false via `PKPaymentAuthorizationController` (disponible sur macOS aussi),
/// donc `POSView` ne proposera jamais l'option Apple Pay sur Mac — ce stub
/// existe seulement pour que le type reste référencable dans le code partagé.
@MainActor
final class ApplePayCheckout: NSObject {
    enum CheckoutError: LocalizedError {
        case cannotMakePayments
        var errorDescription: String? { "Apple Pay n'est pas disponible sur macOS." }
    }

    func start(
        amountCents: Int,
        currency: String = "XAF",
        label: String = "KOMPTA",
        saleId: Int? = nil,
        description: String = "",
        completion: @escaping (Result<Int, Error>) -> Void
    ) {
        completion(.failure(CheckoutError.cannotMakePayments))
    }
}

#endif
