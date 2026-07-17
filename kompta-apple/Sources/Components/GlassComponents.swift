import SwiftUI

// MARK: - Liquid Glass Card
// Falls back to .ultraThinMaterial on iOS < 26 / macOS < 26

struct GlassCard<Content: View>: View {
    var padding: CGFloat = 16
    var cornerRadius: CGFloat = 20
    var tint: Color = .clear
    @ViewBuilder var content: () -> Content

    @EnvironmentObject private var theme: CompanyTheme

    var body: some View {
        content()
            .padding(padding)
            .background {
                if #available(iOS 26.0, macOS 26.0, *), theme.useLiquidGlass {
                    let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    if tint == .clear {
                        shape.fill(.clear).glassEffect(.regular, in: shape)
                    } else {
                        shape.fill(.clear).glassEffect(.regular.tint(tint), in: shape)
                    }
                } else {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.ultraThinMaterial)
                }
            }
    }
}

// MARK: - Kompta branded button

struct KomptaButton: View {
    let label: String
    var icon: String? = nil
    var style: Style = .filled
    var isLoading = false
    var action: () async -> Void

    enum Style { case filled, glass, outlined, destructive }

    @EnvironmentObject private var theme: CompanyTheme

    var body: some View {
        Button { Task { await action() } } label: {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView().tint(style == .filled ? .white : theme.primary)
                } else {
                    if let icon {
                        BrandedIcon(name: icon, tint: style == .filled ? .white : theme.primary, size: 17)
                    }
                    Text(label).fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(bgView)
            .foregroundStyle(fg)
            .clipShape(RoundedRectangle(cornerRadius: theme.buttonRadius, style: .continuous))
            .overlay {
                if style == .outlined {
                    RoundedRectangle(cornerRadius: theme.buttonRadius, style: .continuous)
                        .strokeBorder(theme.primary, lineWidth: 1.5)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
    }

    @ViewBuilder private var bgView: some View {
        switch style {
        case .filled:
            theme.primary
        case .glass:
            if #available(iOS 26.0, macOS 26.0, *), theme.useLiquidGlass {
                Color.clear.glassEffect(
                    .regular.tint(theme.primary.opacity(0.25)),
                    in: RoundedRectangle(cornerRadius: theme.buttonRadius, style: .continuous)
                )
            } else {
                theme.primary.opacity(0.15)
            }
        case .outlined:
            Color.clear
        case .destructive:
            Color.red
        }
    }

    private var fg: Color {
        switch style {
        case .filled, .destructive: .white
        case .glass, .outlined:     theme.primary
        }
    }
}

// MARK: - Metric card

struct MetricCard: View {
    let title: String
    let value: String
    let icon: String
    var color: Color = .green
    var subtitle: String? = nil

    @EnvironmentObject private var theme: CompanyTheme

    var body: some View {
        GlassCard(padding: 16, cornerRadius: theme.cardRadius) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    ZStack {
                        Circle().fill(color.opacity(0.15)).frame(width: 36, height: 36)
                        BrandedIcon(name: icon, tint: color, size: 15)
                    }
                    Spacer()
                }
                Text(value)
                    .font(.title2.bold())
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let sub = subtitle {
                    Text(sub).font(.caption2).foregroundStyle(color)
                }
            }
        }
    }
}

// MARK: - Shimmer placeholder

struct ShimmerBox: View {
    var height: CGFloat = 110
    var cornerRadius: CGFloat = 18
    @State private var phase: CGFloat = -1

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(.secondary.opacity(0.15))
            .frame(height: height)
            .overlay(
                GeometryReader { geo in
                    LinearGradient(
                        stops: [
                            .init(color: .clear, location: 0),
                            .init(color: .white.opacity(0.25), location: 0.5),
                            .init(color: .clear, location: 1)
                        ],
                        startPoint: .init(x: phase, y: 0),
                        endPoint:   .init(x: phase + 1, y: 0)
                    )
                }
            )
            .clipped()
            .onAppear {
                withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) { phase = 1 }
            }
    }
}

// MARK: - Avatar initials circle

struct AvatarView: View {
    let initials: String
    var size: CGFloat = 40
    var color: Color = .green

    var body: some View {
        ZStack {
            Circle().fill(color.opacity(0.15))
            Text(initials)
                .font(.system(size: size * 0.35, weight: .bold))
                .foregroundStyle(color)
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Branded icons

struct BrandedIcon: View {
    let name: String
    var tint: Color
    var size: CGFloat = 20

    var body: some View {
        if name == KomptaBrand.limuleIcon {
            LimuleMark(size: size, showAura: false)
        } else {
            Image(systemName: name)
                .font(.system(size: size, weight: .semibold))
                .foregroundStyle(tint)
        }
    }
}

/// Le vrai logo KOMPTA (marque vectorielle — net à toute taille, contrairement
/// à une image raster). Utilisé sur l'écran de connexion et le splash screen.
struct KomptaLogoMark: View {
    var size: CGFloat
    var cornerRadius: CGFloat

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(KomptaBrand.primary)
            Capsule()
                .fill(.white)
                .frame(width: size * 0.13, height: size * 0.58)
                .offset(x: -size * 0.08)
            Capsule()
                .fill(.white)
                .frame(width: size * 0.13, height: size * 0.39)
                .rotationEffect(.degrees(42))
                .offset(x: size * 0.09, y: -size * 0.12)
            Capsule()
                .fill(.white)
                .frame(width: size * 0.13, height: size * 0.39)
                .rotationEffect(.degrees(-42))
                .offset(x: size * 0.09, y: size * 0.12)
            Circle()
                .fill(KomptaBrand.limuleGold)
                .frame(width: size * 0.18, height: size * 0.18)
                .offset(x: -size * 0.08, y: -size * 0.02)
        }
        .frame(width: size, height: size)
    }
}

struct LimuleMark: View {
    var size: CGFloat = 32
    var showAura = true
    @State private var pulse = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if showAura {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [KomptaBrand.limuleCyan.opacity(0.48), KomptaBrand.limuleBlue.opacity(0.12), .clear],
                            center: .topLeading,
                            startRadius: 2,
                            endRadius: size * 0.78
                        )
                    )
                    .scaleEffect(pulse ? 1.08 : 0.95)
                    .opacity(pulse ? 0.95 : 0.65)
            }

            Circle()
                .strokeBorder(KomptaBrand.limuleBlue.opacity(showAura ? 0.28 : 0.18), lineWidth: max(1, size * 0.025))
                .background(Circle().fill(showAura ? Color.white.opacity(0.08) : Color.clear))

            Image("LimuleAvatar")
                .resizable()
                .renderingMode(.original)
                .scaledToFit()
                .frame(width: size * 0.76, height: size * 0.76)
                .shadow(color: KomptaBrand.limuleBlue.opacity(0.22), radius: size * 0.12, x: 0, y: size * 0.08)
        }
        .frame(width: size, height: size)
        .accessibilityLabel("Limule")
        .onAppear {
            guard showAura, !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.9).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }
}

/// Petites bulles de réflexion qui grossissent en cascade autour de Limule —
/// utilisées par LimuleRestrictedView pour un effet "Limule réfléchit"
/// distinct du simple halo pulsant de LimuleMark.
private struct LimuleThinkingBubbles: View {
    @State private var grown: [Bool] = [false, false, false]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let bubbles: [(size: CGFloat, offset: CGSize, delay: Double)] = [
        (10, CGSize(width: 34, height: -30), 0.0),
        (7,  CGSize(width: 48, height: -14), 0.25),
        (5,  CGSize(width: 58, height: 2),   0.5),
    ]

    var body: some View {
        ZStack {
            ForEach(bubbles.indices, id: \.self) { i in
                Circle()
                    .fill(KomptaBrand.limuleBlue.opacity(0.35))
                    .frame(width: bubbles[i].size, height: bubbles[i].size)
                    .offset(bubbles[i].offset)
                    .scaleEffect(grown[i] ? 1.0 : 0.4)
                    .opacity(grown[i] ? 0.9 : 0.3)
            }
        }
        .onAppear {
            guard !reduceMotion else { grown = [true, true, true]; return }
            for i in bubbles.indices {
                withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true).delay(bubbles[i].delay)) {
                    grown[i] = true
                }
            }
        }
    }
}

/// Écran doux affiché à la place d'une erreur brute quand l'API refuse
/// l'accès pour une raison d'abonnement (402) ou de permission (403) —
/// remplace le triangle d'avertissement générique par Limule qui "réfléchit",
/// avec un message et une action adaptés à la cause du blocage.
struct LimuleRestrictedView: View {
    enum Kind {
        case subscription
        case permission

        /// nil si le code HTTP ne correspond à aucun des deux cas gérés ici
        /// (l'appelant garde alors l'erreur générique existante).
        init?(httpStatusCode: Int?) {
            switch httpStatusCode {
            case 402: self = .subscription
            case 403: self = .permission
            default: return nil
            }
        }

        var icon: String {
            switch self {
            case .subscription: return "lock.fill"
            case .permission: return "hand.raised.fill"
            }
        }
        var title: String {
            switch self {
            case .subscription: return "Fonctionnalité non incluse dans votre offre"
            case .permission: return "Accès restreint"
            }
        }
        var fallbackMessage: String {
            switch self {
            case .subscription: return "Cette section fait partie d'une offre supérieure. Passez à une offre supérieure dans Réglages → Abonnement pour la débloquer."
            case .permission: return "Vous n'avez pas les autorisations nécessaires pour accéder à cette section. Contactez un administrateur de votre entreprise si vous pensez qu'il s'agit d'une erreur."
            }
        }
    }

    let kind: Kind
    /// Message serveur détaillé (facultatif) — affiché à la place du message
    /// générique quand présent et non technique.
    var detail: String? = nil

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                LimuleThinkingBubbles()
                LimuleMark(size: 64, showAura: true)
            }
            .padding(.top, 4)

            VStack(spacing: 8) {
                Label(kind.title, systemImage: kind.icon)
                    .font(.headline)
                    .foregroundStyle(KomptaBrand.limuleBlue)
                Text(detail?.isEmpty == false ? detail! : kind.fallbackMessage)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if kind == .subscription {
                Button {
                    NotificationCenter.default.post(name: .komptaNavigate, object: "settings")
                } label: {
                    Label("Voir les offres", systemImage: "sparkles")
                }
                .buttonStyle(.borderedProminent)
                .tint(KomptaBrand.limuleBlue)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
    }
}
