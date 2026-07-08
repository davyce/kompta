import Foundation

#if os(iOS)
import StripeTerminal

/// Encaissement carte physique au POS via **Tap to Pay on iPhone**
/// (StripeTerminal SDK 5.x, lecteur "local" = l'iPhone lui-même, aucun
/// matériel externe requis).
///
/// Préalables côté compte (ce code ne peut PAS fonctionner tant que ces
/// éléments ne sont pas configurés — cf. discussion produit) :
///   1. Compte Stripe activé pour Tap to Pay on iPhone (demande d'éligibilité
///      côté Stripe Dashboard).
///   2. Entitlement Apple `com.apple.developer.proximity-reader.payment.acceptance`
///      accordé par Apple pour le Bundle ID `com.adansonia.kompta` (demande
///      via le compte Apple Developer). La clé est déjà déclarée dans
///      `project.yml`, mais elle est inopérante sans cette approbation.
///   3. Un `Location` Stripe Terminal (`locationId` ci-dessous) — objet créé
///      via `POST /v1/terminal/locations` côté Stripe, PLACEHOLDER pour
///      l'instant (même logique que `ApplePayCheckout.merchantId`).
///
/// Flux (API SDK 5.x, 100% async/await) :
///   `Terminal.shared.easyConnect(_:)` (découverte + connexion en un appel)
///   → PaymentIntent "carte présente" créé côté backend
///   → `Terminal.shared.retrievePaymentIntent(clientSecret:)`
///   → `Terminal.shared.processPaymentIntent(_:)` (collecte + confirmation
///   combinées ; le SDK affiche lui-même l'UI native "Approchez la carte").
///
/// iOS uniquement : Tap to Pay exploite le NFC de l'iPhone, absent sur Mac.
/// KomptaMac garde l'option "Carte (hors app)" en enregistrement manuel.
@MainActor
final class TapToPayCheckout: NSObject {

    static let shared = TapToPayCheckout()

    /// Location Stripe Terminal PLACEHOLDER — à remplacer par le vrai ID créé
    /// dans le compte Stripe de l'entreprise (Dashboard → Terminal → Locations,
    /// ou API `POST /v1/terminal/locations`). Cf. note de classe ci-dessus.
    static let locationId = "tml_REPLACE_WITH_REAL_LOCATION_ID"

    private var didInitializeTerminal = false
    private var connectedReader: Reader?

    enum CheckoutError: LocalizedError {
        case notConfigured
        case connectionFailed(String)
        case paymentFailed(String)

        var errorDescription: String? {
            switch self {
            case .notConfigured:
                return "Tap to Pay n'est pas encore configuré (compte Stripe / entitlement Apple / lieu Terminal). Contactez votre administrateur."
            case .connectionFailed(let m):
                return "Connexion au lecteur impossible : \(m)"
            case .paymentFailed(let m):
                return "Paiement refusé : \(m)"
            }
        }
    }

    private func initializeTerminalIfNeeded() {
        guard !didInitializeTerminal else { return }
        Terminal.initWithTokenProvider(self, delegate: self)
        didInitializeTerminal = true
    }

    /// Démarre un encaissement Tap to Pay pour le montant donné (centimes XAF).
    /// Connecte le lecteur local si nécessaire, puis collecte et confirme le paiement.
    func start(
        amountCents: Int,
        currency: String = "XAF",
        saleId: Int? = nil,
        description: String = "",
        completion: @escaping (Result<Int, Error>) -> Void
    ) {
        initializeTerminalIfNeeded()

        Task {
            do {
                _ = try await connectReaderIfNeeded()

                let intent = try await APIClient.shared.createStripeTerminalIntent(
                    StripeIntentPayload(
                        amount_cents: amountCents,
                        currency: currency,
                        sale_id: saleId,
                        description: description
                    )
                )

                let paymentIntent = try await retrievePaymentIntent(clientSecret: intent.client_secret)
                _ = try await Terminal.shared.processPaymentIntent(paymentIntent)

                completion(.success(intent.transaction_id))
            } catch {
                completion(.failure(error))
            }
        }
    }

    // MARK: - Reader connection

    private func connectReaderIfNeeded() async throws -> Reader {
        if let reader = connectedReader { return reader }
        do {
            let discoveryConfig = try TapToPayDiscoveryConfigurationBuilder().build()
            let connectionConfig = try TapToPayConnectionConfigurationBuilder(
                delegate: self,
                locationId: Self.locationId
            ).build()
            let easyConnectConfig = TapToPayEasyConnectConfiguration(
                discoveryConfiguration: discoveryConfig,
                connectionConfiguration: connectionConfig
            )
            let reader = try await Terminal.shared.easyConnect(easyConnectConfig)
            connectedReader = reader
            return reader
        } catch {
            throw CheckoutError.connectionFailed(error.localizedDescription)
        }
    }

    private func retrievePaymentIntent(clientSecret: String) async throws -> PaymentIntent {
        try await withCheckedThrowingContinuation { continuation in
            Terminal.shared.retrievePaymentIntent(clientSecret: clientSecret) { intent, error in
                if let intent {
                    continuation.resume(returning: intent)
                } else {
                    continuation.resume(throwing: CheckoutError.paymentFailed(error?.localizedDescription ?? "PaymentIntent introuvable."))
                }
            }
        }
    }
}

extension TapToPayCheckout: ConnectionTokenProvider {
    nonisolated func fetchConnectionToken(_ completion: @escaping (String?, Error?) -> Void) {
        Task {
            do {
                let token = try await APIClient.shared.stripeTerminalConnectionToken()
                completion(token.secret, nil)
            } catch {
                completion(nil, error)
            }
        }
    }
}

/// Tous les callbacks sont @optional côté SDK — implémentation vide.
extension TapToPayCheckout: TerminalDelegate {}

/// Callbacks requis par TapToPayConnectionConfigurationBuilder, mais sans action
/// nécessaire côté KOMPTA : le SDK gère lui-même l'UI native de mise à jour /
/// invite de lecture de carte pendant la connexion et le paiement.
extension TapToPayCheckout: TapToPayReaderDelegate {
    nonisolated func tapToPayReader(_ reader: Reader, didStartInstallingUpdate update: ReaderSoftwareUpdate, cancelable: Cancelable?) {}
    nonisolated func tapToPayReader(_ reader: Reader, didReportReaderSoftwareUpdateProgress progress: Float) {}
    nonisolated func tapToPayReader(_ reader: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {}
    nonisolated func tapToPayReader(_ reader: Reader, didRequestReaderInput inputOptions: ReaderInputOptions) {}
    nonisolated func tapToPayReader(_ reader: Reader, didRequestReaderDisplayMessage displayMessage: ReaderDisplayMessage) {}
}

#else

/// Stub macOS/autres : Tap to Pay exploite le NFC de l'iPhone, indisponible
/// sur Mac. `POSView` ne proposera jamais cette option sur KomptaMac ; ce
/// stub existe seulement pour que le type reste référencable dans le code partagé.
@MainActor
final class TapToPayCheckout: NSObject {
    static let shared = TapToPayCheckout()

    enum CheckoutError: LocalizedError {
        case unsupportedDevice
        var errorDescription: String? { "Tap to Pay n'est disponible que sur iPhone." }
    }

    func start(
        amountCents: Int,
        currency: String = "XAF",
        saleId: Int? = nil,
        description: String = "",
        completion: @escaping (Result<Int, Error>) -> Void
    ) {
        completion(.failure(CheckoutError.unsupportedDevice))
    }
}

#endif
