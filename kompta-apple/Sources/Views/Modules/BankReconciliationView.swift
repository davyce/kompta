import SwiftUI
import UniformTypeIdentifiers

// ============================================================================
//  Rapprochement bancaire — importe un relevé CSV, rapproche automatiquement
//  avec les transactions existantes, laisse confirmer/ignorer/créer au cas
//  par cas. Porte côté iOS/Mac le module web BankReconciliationPage.tsx.
// ============================================================================

struct BankReconciliationView: View {
    @StateObject private var accountsState = Loadable<[PaymentAccount]>()
    @State private var selectedAccountId: Int?
    @State private var picking = false
    @State private var importing = false
    @State private var current: BankStatementImport?
    @State private var busyLineId: Int?
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section("Compte bancaire") {
                if let accounts = accountsState.value {
                    if accounts.isEmpty {
                        Text("Aucun compte de paiement configuré.").foregroundStyle(.secondary)
                    } else {
                        Picker("Compte", selection: $selectedAccountId) {
                            Text("Choisir…").tag(Int?.none)
                            ForEach(accounts) { a in Text(a.label).tag(Int?.some(a.id)) }
                        }
                    }
                } else {
                    ProgressView()
                }

                Button {
                    picking = true
                } label: {
                    if importing { ProgressView() } else { Label("Importer un relevé (CSV)", systemImage: "square.and.arrow.down.on.square") }
                }
                .disabled(selectedAccountId == nil || importing)
            }

            if let imp = current {
                Section {
                    HStack(spacing: 8) {
                        StatusPill(text: "Rapproché: \(imp.matched_count)", colorName: "green")
                        StatusPill(text: "Suggéré: \(imp.suggested_count)", colorName: "orange")
                        StatusPill(text: "Non rapproché: \(imp.unmatched_count)", colorName: "red")
                    }
                } header: {
                    Text(imp.filename)
                }

                if imp.lines.isEmpty {
                    Text("Aucune ligne dans ce relevé.").foregroundStyle(.secondary)
                } else {
                    Section("Lignes") {
                        ForEach(imp.lines) { line in
                            StatementLineRow(
                                line: line,
                                busy: busyLineId == line.id,
                                onConfirm: { Task { await confirm(line) } },
                                onCreate: { Task { await createTxn(line) } },
                                onIgnore: { Task { await ignore(line) } }
                            )
                        }
                    }
                }
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
        .navigationTitle("Rapprochement bancaire")
        .task { await accountsState.load { try await APIClient.shared.paymentAccounts() } }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.commaSeparatedText, .plainText],
                      allowsMultipleSelection: false) { result in
            if case let .success(urls) = result, let url = urls.first { Task { await importFile(url) } }
        }
        .alert("Erreur", isPresented: .constant(errorMessage != nil), actions: {
            Button("OK") { errorMessage = nil }
        }, message: { Text(errorMessage ?? "") })
    }

    private func importFile(_ url: URL) async {
        guard let accountId = selectedAccountId else { return }
        importing = true
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            current = try await APIClient.shared.importBankStatement(accountId: accountId, fileData: data, fileName: url.lastPathComponent)
        } catch {
            errorMessage = Loadable<Void>.friendlyMessage(for: error)
        }
        importing = false
    }

    private func reload() async {
        guard let importId = current?.import_id else { return }
        current = try? await APIClient.shared.getBankStatementImport(importId)
    }

    private func confirm(_ line: BankStatementLine) async {
        guard let candidateId = line.candidate_transaction?.id else { return }
        busyLineId = line.id
        do {
            _ = try await APIClient.shared.confirmStatementLine(line.id, transactionId: candidateId)
            await reload()
        } catch { errorMessage = Loadable<Void>.friendlyMessage(for: error) }
        busyLineId = nil
    }

    private func createTxn(_ line: BankStatementLine) async {
        busyLineId = line.id
        do {
            _ = try await APIClient.shared.createTransactionFromLine(line.id)
            await reload()
        } catch { errorMessage = Loadable<Void>.friendlyMessage(for: error) }
        busyLineId = nil
    }

    private func ignore(_ line: BankStatementLine) async {
        busyLineId = line.id
        do {
            _ = try await APIClient.shared.ignoreStatementLine(line.id)
            await reload()
        } catch { errorMessage = Loadable<Void>.friendlyMessage(for: error) }
        busyLineId = nil
    }
}

private struct StatementLineRow: View {
    let line: BankStatementLine
    let busy: Bool
    let onConfirm: () -> Void
    let onCreate: () -> Void
    let onIgnore: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(line.label).font(.subheadline.bold()).lineLimit(1)
                Spacer()
                Text(fcfa(line.amount)).font(.subheadline.bold())
            }
            HStack(spacing: 8) {
                Text(shortDate(line.date)).font(.caption2).foregroundStyle(.secondary)
                StatusPill(text: BANK_LINE_STATUS_LABEL[line.match_status] ?? line.match_status,
                           colorName: BANK_LINE_STATUS_COLOR[line.match_status] ?? "gray")
            }
            if line.match_status == "suggested", let c = line.candidate_transaction {
                Text("Candidat : \(c.label) · \(fcfa(c.amount))")
                    .font(.caption2).foregroundStyle(.orange)
            }
            HStack(spacing: 8) {
                if busy {
                    ProgressView().controlSize(.small)
                } else if line.match_status == "suggested" {
                    Button("Confirmer", action: onConfirm)
                        .buttonStyle(.borderedProminent).tint(.green).font(.caption.bold())
                } else if line.match_status == "unmatched" {
                    Button("Créer la transaction", action: onCreate)
                        .buttonStyle(.borderedProminent).tint(.green).font(.caption.bold())
                    Button("Ignorer", action: onIgnore)
                        .buttonStyle(.bordered).font(.caption.bold())
                }
            }
        }
        .padding(.vertical, 2)
    }
}
