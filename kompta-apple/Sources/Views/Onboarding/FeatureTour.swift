import SwiftUI

// ============================================================================
//  Visite guidée par Limule — l'assistant IA de KOMPTA anime lui-même la
//  découverte de l'app sous forme de conversation : bulle de dialogue,
//  indicateur "en train d'écrire" entre chaque message, icône du module
//  intégrée à la bulle. Affichée une fois (drapeau local), relançable depuis
//  Réglages. Passable à tout moment.
// ============================================================================

private struct TourBeat: Identifiable {
    let id = UUID()
    let icon: String
    let tint: Color
    let title: String
    let message: String
}

private let tourBeats: [TourBeat] = [
    .init(icon: "hand.wave.fill", tint: .orange, title: "Bienvenue",
          message: "Salut, moi c'est Limule 👋 Je suis le Grand Sage de KOMPTA — je connais vos chiffres et je vais vous montrer où tout se trouve. Ça prend une minute."),
    .init(icon: "chart.bar.fill", tint: .teal, title: "Tableau de bord",
          message: "Ici : trésorerie, encaissements, masse salariale et score TERAS en un coup d'œil. Le bouton « Résumé IA », c'est moi qui vous explique vos chiffres en clair."),
    .init(icon: "cart.fill", tint: .pink, title: "Caisse",
          message: "Pour encaisser une vente : produits, paiement (Mobile Money, espèces, carte), ticket automatique. Trois étapes, quelques secondes."),
    .init(icon: "doc.text.fill", tint: .indigo, title: "Facturation",
          message: "Factures et devis professionnels, suivi des paiements, relances automatiques des impayés. Export PDF prêt à envoyer."),
    .init(icon: "shippingbox.fill", tint: .orange, title: "Inventaire",
          message: "Votre stock en temps réel. Je vous préviens dès qu'il faut réapprovisionner — pas besoin de vérifier vous-même."),
    .init(icon: "arrow.left.arrow.right", tint: .teal, title: "Trésorerie",
          message: "Importez un relevé bancaire (PDF ou Excel) et je transcris les opérations à votre place. Le rapprochement se fait tout seul."),
    .init(icon: "building.columns.fill", tint: .green, title: "Comptabilité OHADA",
          message: "Plan comptable SYSCOHADA, écritures, balance, états financiers — conformes, sans que vous ayez à connaître toutes les règles par cœur."),
    .init(icon: "person.2.fill", tint: .green, title: "Employés & Paie",
          message: "Votre équipe, ses accès, ses bulletins, vos cycles de paie. Tout au même endroit."),
    .init(icon: "checklist", tint: .pink, title: "Tâches & projets",
          message: "Un tableau À faire / En cours / Terminé. Vous pouvez même me demander de créer une tâche directement depuis le chat."),
    .init(icon: "person.3.fill", tint: .indigo, title: "Groupes & Tontines",
          message: "Tontines, cotisations, dépenses partagées, projets collectifs — pensé pour votre communauté, pas juste votre entreprise."),
    .init(icon: "shield.checkered", tint: .red, title: "Intelligence TERAS",
          message: "Un score de santé de votre activité, avec des alertes et des recommandations concrètes. C'est ma spécialité."),
    .init(icon: "sparkles", tint: KomptaBrand.limuleBlue, title: "Parlez-moi",
          message: "Ventes, stocks, employés, finances — posez-moi vos questions, j'analyse vos vraies données. Et si je ne sais pas, je vous le dis plutôt que d'inventer."),
    .init(icon: "gearshape.fill", tint: .secondary, title: "C'est parti",
          message: "Thème, devise, rôles, méthodes d'encaissement… tout se règle dans Réglages, où vous pourrez me revoir à tout moment. Bonne route avec KOMPTA !"),
]

struct FeatureTour: View {
    let onClose: () -> Void

    @EnvironmentObject private var theme: CompanyTheme
    @State private var idx = 0
    @State private var isTyping = false
    @State private var revealedMessage = ""

    private var beat: TourBeat { tourBeats[idx] }
    private var isLast: Bool { idx == tourBeats.count - 1 }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button("Passer") { onClose() }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(.secondary).buttonStyle(.plain)
            }
            .padding(.horizontal, 20).padding(.top, 18)

            Spacer(minLength: 0)

            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 12) {
                    LimuleMark(size: 44, showAura: true)
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 6) {
                            Image(systemName: beat.icon)
                                .font(.caption.weight(.bold))
                                .foregroundStyle(beat.tint)
                            Text(beat.title)
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.secondary)
                                .textCase(.uppercase)
                        }

                        Group {
                            if isTyping {
                                TypingDots(tint: theme.primary)
                            } else {
                                Text(revealedMessage)
                                    .font(.body)
                                    .foregroundStyle(.primary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .background(Color.tourBubble)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                }
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: 460)
            .id(beat.id)
            .transition(.asymmetric(
                insertion: .move(edge: .trailing).combined(with: .opacity),
                removal: .move(edge: .leading).combined(with: .opacity)
            ))

            Spacer(minLength: 0)

            HStack(spacing: 6) {
                ForEach(tourBeats.indices, id: \.self) { i in
                    Capsule()
                        .fill(i == idx ? theme.primary : Color.secondary.opacity(0.25))
                        .frame(width: i == idx ? 22 : 7, height: 7)
                        .animation(.easeInOut(duration: 0.2), value: idx)
                }
            }
            .padding(.bottom, 18)

            HStack(spacing: 12) {
                if idx > 0 {
                    Button { withAnimation(.easeInOut(duration: 0.25)) { goTo(idx - 1) } } label: {
                        Label("Précédent", systemImage: "chevron.left").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered).controlSize(.large)
                }
                Button {
                    if isLast { onClose() } else { withAnimation(.easeInOut(duration: 0.25)) { goTo(idx + 1) } }
                } label: {
                    HStack(spacing: 6) {
                        Text(isLast ? "Commencer" : "Suivant")
                        if !isLast { Image(systemName: "chevron.right") }
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).controlSize(.large).tint(theme.primary)
            }
            .padding(.horizontal, 24).padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.tourBg.ignoresSafeArea())
        .onAppear { reveal(tourBeats[0].message, immediate: true) }
        #if os(iOS)
        .gesture(
            DragGesture(minimumDistance: 24)
                .onEnded { v in
                    if v.translation.width < -40, !isLast { withAnimation { goTo(idx + 1) } }
                    else if v.translation.width > 40, idx > 0 { withAnimation { goTo(idx - 1) } }
                }
        )
        #endif
    }

    private func goTo(_ next: Int) {
        idx = next
        reveal(tourBeats[next].message)
    }

    /// Simule Limule qui "tape" son message avant de le révéler — donne un
    /// vrai rythme de conversation plutôt qu'un slide statique.
    private func reveal(_ message: String, immediate: Bool = false) {
        revealedMessage = message
        if immediate { isTyping = false; return }
        isTyping = true
        Task {
            try? await Task.sleep(nanoseconds: 550_000_000)
            await MainActor.run { withAnimation(.easeInOut(duration: 0.2)) { isTyping = false } }
        }
    }
}

private struct TypingDots: View {
    let tint: Color
    @State private var beat = false

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(tint)
                    .frame(width: 7, height: 7)
                    .offset(y: beat ? (i == 1 ? -5 : -2) : 0)
                    .animation(.easeInOut(duration: 0.5).repeatForever().delay(Double(i) * 0.15), value: beat)
            }
        }
        .frame(height: 20)
        .onAppear { beat = true }
    }
}

private extension Color {
    static var tourBg: Color {
        #if os(iOS)
        Color(.systemBackground)
        #else
        Color(nsColor: .windowBackgroundColor)
        #endif
    }
    static var tourBubble: Color {
        #if os(iOS)
        Color(.secondarySystemBackground)
        #else
        Color(nsColor: .underPageBackgroundColor)
        #endif
    }
}
