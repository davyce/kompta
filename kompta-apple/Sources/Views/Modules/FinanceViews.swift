import SwiftUI
import Charts

// ============================================================================
//  Wave 2 — Finance avancée
//  Budget · Investissements · Comptes de paiement · Teras (intelligence) · Déclarations
// ============================================================================

// MARK: - Budget

private struct BudgetBarChart: View {
    let items: [BudgetSummaryItem]

    private struct Bar: Identifiable {
        let id = UUID(); let cat: String; let type: String; let kValue: Double
    }
    private func shortName(_ n: String) -> String { n.count > 10 ? String(n.prefix(9)) + "…" : n }
    private var data: [Bar] {
        items.prefix(6).flatMap { i -> [Bar] in [
            Bar(cat: shortName(i.name), type: "Prévu",   kValue: i.planned_amount / 1_000),
            Bar(cat: shortName(i.name), type: "Dépensé", kValue: i.spent / 1_000)
        ]}
    }

    var body: some View {
        if data.isEmpty { EmptyView() } else {
            VStack(alignment: .leading, spacing: 8) {
                Text("Prévu vs Dépensé").font(.caption.bold()).foregroundStyle(.secondary)
                Chart(data) { bar in
                    BarMark(x: .value("Catégorie", bar.cat), y: .value("K FCFA", bar.kValue), width: .fixed(20))
                        .foregroundStyle(by: .value("Type", bar.type))
                        .position(by: .value("Type", bar.type), span: .ratio(0.7))
                        .cornerRadius(4)
                }
                .chartForegroundStyleScale(["Prévu": Color.blue.opacity(0.45), "Dépensé": Color.orange])
                .chartLegend(position: .topTrailing)
                .chartYAxisLabel("K FCFA", alignment: .trailing)
                .frame(height: 170)
            }
        }
    }
}

struct BudgetView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var state = Loadable<[BudgetSummaryItem]>()
    @State private var showNew = false
    @State private var editItem: BudgetSummaryItem?

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune catégorie", emptyIcon: "chart.pie",
                  reload: load) { items in
            List {
                Section {
                    HStack(spacing: 12) {
                        MetricCard(title: "Prévu", value: fcfa(items.reduce(0) { $0 + $1.planned_amount }),
                                   icon: "target", color: theme.primary)
                        MetricCard(title: "Dépensé", value: fcfa(items.reduce(0) { $0 + $1.spent }),
                                   icon: "creditcard", color: .orange)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }

                if !items.isEmpty {
                    Section {
                        BudgetBarChart(items: items)
                            .padding(.vertical, 8)
                    }
                    .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                    .listRowBackground(Color.clear)
                }

                let overBudget = items.filter { $0.progress_pct > 100 }
                if !overBudget.isEmpty {
                    Section {
                        ForEach(overBudget) { item in
                            Label("\(item.name) — dépassement de \(Int(item.progress_pct - 100))%",
                                  systemImage: "exclamationmark.triangle.fill")
                                .font(.caption).foregroundStyle(.red)
                        }
                    } header: {
                        Label("Alertes dépassement", systemImage: "exclamationmark.triangle").font(.caption.bold()).foregroundStyle(.red)
                    }
                }

                Section("Catégories") {
                    ForEach(items) { item in
                        BudgetRow(item: item)
                            .swipeActions(edge: .leading) {
                                Button { editItem = item } label: { Label("Modifier", systemImage: "pencil") }
                                    .tint(.blue)
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    Task { try? await APIClient.shared.deleteBudgetCategory(item.id); await load() }
                                } label: { Label("Supprimer", systemImage: "trash") }
                            }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Budget")
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { BudgetFormView(existing: nil) { await load() } }
        .sheet(item: $editItem) { item in BudgetFormView(existing: item) { await load() } }
    }
    private func load() async { await state.load { try await APIClient.shared.budgetSummary() } }
}

private struct BudgetRow: View {
    let item: BudgetSummaryItem
    private var tint: Color { Color(hex: item.color) ?? .gray }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: item.icon).foregroundStyle(tint)
                Text(item.name).font(.subheadline.bold())
                Spacer()
                Text(fcfa(item.spent) + " / " + fcfa(item.planned_amount))
                    .font(.caption).foregroundStyle(.secondary)
            }
            ProgressView(value: min(item.progress_pct / 100, 1))
                .tint(item.progress_pct > 100 ? .red : tint)
        }
        .padding(.vertical, 4)
    }
}

struct BudgetFormView: View {
    let existing: BudgetSummaryItem?
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var plannedAmount: String
    @State private var categoryType: String
    @State private var period: String
    @State private var saving = false

    init(existing: BudgetSummaryItem?, onSaved: @escaping () async -> Void) {
        self.existing = existing; self.onSaved = onSaved
        _name = State(initialValue: existing?.name ?? "")
        _plannedAmount = State(initialValue: existing.map { String(Int($0.planned_amount)) } ?? "")
        _categoryType = State(initialValue: existing?.category_type ?? "expense")
        _period = State(initialValue: existing?.period ?? "monthly")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Catégorie") {
                    TextField("Nom *", text: $name)
                    TextField("Montant prévu (FCFA) *", text: $plannedAmount)
                        #if os(iOS)
                        .keyboardType(.numberPad)
                        #endif
                    Picker("Type", selection: $categoryType) {
                        Text("Dépense").tag("expense"); Text("Revenu").tag("income")
                    }.pickerStyle(.segmented)
                    Picker("Période", selection: $period) {
                        Text("Mensuel").tag("monthly"); Text("Annuel").tag("yearly")
                    }
                }
            }
            .navigationTitle(existing == nil ? "Nouvelle catégorie" : "Modifier la catégorie")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }
                        .disabled(name.isEmpty || Double(plannedAmount) == nil || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        let payload = BudgetCategoryPayload(name: name, planned_amount: Double(plannedAmount) ?? 0,
                                             period: period, category_type: categoryType)
        do {
            if let ex = existing {
                _ = try await APIClient.shared.updateBudgetCategory(ex.id, payload)
            } else {
                _ = try await APIClient.shared.createBudgetCategory(payload)
            }
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}

// MARK: - Investissements

// NOTE: InvestmentsView and its supporting screens now live in
// Views/Modules/InvestmentsView.swift (full market-data + Limule analysis port).

// MARK: - Comptes de paiement

struct PaymentAccountsView: View {
    @StateObject private var state = Loadable<[PaymentAccount]>()
    @State private var showNew = false

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun compte", emptyIcon: "creditcard",
                  reload: load) { items in
            List {
                ForEach(items) { acc in
                    HStack(spacing: 14) {
                        Image(systemName: acc.provider == "mobile_money" ? "phone.fill" : "building.columns.fill")
                            .frame(width: 30).foregroundStyle(acc.enabled ? .green : .secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(acc.label).font(.subheadline.bold())
                            Text(acc.masked_identifier).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if acc.use_for_pos { Tag(text: "Caisse") }
                        if acc.use_for_payroll { Tag(text: "Paie") }
                    }
                    .padding(.vertical, 3)
                }
                .onDelete { idx in Task { await delete(items, idx) } }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Comptes de paiement")
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { PaymentAccountFormView { await load() } }
    }
    private func load() async { await state.load { try await APIClient.shared.paymentAccounts() } }
    private func delete(_ items: [PaymentAccount], _ idx: IndexSet) async {
        for i in idx { try? await APIClient.shared.deletePaymentAccount(items[i].id) }
        await load()
    }
}

private struct Tag: View {
    let text: String
    var body: some View {
        Text(text).font(.caption2.bold())
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(Color.secondary.opacity(0.12))
            .clipShape(Capsule())
    }
}

struct PaymentAccountFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var label = ""
    @State private var provider = "mobile_money"
    @State private var phoneNumber = ""
    @State private var accountNumber = ""
    @State private var bankName = ""
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Compte") {
                    TextField("Libellé *", text: $label)
                    Picker("Type", selection: $provider) {
                        Text("Mobile Money").tag("mobile_money")
                        Text("Banque").tag("bank")
                        Text("PayPal").tag("paypal")
                    }
                }
                if provider == "mobile_money" {
                    Section("Mobile Money") { TextField("Numéro de téléphone", text: $phoneNumber) }
                } else if provider == "bank" {
                    Section("Banque") {
                        TextField("Nom de la banque", text: $bankName)
                        TextField("Numéro de compte", text: $accountNumber)
                    }
                }
            }
            .navigationTitle("Nouveau compte")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }
                        .disabled(label.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        let payload = PaymentAccountPayload(provider: provider, label: label, phone_number: phoneNumber,
                                             account_number: accountNumber, bank_name: bankName)
        do { _ = try await APIClient.shared.createPaymentAccount(payload); await onSaved(); dismiss() }
        catch { }
        saving = false
    }
}

// MARK: - Teras (intelligence & scores)

struct TerasView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var alerts = Loadable<[TerasAlert]>()
    @StateObject private var scores = Loadable<[TerasScore]>()
    @StateObject private var recos = Loadable<[TerasRecommendation]>()

    @State private var analysis: String?
    @State private var analysisLoading = false
    @State private var analysisRef: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Limule / Teras analysis runner
                AIAnalysisPanel(
                    title: "Analyse Teras de l'entreprise",
                    runLabel: "Lancer l'analyse",
                    loadingLabel: "Teras évalue votre entreprise…",
                    emptyLabel: "Lancez une analyse Teras pour évaluer la maturité et les risques de votre entreprise.",
                    analysis: analysis, isLoading: analysisLoading,
                    onRun: { Task { await runAnalysis() } }
                )
                if let ref = analysisRef {
                    Text("Référence Teras : \(ref)").font(.caption2).foregroundStyle(.tertiary)
                }

                scoresSection
                recommendationsSection
                alertsSection
            }
            .padding()
        }
        .navigationTitle("Intelligence Teras")
        .task { await load() }
        .refreshable { await load() }
    }

    private var scoresSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("SCORES DE MATURITÉ").font(.caption.bold()).foregroundStyle(.secondary)
            if let items = scores.value {
                if items.isEmpty {
                    Text("Aucun score disponible. Lancez une analyse Teras.").font(.callout).foregroundStyle(.secondary)
                }
                ForEach(items) { s in
                    GlassCard(padding: 14, cornerRadius: theme.cardRadius) {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(s.domain.capitalized).font(.subheadline.bold())
                                Spacer()
                                Text("\(s.score)/100").font(.subheadline.bold()).foregroundStyle(theme.primary)
                            }
                            ProgressView(value: Double(s.score) / 100).tint(theme.primary)
                            Text(s.maturity_level.capitalized).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            } else {
                ForEach(0..<3, id: \.self) { _ in ShimmerBox(height: 60, cornerRadius: 12) }
            }
        }
    }

    @ViewBuilder private var recommendationsSection: some View {
        if let recs = recos.value, !recs.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("RECOMMANDATIONS").font(.caption.bold()).foregroundStyle(.secondary)
                ForEach(recs) { r in
                    GlassCard(padding: 14, cornerRadius: theme.cardRadius) {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(r.domain.capitalized).font(.subheadline.bold())
                                Spacer()
                                Text("\(r.score)/100").font(.caption.bold()).foregroundStyle(theme.primary)
                            }
                            if !r.summary.isEmpty {
                                Text(r.summary).font(.caption).foregroundStyle(.secondary)
                            }
                            ForEach(Array(r.recommendations.enumerated()), id: \.offset) { _, rec in
                                Label(rec, systemImage: "arrow.right.circle.fill")
                                    .font(.caption).foregroundStyle(.primary)
                                    .labelStyle(.titleAndIcon)
                            }
                        }
                    }
                }
            }
        }
    }

    private var alertsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("ALERTES INTELLIGENTES").font(.caption.bold()).foregroundStyle(.secondary)
            if let items = alerts.value {
                if items.isEmpty {
                    Text("Aucune alerte active.").font(.callout).foregroundStyle(.secondary)
                }
                ForEach(items) { a in
                    GlassCard(padding: 14, cornerRadius: theme.cardRadius) {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(a.severityColorName == "red" ? .red : .orange)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(a.title).font(.subheadline.bold())
                                Text(a.recommendation).font(.caption).foregroundStyle(.secondary)
                                StatusPill(text: a.module, colorName: "blue")
                            }
                            Spacer()
                        }
                    }
                }
            } else {
                ForEach(0..<2, id: \.self) { _ in ShimmerBox(height: 60, cornerRadius: 12) }
            }
        }
    }

    private func runAnalysis() async {
        analysisLoading = true; analysis = nil
        do {
            let job = try await APIClient.shared.analyzeCompanyTeras()
            analysisRef = job.teras_reference
            analysis = TerasSnapshotFormatter.readable(job.result_snapshot)
            // Refresh scores/alerts/recos now that a new snapshot exists.
            await load()
        } catch {
            analysis = "Analyse Teras indisponible pour le moment. Réessayez plus tard."
        }
        analysisLoading = false
    }

    private func load() async {
        async let a: Void = alerts.load { try await APIClient.shared.terasAlerts() }
        async let b: Void = scores.load { try await APIClient.shared.terasScores() }
        async let c: Void = recos.load { try await APIClient.shared.terasRecommendations() }
        _ = await (a, b, c)
    }
}

// MARK: - Déclarations fiscales

struct DeclarationsView: View {
    @StateObject private var state = Loadable<[DeclarationRecord]>()
    @State private var showNew = false

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune déclaration", emptyIcon: "doc.badge.clock",
                  reload: load) { items in
            List {
                ForEach(items) { d in
                    NavigationLink { DeclarationDetailView(declaration: d) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(d.declaration_type.capitalized).font(.subheadline.bold())
                                Text(d.period).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            StatusPill(text: d.status, colorName: d.status == "validated" ? "green" : "orange")
                        }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Déclarations")
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { DeclarationFormView { await load() } }
    }
    private func load() async { await state.load { try await APIClient.shared.declarations() } }
}

struct DeclarationDetailView: View {
    let declaration: DeclarationRecord
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text(declaration.declaration_type.capitalized).font(.title3.bold())
                    Spacer()
                    StatusPill(text: declaration.status, colorName: declaration.status == "validated" ? "green" : "orange")
                }
                Text("Période : \(declaration.period)").font(.subheadline).foregroundStyle(.secondary)
                Text("Confiance : \(declaration.confidence)%").font(.subheadline).foregroundStyle(.secondary)
                if !declaration.missing_documents.isEmpty {
                    GlassCard {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Documents manquants").font(.caption.bold())
                            Text(declaration.missing_documents).font(.caption)
                        }
                    }
                }
                if !declaration.generated_text.isEmpty {
                    GlassCard {
                        Text(declaration.generated_text).font(.callout)
                    }
                }
            }.padding()
        }
        .navigationTitle("Déclaration")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                DownloadButton(title: "PDF", fileName: "declaration-\(declaration.id).pdf",
                               fetch: { try await APIClient.shared.declarationPDF(declaration.id) })
            }
        }
    }
}

struct DeclarationFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var period = ""
    @State private var declarationType = "fiscale"
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Déclaration") {
                    TextField("Période (ex: 2026-06) *", text: $period)
                    Picker("Type", selection: $declarationType) {
                        Text("Fiscale").tag("fiscale"); Text("Sociale").tag("sociale")
                    }
                }
            }
            .navigationTitle("Générer une déclaration")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Générer") { Task { await save() } }
                        .disabled(period.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        do {
            _ = try await APIClient.shared.generateDeclaration(DeclarationPayload(period: period, declaration_type: declarationType))
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}
