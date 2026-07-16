import SwiftUI

// ============================================================================
//  CRM léger — pipeline d'opportunités (prospects → devis → facture).
//  Porte côté iOS/Mac le module web CrmPage.tsx (mêmes étapes, même API).
// ============================================================================

struct CrmView: View {
    @StateObject private var state = Loadable<[Opportunity]>()
    @State private var summary: PipelineSummaryRead?
    @State private var showNew = false
    @State private var busyId: Int?
    @State private var errorMessage: String?

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune opportunité", emptyIcon: "target", reload: load) { opportunities in
            List {
                if let summary {
                    Section("Pipeline") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(summary.stages) { s in
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(CRM_STAGE_LABEL[s.stage] ?? s.stage)
                                            .font(.caption2.bold()).foregroundStyle(.secondary)
                                        Text("\(s.count)").font(.title3.bold())
                                        Text(compactFCFA(Double(s.total_estimated_amount_cents) / 100))
                                            .font(.caption2).foregroundStyle(.secondary)
                                    }
                                    .padding(10)
                                    .frame(minWidth: 92, alignment: .leading)
                                    .background(.quaternary.opacity(0.4))
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                                }
                            }
                        }
                        .listRowInsets(EdgeInsets())
                        .padding(10)
                    }
                }

                ForEach(CRM_STAGES, id: \.self) { stage in
                    let items = opportunities.filter { $0.stage == stage }
                    if !items.isEmpty {
                        Section(CRM_STAGE_LABEL[stage] ?? stage) {
                            ForEach(items) { opp in
                                OpportunityRow(
                                    opportunity: opp,
                                    busy: busyId == opp.id,
                                    onStageChange: { newStage in Task { await changeStage(opp, to: newStage) } },
                                    onConvert: { Task { await convert(opp) } },
                                    onDelete: { Task { await delete(opp) } }
                                )
                            }
                        }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("CRM")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showNew = true } label: { Image(systemName: "plus").accessibilityLabel("Nouveau") }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { OpportunityFormView { await load() } }
        .alert("Erreur", isPresented: .constant(errorMessage != nil), actions: {
            Button("OK") { errorMessage = nil }
        }, message: { Text(errorMessage ?? "") })
    }

    private func load() async {
        await state.load { try await APIClient.shared.crmOpportunities() }
        summary = try? await APIClient.shared.crmPipelineSummary()
    }

    private func changeStage(_ opp: Opportunity, to stage: String) async {
        busyId = opp.id
        do {
            _ = try await APIClient.shared.updateOpportunityStage(opp.id, stage: stage)
            await load()
        } catch { errorMessage = Loadable<Void>.friendlyMessage(for: error) }
        busyId = nil
    }

    private func convert(_ opp: Opportunity) async {
        busyId = opp.id
        do {
            _ = try await APIClient.shared.convertOpportunityToInvoice(opp.id)
            await load()
        } catch { errorMessage = Loadable<Void>.friendlyMessage(for: error) }
        busyId = nil
    }

    private func delete(_ opp: Opportunity) async {
        busyId = opp.id
        do {
            try await APIClient.shared.deleteOpportunity(opp.id)
            await load()
        } catch { errorMessage = Loadable<Void>.friendlyMessage(for: error) }
        busyId = nil
    }
}

private struct OpportunityRow: View {
    let opportunity: Opportunity
    let busy: Bool
    let onStageChange: (String) -> Void
    let onConvert: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(opportunity.title).font(.subheadline.bold())
                Spacer()
                Text(fcfa(Double(opportunity.estimated_amount_cents) / 100)).font(.subheadline.bold())
            }
            if !opportunity.contact_name.isEmpty {
                Text(opportunity.contact_name).font(.caption).foregroundStyle(.secondary)
            }
            HStack(spacing: 8) {
                StatusPill(text: CRM_STAGE_LABEL[opportunity.stage] ?? opportunity.stage, colorName: CRM_STAGE_COLOR[opportunity.stage] ?? "gray")
                Text("\(opportunity.probability_percent)%").font(.caption2).foregroundStyle(.secondary)
                Spacer()
                if busy { ProgressView().controlSize(.small) }
            }
            HStack(spacing: 8) {
                Menu {
                    ForEach(CRM_STAGES, id: \.self) { s in
                        Button(CRM_STAGE_LABEL[s] ?? s) { onStageChange(s) }
                    }
                } label: {
                    Label("Changer l'étape", systemImage: "arrow.left.arrow.right")
                        .font(.caption.bold())
                }
                .buttonStyle(.bordered)
                .disabled(busy)

                if opportunity.stage == "gagne" {
                    Button {
                        onConvert()
                    } label: {
                        Label("Convertir en facture", systemImage: "doc.text")
                            .font(.caption.bold())
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .disabled(busy)
                }
            }
        }
        .padding(.vertical, 2)
        .swipeActions(edge: .trailing) {
            Button("Supprimer", role: .destructive) { onDelete() }
        }
    }
}

struct OpportunityFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var contactName = ""
    @State private var contactPhone = ""
    @State private var contactEmail = ""
    @State private var estimatedAmount = ""
    @State private var probability = "20"
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Opportunité") {
                    TextField("Titre *", text: $title)
                    TextField("Contact", text: $contactName)
                    TextField("Téléphone", text: $contactPhone)
                    TextField("Email", text: $contactEmail)
                }
                Section("Estimation") {
                    TextField("Montant estimé (FCFA)", text: $estimatedAmount)
                        #if os(iOS)
                        .keyboardType(.numberPad)
                        #endif
                    TextField("Probabilité (%)", text: $probability)
                        #if os(iOS)
                        .keyboardType(.numberPad)
                        #endif
                }
            }
            .navigationTitle("Nouvelle opportunité")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }.disabled(title.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        do {
            _ = try await APIClient.shared.createOpportunity(OpportunityCreatePayload(
                title: title,
                client_id: nil,
                contact_name: contactName,
                contact_phone: contactPhone,
                contact_email: contactEmail,
                stage: "nouveau",
                estimated_amount_cents: Int((Double(estimatedAmount) ?? 0) * 100),
                probability_percent: Int(probability) ?? 20,
                expected_close_date: nil,
                notes: ""
            ))
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}
