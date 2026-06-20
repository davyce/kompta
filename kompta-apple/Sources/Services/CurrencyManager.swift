import Foundation
import SwiftUI

// ============================================================================
//  CurrencyManager — app-wide display currency with live conversion.
//
//  All monetary values in the app are stored/returned by the backend in XAF
//  (FCFA), the base currency. The user can pick a *display* currency in
//  Settings; every `fcfa(...)` call then converts the XAF amount into that
//  currency and formats it with the right symbol.
//
//  Rate source: backend `/currency/convert` (exchangerate.host). When the live
//  rate is unavailable (offline / production guard), we fall back to the fixed
//  CFA peg (655.957 XAF = 1 EUR) and EUR-cross approximations so conversion
//  still works — clearly the peg, not a hardcoded "made up" number.
// ============================================================================

struct AppCurrency: Identifiable, Hashable {
    let code: String
    let name: String
    let fractionDigits: Int
    var id: String { code }

    /// Display units per 1 XAF, derived from the fixed CFA franc pec to the euro
    /// (1 EUR = 655.957 XAF) and standard EUR cross-rates. Used only as a fallback
    /// when the backend live rate is unavailable.
    var pegRatePerXAF: Double {
        let eurPerXAF = 1.0 / 655.957
        switch code {
        case "XAF", "XOF": return 1.0
        case "EUR":        return eurPerXAF
        case "USD":        return eurPerXAF * 1.08
        case "GBP":        return eurPerXAF * 0.855
        case "CAD":        return eurPerXAF * 1.47
        case "NGN":        return eurPerXAF * 1750.0
        default:           return eurPerXAF
        }
    }
}

@MainActor
final class CurrencyManager: ObservableObject {
    static let shared = CurrencyManager()

    static let supported: [AppCurrency] = [
        AppCurrency(code: "XAF", name: "Franc CFA (BEAC)", fractionDigits: 0),
        AppCurrency(code: "XOF", name: "Franc CFA (UEMOA)", fractionDigits: 0),
        AppCurrency(code: "EUR", name: "Euro", fractionDigits: 2),
        AppCurrency(code: "USD", name: "Dollar US", fractionDigits: 2),
        AppCurrency(code: "GBP", name: "Livre sterling", fractionDigits: 2),
        AppCurrency(code: "CAD", name: "Dollar canadien", fractionDigits: 2),
        AppCurrency(code: "NGN", name: "Naira", fractionDigits: 2),
    ]

    // Read by the free `fcfa(...)` formatter without actor hops.
    nonisolated(unsafe) static var liveCode = UserDefaults.standard.string(forKey: "displayCurrency") ?? "XAF"
    nonisolated(unsafe) static var liveRate = 1.0           // display units per 1 XAF
    nonisolated(unsafe) static var liveFraction = 0
    nonisolated(unsafe) static var liveApproximate = false  // true when using the peg fallback

    @Published var code: String {
        didSet {
            UserDefaults.standard.set(code, forKey: "displayCurrency")
            CurrencyManager.liveCode = code
            applyPegImmediately()
            Task { await refreshRate() }
        }
    }
    @Published private(set) var approximate = false

    var current: AppCurrency { Self.supported.first { $0.code == code } ?? Self.supported[0] }

    private init() {
        code = UserDefaults.standard.string(forKey: "displayCurrency") ?? "XAF"
        applyPegImmediately()
    }

    /// Apply the deterministic peg rate right away so the UI never shows stale XAF.
    private func applyPegImmediately() {
        let cur = current
        Self.liveRate = cur.pegRatePerXAF
        Self.liveFraction = cur.fractionDigits
        Self.liveApproximate = !(code == "XAF")
        approximate = Self.liveApproximate
    }

    /// Try to refine the rate with the backend live conversion.
    func refreshRate() async {
        guard code != "XAF" else {
            Self.liveRate = 1; Self.liveFraction = 0; Self.liveApproximate = false; approximate = false
            return
        }
        if let res = try? await APIClient.shared.currencyConvert(amount: 1, from: "XAF", to: code),
           let rate = res.converted ?? res.rate, rate > 0 {
            Self.liveRate = rate
            Self.liveApproximate = false
            approximate = false
        } else {
            // keep peg fallback
            Self.liveApproximate = true
            approximate = true
        }
        Self.liveFraction = current.fractionDigits
        objectWillChange.send()
    }
}

// MARK: - Global money formatters (now currency-aware)

/// Formats a base-XAF amount into the user's selected display currency.
func fcfa(_ amount: Double) -> String {
    let converted = amount * CurrencyManager.liveRate
    let code = CurrencyManager.liveCode
    let str = converted.formatted(.currency(code: code).precision(.fractionLength(CurrencyManager.liveFraction)))
    return CurrencyManager.liveApproximate ? "≈ " + str : str
}

/// Compact money formatter (e.g. 80,7 k) in the selected display currency.
func compactFCFA(_ amount: Double) -> String {
    let v = amount * CurrencyManager.liveRate
    let code = CurrencyManager.liveCode
    let sym = currencySymbol(code)
    let absV = abs(v)
    func n(_ x: Double) -> String { x.formatted(.number.precision(.fractionLength(0...1))) }
    let body: String
    switch absV {
    case 1_000_000...: body = "\(n(v / 1_000_000)) M"
    case 1_000...:      body = "\(n(v / 1_000)) k"
    default:            body = v.formatted(.number.precision(.fractionLength(0...(CurrencyManager.liveFraction))))
    }
    return "\(body) \(sym)"
}

func currencySymbol(_ code: String) -> String {
    switch code {
    case "XAF", "XOF": return "FCFA"
    case "EUR": return "€"
    case "USD", "CAD": return "$"
    case "GBP": return "£"
    case "NGN": return "₦"
    default: return code
    }
}
