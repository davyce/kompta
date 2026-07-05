//
//  SubscriptionPurchaseView.swift
//  Écran d'achat d'abonnement — passe par StoreKit 2 (Apple In-App Purchase),
//  jamais par un lien externe / paiement web, conformément à la demande
//  d'App Review (Guideline 3.1.1 / 2.1(b)) : l'achat doit rester DANS l'app
//  et passer par le mécanisme d'achat intégré d'Apple.
//
#if os(iOS)
import SwiftUI
import StoreKit

/// Nom affiché d'un plan à partir de son code interne backend.
/// Garde en cohérence avec `DEFAULT_PLANS` dans
/// `backend/app/services/subscriptions.py` (Standard/Musala/Mokonzi).
func subscriptionPlanDisplayName(_ code: String) -> String {
    switch code {
    case "starter": return "Standard"
    case "pro": return "Musala"
    case "business": return "Mokonzi"
    default: return code.capitalized
    }
}

struct SubscriptionPurchaseView: View {
    @EnvironmentObject private var ent: EntitlementsManager
    @StateObject private var store = StoreKitManager.shared
    @State private var purchasingProductID: String?
    @State private var isActivatingStandard = false
    @State private var errorMessage: String?
    @State private var successMessage: String?

    var body: some View {
        List {
            if let e = ent.entitlements {
                Section {
                    HStack {
                        Text("Offre actuelle")
                        Spacer()
                        Text(e.plan_code.isEmpty ? (e.trialing ? "Essai gratuit" : "Aucune") : subscriptionPlanDisplayName(e.plan_code))
                            .foregroundStyle(.secondary)
                    }
                    if e.trialing {
                        Text("Essai Mokonzi offert : \(e.trial_days_left) jour(s) restant(s), puis retour automatique en Standard.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }

            Section {
                standardRow
                if store.isLoadingProducts {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if store.products.isEmpty {
                    Text("Aucune offre payante disponible pour le moment.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(store.products, id: \.id) { product in
                        productRow(product)
                    }
                }
            } header: {
                Text("Offres disponibles")
            } footer: {
                Text("L'achat est traité par l'App Store (Apple) — votre carte bancaire liée à votre identifiant Apple sera débitée, pas votre entreprise directement. Le forfait Standard est gratuit et s'active immédiatement.")
            }

            Section {
                Button {
                    Task { await restorePurchases() }
                } label: {
                    Label("Restaurer mes achats", systemImage: "arrow.clockwise")
                }
            }

            if let errorMessage {
                Section { Text(errorMessage).foregroundStyle(.red).font(.footnote) }
            }
            if let successMessage {
                Section { Text(successMessage).foregroundStyle(.green).font(.footnote) }
            }
        }
        .navigationTitle("Abonnement")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await store.loadProducts()
        }
    }

    @ViewBuilder
    private var standardRow: some View {
        let isCurrent = ent.entitlements?.plan_code == "starter" && ent.entitlements?.trialing != true
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Standard").font(.body.weight(.semibold))
                Text("Gratuit — POS/Caisse, facturation TVA, 2 utilisateurs.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Spacer()
            if isCurrent {
                Text("Actuel").font(.footnote).foregroundStyle(.secondary)
            } else if isActivatingStandard {
                ProgressView()
            } else {
                Button("Gratuit") {
                    Task { await activateStandard() }
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func productRow(_ product: StoreKit.Product) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(product.displayName).font(.body.weight(.semibold))
                Text(product.description).font(.footnote).foregroundStyle(.secondary)
            }
            Spacer()
            if purchasingProductID == product.id {
                ProgressView()
            } else {
                Button(product.displayPrice) {
                    Task { await purchase(product) }
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(.vertical, 4)
    }

    private func purchase(_ product: StoreKit.Product) async {
        errorMessage = nil
        successMessage = nil
        purchasingProductID = product.id
        defer { purchasingProductID = nil }
        do {
            let result = try await store.purchase(product)
            successMessage = "Abonnement activé (offre « \(subscriptionPlanDisplayName(result.plan_code)) »)."
            await ent.load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func activateStandard() async {
        errorMessage = nil
        successMessage = nil
        isActivatingStandard = true
        defer { isActivatingStandard = false }
        do {
            _ = try await APIClient.shared.subscriptionCheckout(planCode: "starter", method: "card")
            successMessage = "Offre Standard activée."
            await ent.load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func restorePurchases() async {
        errorMessage = nil
        successMessage = nil
        await store.restorePurchases()
        successMessage = "Achats restaurés."
    }
}
#endif
