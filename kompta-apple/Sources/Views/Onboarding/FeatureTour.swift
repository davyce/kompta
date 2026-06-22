import SwiftUI

// ============================================================================
//  Visite guidée des fonctions (carrousel paginé), affichée à la 1re connexion.
//  Équivalent natif de la visite guidée web : présente chaque module avec une
//  icône, un titre et une description. Affichée une fois (drapeau local),
//  relançable depuis Réglages. Passable à tout moment.
// ============================================================================

private struct TourCard: Identifiable {
    let id = UUID()
    let icon: String
    let tint: Color
    let title: String
    let body: String
}

private let tourCards: [TourCard] = [
    .init(icon: "hand.wave.fill", tint: .orange, title: "Bienvenue dans KOMPTA",
          body: "Votre ERP intelligent pour PME — CEMAC & SYSCOHADA. Voici un tour rapide de ce que vous pouvez faire. Vous pourrez le revoir à tout moment depuis Réglages."),
    .init(icon: "chart.bar.fill", tint: .teal, title: "Tableau de bord",
          body: "Suivez votre trésorerie, vos encaissements, votre masse salariale et votre score TERAS en un coup d'œil. Le bouton « Résumé IA » vous explique vos chiffres."),
    .init(icon: "cart.fill", tint: .pink, title: "Caisse (POS)",
          body: "Encaissez vos ventes en quelques secondes : sélection produits, paiement Mobile Money / espèces / carte, ticket automatique."),
    .init(icon: "doc.text.fill", tint: .indigo, title: "Facturation",
          body: "Créez des factures et devis professionnels, suivez les paiements, relancez les impayés. Export PDF prêt à envoyer."),
    .init(icon: "person.crop.circle.badge.checkmark", tint: .blue, title: "Clients",
          body: "Gérez votre fichier clients, l'historique d'achats et les points de fidélité."),
    .init(icon: "shippingbox.fill", tint: .orange, title: "Inventaire",
          body: "Suivez votre stock en temps réel, recevez des alertes de réapprovisionnement et organisez votre catalogue."),
    .init(icon: "arrow.left.arrow.right", tint: .teal, title: "Transactions & trésorerie",
          body: "Enregistrez vos mouvements, importez un relevé bancaire (PDF/Excel) et laissez l'IA transcrire les opérations."),
    .init(icon: "building.columns.fill", tint: .green, title: "Comptabilité OHADA",
          body: "Plan comptable SYSCOHADA, écritures, balance et états financiers conformes."),
    .init(icon: "person.2.fill", tint: .green, title: "Employés & Paie",
          body: "Constituez votre équipe, générez les accès, gérez les bulletins et lancez vos cycles de paie."),
    .init(icon: "checklist", tint: .pink, title: "Tâches & projets",
          body: "Organisez le travail en tableau (À faire / En cours / Terminé). L'IA peut créer des tâches depuis le chat et les canaux."),
    .init(icon: "bubble.left.and.bubble.right.fill", tint: .blue, title: "Canaux d'équipe",
          body: "Discutez en temps réel par canaux thématiques et transformez un message en tâche d'un geste."),
    .init(icon: "person.3.fill", tint: .indigo, title: "Groupes & Tontines",
          body: "Gérez tontines, cotisations, dépenses et projets collectifs avec votre communauté."),
    .init(icon: "doc.on.doc.fill", tint: .gray, title: "Documents",
          body: "Centralisez vos documents d'entreprise, classez-les et retrouvez-les instantanément."),
    .init(icon: "shield.checkered", tint: .red, title: "Intelligence TERAS",
          body: "Un score de santé de votre entreprise, des alertes et des recommandations concrètes."),
    .init(icon: "sparkles", tint: KomptaBrand.limuleBlue, title: "Limule, votre Grand Sage IA",
          body: "Posez vos questions sur vos ventes, stocks, employés ou finances : Limule analyse vos données et vous répond."),
    .init(icon: "gearshape.fill", tint: .secondary, title: "Tout est paramétrable",
          body: "Thème clair/sombre, devise, rôles & accès, méthodes d'encaissement, profil entreprise… le tout dans Réglages. Bonne route avec KOMPTA !"),
]

struct FeatureTour: View {
    let onClose: () -> Void

    @EnvironmentObject private var theme: CompanyTheme
    @State private var idx = 0

    private var card: TourCard { tourCards[idx] }
    private var isLast: Bool { idx == tourCards.count - 1 }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button("Passer") { onClose() }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(.secondary).buttonStyle(.plain)
            }
            .padding(.horizontal, 20).padding(.top, 18)

            Spacer(minLength: 0)

            VStack(spacing: 22) {
                ZStack {
                    Circle().fill(card.tint.opacity(0.15)).frame(width: 132, height: 132)
                    Image(systemName: card.icon)
                        .font(.system(size: 54))
                        .foregroundStyle(card.tint)
                        .symbolRenderingMode(.hierarchical)
                }
                .transition(.scale.combined(with: .opacity))
                .id(card.id)

                VStack(spacing: 12) {
                    Text(card.title)
                        .font(.title.bold())
                        .multilineTextAlignment(.center)
                    Text(card.body)
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 28)
                .id("txt-\(card.id)")
            }
            .frame(maxWidth: 460)

            Spacer(minLength: 0)

            // Indicateurs de page
            HStack(spacing: 6) {
                ForEach(tourCards.indices, id: \.self) { i in
                    Capsule()
                        .fill(i == idx ? theme.primary : Color.secondary.opacity(0.25))
                        .frame(width: i == idx ? 22 : 7, height: 7)
                        .animation(.easeInOut(duration: 0.2), value: idx)
                }
            }
            .padding(.bottom, 18)

            // Navigation
            HStack(spacing: 12) {
                if idx > 0 {
                    Button { withAnimation(.easeInOut(duration: 0.25)) { idx -= 1 } } label: {
                        Label("Précédent", systemImage: "chevron.left").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered).controlSize(.large)
                }
                Button {
                    if isLast { onClose() } else { withAnimation(.easeInOut(duration: 0.25)) { idx += 1 } }
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
        #if os(iOS)
        // Balayage horizontal pour changer de carte (geste naturel sur iPhone).
        .gesture(
            DragGesture(minimumDistance: 24)
                .onEnded { v in
                    if v.translation.width < -40, !isLast { withAnimation { idx += 1 } }
                    else if v.translation.width > 40, idx > 0 { withAnimation { idx -= 1 } }
                }
        )
        #endif
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
}
