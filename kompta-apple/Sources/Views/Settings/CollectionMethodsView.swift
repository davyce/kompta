//
//  CollectionMethodsView.swift
//  Réglages → Encaissement : méthodes de paiement déclarées par l'entreprise
//  (espèces, MoMo MTN/Airtel/Moov, virement, carte). L'argent va direct chez
//  l'entreprise — KOMPTA ne transite pas les fonds. Parité avec la webapp.
//
import SwiftUI

struct CollectionMethodsView: View {
    @StateObject private var loader = Loadable<CollectionMethodsResponse>()

    private static let providers: [ProviderDef] = [
        ProviderDef("cash", "Espèces", .none),
        ProviderDef("momo_mtn", "MTN MoMo", .merchant),
        ProviderDef("momo_airtel", "Airtel Money", .merchant),
        ProviderDef("momo_moov", "Moov Money", .merchant),
        ProviderDef("bank_transfer", "Virement bancaire", .bank),
        ProviderDef("card_stripe", "Carte (Visa/Mastercard)", .card),
    ]

    var body: some View {
        Form {
            if let resp = loader.value {
                if !resp.can_collect {
                    Section {
                        Label("Aucune méthode active — configurez-en une pour pouvoir encaisser vos ventes et factures.",
                              systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote).foregroundStyle(.orange)
                    }
                }
                ForEach(Self.providers) { def in
                    ProviderSection(def: def,
                                    method: resp.methods.first { $0.provider == def.key },
                                    onChanged: { await reload() })
                }
            } else if loader.isLoading {
                Section { HStack { Spacer(); ProgressView(); Spacer() } }
            } else if let e = loader.error {
                Section { Text(e).foregroundStyle(.red).font(.footnote) }
            }
        }
        .navigationTitle("Encaissement")
        .task { await reload() }
    }

    private func reload() async {
        await loader.load { try await APIClient.shared.collectionMethods() }
    }
}

private enum ProviderKind { case none, merchant, bank, card }

private struct ProviderDef: Identifiable {
    let key: String, label: String, kind: ProviderKind
    var id: String { key }
    init(_ key: String, _ label: String, _ kind: ProviderKind) { self.key = key; self.label = label; self.kind = kind }
}

private struct ProviderSection: View {
    let def: ProviderDef
    let method: CollectionMethod?
    let onChanged: () async -> Void

    @State private var enabled = false
    @State private var merchant = ""
    @State private var account = ""
    @State private var bankName = ""
    @State private var bankAccount = ""
    @State private var instructions = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        Section {
            switch def.kind {
            case .none:
                Text("Paiement en liquide au comptoir. Aucun frais.")
                    .font(.footnote).foregroundStyle(.secondary)
                actionRow
            case .merchant:
                TextField("Code / n° marchand", text: $merchant)
                TextField("Nom du compte (ex: KOMPTA SARL)", text: $account)
                TextField("Consignes au client (facultatif)", text: $instructions)
                actionRow
            case .bank:
                TextField("Nom de la banque", text: $bankName)
                TextField("RIB / IBAN", text: $bankAccount)
                TextField("Consignes au client (facultatif)", text: $instructions)
                actionRow
            case .card:
                Text("Encaissement en ligne par carte. La validation (paiement-test) se fait depuis la version web.")
                    .font(.footnote).foregroundStyle(.secondary)
                if method?.verified == true {
                    Label("Carte validée", systemImage: "checkmark.seal.fill").foregroundStyle(.green)
                } else {
                    Label("Non validée", systemImage: "xmark.seal").foregroundStyle(.secondary)
                }
            }
            if let error { Text(error).foregroundStyle(.red).font(.caption) }
        } header: {
            HStack {
                Text(def.label)
                if method?.verified == true && method?.enabled == true {
                    Spacer()
                    Label("Activé", systemImage: "checkmark.seal.fill")
                        .labelStyle(.titleAndIcon).foregroundStyle(.green).font(.caption)
                }
            }
        }
        .onAppear(perform: sync)
    }

    @ViewBuilder private var actionRow: some View {
        HStack {
            Toggle("Activer", isOn: $enabled)
            Spacer()
            Button {
                Task { await save() }
            } label: {
                if saving { ProgressView() } else { Text("Enregistrer").bold() }
            }
            .disabled(saving)
        }
    }

    private func sync() {
        guard let m = method else { return }
        enabled = m.enabled; merchant = m.merchant_number; account = m.account_name
        bankName = m.bank_name; bankAccount = m.bank_account; instructions = m.instructions
    }

    private func save() async {
        saving = true; error = nil
        let payload = CollectionMethodPayload(
            provider: def.key, label: def.label, enabled: enabled,
            merchant_number: merchant, account_name: account,
            bank_name: bankName, bank_account: bankAccount, instructions: instructions)
        do {
            _ = try await APIClient.shared.upsertCollectionMethod(payload)
            await onChanged()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        saving = false
    }
}
