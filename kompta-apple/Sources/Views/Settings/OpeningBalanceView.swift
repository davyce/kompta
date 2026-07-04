//
//  OpeningBalanceView.swift
//  Réglages → Solde d'ouverture : trésorerie de départ (caisse + comptes) quand
//  une entreprise démarre KOMPTA avec une activité déjà existante. Poste une
//  écriture comptable équilibrée (Dr Trésorerie / Cr Capital) via le backend.
//  Parité avec la webapp (OpeningBalancePanel.tsx).
//
import SwiftUI

private struct AccountOption: Identifiable {
    let key: String
    let paymentAccountId: Int?
    let label: String
    let currency: String
    var id: String { key }
}

struct OpeningBalanceView: View {
    @State private var accounts: [PaymentAccount] = []
    @State private var balances: [OpeningBalance] = []
    @State private var isLoading = true
    @State private var loadError: String?

    private var options: [AccountOption] {
        var opts = [AccountOption(key: "cash", paymentAccountId: nil, label: "Caisse (espèces)", currency: "XAF")]
        opts += accounts.map { AccountOption(key: String($0.id), paymentAccountId: $0.id, label: $0.label, currency: $0.currency) }
        return opts
    }

    private func existing(for paymentAccountId: Int?) -> OpeningBalance? {
        balances.first { $0.payment_account_id == paymentAccountId }
    }

    var body: some View {
        Form {
            Section {
                Text("Renseignez la trésorerie déjà présente (caisse et comptes) au moment où vous démarrez KOMPTA, pour partir du bon montant plutôt que de zéro. Modifiable à tout moment.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if isLoading {
                Section { HStack { Spacer(); ProgressView(); Spacer() } }
            } else if let loadError {
                Section { Text(loadError).foregroundStyle(.red).font(.footnote) }
            } else {
                ForEach(options) { opt in
                    OpeningBalanceRow(option: opt.label, currency: opt.currency,
                                       paymentAccountId: opt.paymentAccountId,
                                       existing: existing(for: opt.paymentAccountId),
                                       onSaved: { await reload() })
                }
            }
        }
        .navigationTitle("Solde d'ouverture")
        .task { await reload() }
    }

    private func reload() async {
        isLoading = true; loadError = nil
        do {
            async let acc = APIClient.shared.paymentAccounts()
            async let bal = APIClient.shared.openingBalances()
            accounts = try await acc
            balances = try await bal
        } catch {
            loadError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        isLoading = false
    }
}

private struct OpeningBalanceRow: View {
    let option: String
    let currency: String
    let paymentAccountId: Int?
    let existing: OpeningBalance?
    let onSaved: () async -> Void

    @State private var editing = false
    @State private var amountText = ""
    @State private var date = Date()
    @State private var label = "Solde d'ouverture"
    @State private var saving = false
    @State private var error: String?

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f
    }()

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text(option).font(.headline)
                if let existing {
                    Text("Actuel : \(existing.amount.formatted()) \(currency) · \(existing.date)")
                        .font(.subheadline).foregroundStyle(.secondary)
                } else {
                    Text("Aucun solde d'ouverture saisi").font(.subheadline).foregroundStyle(.secondary)
                }
            }
            if editing {
                TextField("Montant (\(currency))", text: $amountText)
                    #if os(iOS)
                    .keyboardType(.decimalPad)
                    #endif
                DatePicker("Date", selection: $date, displayedComponents: .date)
                TextField("Libellé", text: $label)
                if let error { Text(error).foregroundStyle(.red).font(.caption) }
                HStack {
                    Button("Annuler") { editing = false }
                    Spacer()
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text("Enregistrer").bold() }
                    }
                    .disabled(saving)
                }
            } else {
                Button(existing == nil ? "Ajouter" : "Modifier") {
                    amountText = existing.map { String($0.amount) } ?? ""
                    date = existing.flatMap { Self.dateFormatter.date(from: $0.date) } ?? Date()
                    label = existing?.label ?? "Solde d'ouverture"
                    editing = true
                }
            }
        }
    }

    private func save() async {
        guard let amount = Double(amountText.replacingOccurrences(of: ",", with: ".")), amount >= 0 else {
            error = "Montant invalide"
            return
        }
        saving = true; error = nil
        let payload = OpeningBalancePayload(
            payment_account_id: paymentAccountId,
            amount: amount,
            entry_date: Self.dateFormatter.string(from: date),
            label: label
        )
        do {
            _ = try await APIClient.shared.setOpeningBalance(payload)
            editing = false
            await onSaved()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        saving = false
    }
}
