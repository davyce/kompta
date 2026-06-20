import SwiftUI

@MainActor
final class CompanyTheme: ObservableObject {
    @Published var primary: Color = KomptaBrand.primary
    @Published var secondary: Color = KomptaBrand.secondary
    @Published var companyName: String = "KOMPTA"

    /// Toggle to prefer Liquid Glass surfaces (iOS 26 / macOS 26)
    @AppStorage("useLiquidGlass") var useLiquidGlass: Bool = true
    @AppStorage("useRoundedDesign") var useRoundedDesign: Bool = true

    func apply(from company: KomptaCompany) {
        companyName = company.name
        if let hex = company.primary_color, let c = Color(hex: hex) { primary = c }
        if let hex = company.secondary_color, let c = Color(hex: hex) { secondary = c }
    }

    func reset() {
        primary = KomptaBrand.primary
        secondary = KomptaBrand.secondary
        companyName = "KOMPTA"
    }

    var gradient: LinearGradient {
        LinearGradient(colors: [primary, secondary], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    var cardRadius: CGFloat { useRoundedDesign ? 20 : 12 }
    var buttonRadius: CGFloat { useRoundedDesign ? 14 : 8 }
}

// MARK: - App appearance (light / dark / system)

enum AppAppearance: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var label: String {
        switch self {
        case .system: return "Système"
        case .light:  return "Clair"
        case .dark:   return "Sombre"
        }
    }
    var icon: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light:  return "sun.max.fill"
        case .dark:   return "moon.fill"
        }
    }
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light:  return .light
        case .dark:   return .dark
        }
    }
}

enum KomptaBrand {
    static let primaryHex = "#047857"
    static let secondaryHex = "#065f46"
    static let limuleBlueHex = "#0b6fbd"
    static let limuleCyanHex = "#8ee7ff"
    static let limuleGoldHex = "#f5c542"
    static let limuleIcon = "limule.mark"

    static let primary = Color(hex: primaryHex) ?? .green
    static let secondary = Color(hex: secondaryHex) ?? .green
    static let limuleBlue = Color(hex: limuleBlueHex) ?? .cyan
    static let limuleCyan = Color(hex: limuleCyanHex) ?? .cyan
    static let limuleGold = Color(hex: limuleGoldHex) ?? .yellow
}

// MARK: - Quick appearance toggle (cycles system → light → dark)

struct AppearanceToggle: View {
    @AppStorage("appAppearance") private var appearanceRaw = AppAppearance.system.rawValue

    private var current: AppAppearance { AppAppearance(rawValue: appearanceRaw) ?? .system }

    var body: some View {
        Button {
            let all = AppAppearance.allCases
            let next = all[(all.firstIndex(of: current)! + 1) % all.count]
            withAnimation(.easeInOut(duration: 0.25)) { appearanceRaw = next.rawValue }
        } label: {
            Image(systemName: current.icon)
        }
        .help("Thème : \(current.label)")
    }
}

// MARK: - Color from hex string

extension Color {
    init?(hex: String) {
        var h = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if h.hasPrefix("#") { h = String(h.dropFirst()) }
        guard h.count == 6 else { return nil }
        var rgb: UInt64 = 0
        guard Scanner(string: h).scanHexInt64(&rgb) else { return nil }
        self.init(
            red:   Double((rgb & 0xFF0000) >> 16) / 255,
            green: Double((rgb & 0x00FF00) >> 8)  / 255,
            blue:  Double( rgb & 0x0000FF)         / 255
        )
    }
}
