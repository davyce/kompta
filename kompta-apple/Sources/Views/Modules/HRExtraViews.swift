import SwiftUI

// ============================================================================
//  Wave 4 — RH complet + IA
//  Paie · Assistants IA (rédaction) · Centre d'aide (tickets support)
// ============================================================================

// MARK: - Paie

struct PayrollView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var state = Loadable<[PayrollRun]>()
    @State private var showNew = false

    private func paidCount(_ run: PayrollRun) -> Int { run.payslips.filter { $0.payout_status == "paid" }.count }

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun cycle de paie", emptyIcon: "banknote",
                  reload: load) { runs in
            List {
                Section {
                    HStack(spacing: 12) {
                        MetricCard(title: "Cycles", value: "\(runs.count)", icon: "calendar", color: theme.primary)
                        MetricCard(title: "Masse nette",
                                   value: fcfa(runs.reduce(0) { $0 + $1.net_total }),
                                   icon: "banknote", color: .green)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
                Section {
                    NavigationLink { PayrollTaxRemittancesView() } label: {
                        Label("Reversements CNSS / État", systemImage: "building.columns.fill")
                    }
                }
                ForEach(runs) { run in
                    NavigationLink { PayrollRunDetailView(run: run, onChanged: load) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(run.period).font(.subheadline.bold())
                                Text("\(paidCount(run))/\(run.payslips.count) bulletins payés")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 3) {
                                Text(fcfa(run.net_total)).font(.subheadline.bold()).foregroundStyle(theme.primary)
                                StatusPill(text: runStatusLabel(run.status),
                                           colorName: run.status == "validated" ? "green" : "orange")
                            }
                        }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Paie")
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { PayrollRunFormView { await load() } }
    }
    private func load() async { await state.load { try await APIClient.shared.payrollRuns() } }
}

private func runStatusLabel(_ s: String) -> String {
    switch s { case "validated": return "Validé"; case "paid": return "Payé"; default: return "Brouillon" }
}

// MARK: - Reversements CNSS / État

/// Les cotisations retenues sur les salaires (CNSS, IRPP) s'accumulent au
/// fil des cycles de paie comme une dette (comptes 431/447) tant qu'elles
/// n'ont pas été effectivement reversées à la CNSS/DGI. Cette vue affiche la
/// dette courante et permet d'enregistrer un reversement réel.
struct PayrollTaxRemittancesView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @State private var liabilities: TaxLiabilities?
    @State private var loading = true
    @State private var remitCode: String?
    @State private var remitAmount = ""
    @State private var remitMethod = "bank"
    @State private var submitting = false

    var body: some View {
        List {
            Section {
                Text("Les cotisations retenues sur les salaires (CNSS, IRPP) s'accumulent au fil des cycles de paie jusqu'à leur reversement effectif à la CNSS et à la DGI. Enregistrez ici chaque versement réel pour garder cette dette à jour.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section("CNSS (cotisations sociales)") {
                remittanceRow(code: "431", due: liabilities?.cnss_due ?? 0)
            }
            Section("État — IRPP (DGI)") {
                remittanceRow(code: "447", due: liabilities?.state_tax_due ?? 0)
            }
        }
        .navigationTitle("Reversements")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: Binding(get: { remitCode.map { RemitTarget(code: $0) } }, set: { remitCode = $0?.code })) { target in
            remitSheet(code: target.code)
        }
    }

    @ViewBuilder
    private func remittanceRow(code: String, due: Double) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text("Montant dû, non reversé").font(.caption).foregroundStyle(.secondary)
                Text(loading ? "…" : fcfa(due)).font(.title3.bold())
                    .foregroundStyle(due > 0 ? .red : .green)
            }
            Spacer()
            Button("Reverser") {
                remitAmount = due > 0 ? String(format: "%.0f", due) : ""
                remitMethod = "bank"
                remitCode = code
            }
            .buttonStyle(.borderedProminent)
            .tint(theme.primary)
            .disabled(due <= 0)
        }
    }

    @ViewBuilder
    private func remitSheet(code: String) -> some View {
        NavigationStack {
            Form {
                Section(code == "431" ? "CNSS (cotisations sociales)" : "État — IRPP (DGI)") {
                    TextField("Montant reversé", text: $remitAmount)
                        #if os(iOS)
                        .keyboardType(.numberPad)
                        #endif
                    Picker("Moyen de paiement", selection: $remitMethod) {
                        Text("Virement bancaire").tag("bank")
                        Text("Espèces").tag("cash")
                        Text("Mobile Money").tag("mobile_money")
                    }
                }
            }
            .navigationTitle("Enregistrer un reversement")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { remitCode = nil } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Confirmer") { Task { await remit(code: code) } }
                        .disabled(Double(remitAmount) == nil || Double(remitAmount) == 0 || submitting)
                }
            }
        }
    }

    private func load() async {
        loading = true
        liabilities = try? await APIClient.shared.payrollTaxLiabilities()
        loading = false
    }

    private func remit(code: String) async {
        guard let amount = Double(remitAmount), amount > 0 else { return }
        submitting = true
        do {
            liabilities = try await APIClient.shared.remitPayrollTaxLiability(
                TaxRemittancePayload(code: code, amount: amount, payment_method: remitMethod)
            )
            remitCode = nil
        } catch { }
        submitting = false
    }
}

private struct RemitTarget: Identifiable { let code: String; var id: String { code } }

struct PayrollRunDetailView: View {
    @State var run: PayrollRun
    let onChanged: () async -> Void
    @EnvironmentObject private var theme: CompanyTheme

    @State private var working = false
    @State private var analysis: String?
    @State private var analysisLoading = false
    @State private var selectedPayslip: Payslip?

    private var paidCount: Int { run.payslips.filter { $0.payout_status == "paid" }.count }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                VStack(spacing: 8) {
                    Text(run.period).font(.title2.bold())
                    StatusPill(text: runStatusLabel(run.status), colorName: run.status == "validated" ? "green" : "orange")
                }.padding(.top)

                HStack(spacing: 12) {
                    MetricCard(title: "Brut total", value: fcfa(run.gross_total), icon: "banknote", color: theme.primary)
                    MetricCard(title: "Net total", value: fcfa(run.net_total), icon: "checkmark.seal", color: .green)
                }

                if !run.payment_account_label.isEmpty {
                    HStack(spacing: 8) {
                        Image(systemName: "creditcard.fill").foregroundStyle(theme.primary)
                        Text("Versé via : \(run.payment_account_label)").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                    }
                    .padding(.horizontal, 4)
                }

                if run.status != "validated" {
                    Button { Task { await validate() } } label: {
                        HStack { if working { ProgressView().controlSize(.small) }
                            Label("Valider le cycle", systemImage: "checkmark.seal.fill") }
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).tint(theme.primary).disabled(working)
                }

                VStack(alignment: .leading, spacing: 6) {
                    HStack { Text("Bulletins payés").font(.caption.bold()).foregroundStyle(.secondary)
                        Spacer(); Text("\(paidCount)/\(run.payslips.count)").font(.caption.bold()) }
                    ProgressView(value: run.payslips.isEmpty ? 0 : Double(paidCount) / Double(run.payslips.count))
                        .tint(.green)
                }

                if paidCount < run.payslips.count {
                    DownloadButton(title: "Générer virement de masse", fileName: "virement-masse-\(run.period).csv",
                                   fetch: {
                        let data = try await APIClient.shared.massPayment(runId: run.id)
                        if let runs = try? await APIClient.shared.payrollRuns(), let fresh = runs.first(where: { $0.id == run.id }) {
                            run = fresh
                        }
                        await onChanged()
                        return data
                    })
                    .buttonStyle(.borderedProminent).tint(.green)
                    .frame(maxWidth: .infinity)
                }

                GlassCard(padding: 0, cornerRadius: 18) {
                    VStack(spacing: 0) {
                        ForEach(run.payslips) { p in
                            Button { selectedPayslip = p } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(p.employee_name).font(.subheadline.bold())
                                        Text(p.reference).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 4) {
                                        Text(fcfa(p.net_pay)).font(.subheadline.bold()).foregroundStyle(theme.primary)
                                        if p.payout_status == "paid" {
                                            StatusPill(text: "Payé", colorName: "green")
                                        } else {
                                            StatusPill(text: "À payer", colorName: "orange")
                                        }
                                    }
                                    Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
                                }
                                .padding(.horizontal, 16).padding(.vertical, 12)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if p.id != run.payslips.last?.id { Divider().padding(.leading, 16) }
                        }
                    }
                }

                AIAnalysisPanel(
                    title: "Analyse Teras de la paie",
                    runLabel: "Analyser la paie",
                    loadingLabel: "Teras vérifie la conformité paie…",
                    emptyLabel: "Lancez une analyse Teras pour contrôler la conformité de votre paie.",
                    analysis: analysis, isLoading: analysisLoading,
                    onRun: { Task { await analyzePayroll() } }
                )
            }.padding()
        }
        .navigationTitle("Cycle de paie")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                DownloadButton(title: "Exporter (PDF)", fileName: "cycle-paie-\(run.id).pdf",
                               fetch: { try await APIClient.shared.payrollRunExportPDF(run.id) })
            }
        }
        .sheet(item: $selectedPayslip) { p in
            PayslipDetailView(payslip: p, period: run.period,
                              onPaid: { Task { await markPaid(p) } },
                              canPay: p.payout_status != "paid" && !working)
        }
    }

    private func validate() async {
        working = true
        if let updated = try? await APIClient.shared.updatePayrollRunStatus(run.id, status: "validated") {
            run = updated; await onChanged()
        }
        working = false
    }

    private func markPaid(_ p: Payslip) async {
        working = true
        if (try? await APIClient.shared.updatePayslip(p.id, payoutStatus: "paid")) != nil {
            if let runs = try? await APIClient.shared.payrollRuns(), let fresh = runs.first(where: { $0.id == run.id }) {
                run = fresh
            }
            await onChanged()
        }
        working = false
    }

    private func analyzePayroll() async {
        analysisLoading = true; analysis = nil
        if let job = try? await APIClient.shared.analyzePayrollTeras() {
            analysis = TerasSnapshotFormatter.readable(job.result_snapshot)
        } else {
            analysis = "Analyse Teras de la paie indisponible pour le moment."
        }
        analysisLoading = false
    }
}

// MARK: - Payslip detail (breakdown + PDF)

struct PayslipDetailView: View {
    let payslip: Payslip
    let period: String
    let onPaid: () -> Void
    let canPay: Bool
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: CompanyTheme
    @State private var exporting = false
    @State private var pdfURL: URL?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    VStack(spacing: 6) {
                        AvatarView(initials: initials, size: 64, color: theme.primary)
                        Text(payslip.employee_name).font(.title3.bold())
                        Text("Bulletin \(payslip.reference) · \(period)").font(.caption).foregroundStyle(.secondary)
                    }.padding(.top)

                    GlassCard(padding: 0, cornerRadius: 16) {
                        VStack(spacing: 0) {
                            row("Salaire de base", fcfa(payslip.gross_pay - payslip.bonus - payslip.overtime_pay))
                            if payslip.overtime_pay > 0 { Divider().padding(.leading, 16); row("Heures supplémentaires", "+ " + fcfa(payslip.overtime_pay), tint: .green) }
                            if payslip.bonus > 0 { Divider().padding(.leading, 16); row("Prime", "+ " + fcfa(payslip.bonus), tint: .green) }
                            Divider().padding(.leading, 16)
                            row("Salaire brut", fcfa(payslip.gross_pay), bold: true)
                            Divider().padding(.leading, 16)
                            row("CNSS salarié", "- " + fcfa(Double(payslip.cnss_employee_cents ?? 0) / 100), tint: .red)
                            Divider().padding(.leading, 16)
                            row("IRPP", "- " + fcfa(Double(payslip.irpp_cents ?? 0) / 100), tint: .red)
                            Divider().padding(.leading, 16)
                            row("Net à payer", fcfa(payslip.net_pay), bold: true, tint: theme.primary)
                            Divider().padding(.leading, 16)
                            row("CNSS patronale (info)", fcfa(Double(payslip.cnss_employer_cents ?? 0) / 100), tint: .secondary)
                            Divider().padding(.leading, 16)
                            row("Allocations familiales (info)", fcfa(Double(payslip.family_allowance_cents ?? 0) / 100), tint: .secondary)
                            Divider().padding(.leading, 16)
                            row("Accidents du travail (info)", fcfa(Double(payslip.work_accident_cents ?? 0) / 100), tint: .secondary)
                        }
                    }

                    HStack {
                        StatusPill(text: payslip.payout_status == "paid" ? "Payé" : "À payer",
                                   colorName: payslip.payout_status == "paid" ? "green" : "orange")
                        Spacer()
                        if canPay {
                            Button { onPaid(); dismiss() } label: {
                                Label("Marquer payé", systemImage: "checkmark.circle.fill")
                            }
                            .buttonStyle(.borderedProminent).tint(theme.primary)
                        }
                    }

                    Button { Task { await exportPDF() } } label: {
                        HStack { if exporting { ProgressView().controlSize(.small) }
                            Label(exporting ? "Préparation…" : "Télécharger le bulletin (PDF)", systemImage: "arrow.down.doc.fill") }
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(theme.primary.opacity(0.12), in: RoundedRectangle(cornerRadius: theme.buttonRadius))
                            .foregroundStyle(theme.primary)
                    }
                    .buttonStyle(.plain).disabled(exporting)

                    if let pdfURL {
                        ShareLink(item: pdfURL) {
                            Label("Partager / imprimer", systemImage: "square.and.arrow.up")
                                .frame(maxWidth: .infinity).padding(.vertical, 12)
                                .background(.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: theme.buttonRadius))
                        }
                        .buttonStyle(.plain)
                    }
                }.padding()
            }
            .navigationTitle("Bulletin de paie")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { dismiss() } } }
        }
    }

    private var initials: String {
        payslip.employee_name.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined().uppercased()
    }
    private func exportPDF() async {
        exporting = true
        if let data = try? await APIClient.shared.payslipPDF(payslip.id) {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("bulletin-\(payslip.reference).pdf")
            try? data.write(to: url, options: .atomic); pdfURL = url
        }
        exporting = false
    }
    private func row(_ label: String, _ value: String, bold: Bool = false, tint: Color? = nil) -> some View {
        HStack {
            Text(label).font(bold ? .subheadline.bold() : .subheadline).foregroundStyle(bold ? .primary : .secondary)
            Spacer()
            Text(value).font(bold ? .headline : .subheadline).foregroundStyle(tint ?? (bold ? .primary : .primary))
        }
        .padding(.horizontal, 16).padding(.vertical, 11)
    }
}

struct PayrollRunFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var period = ""
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Cycle de paie") {
                    TextField("Période (ex: 2026-06) *", text: $period)
                }
            }
            .navigationTitle("Nouveau cycle")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Générer") { Task { await save() } }.disabled(period.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        do { _ = try await APIClient.shared.createPayrollRun(PayrollRunPayload(period: period)); await onSaved(); dismiss() }
        catch { }
        saving = false
    }
}

// MARK: - Studio Limule (rédaction)

struct AIWritingView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @State private var notes = ""
    @State private var contentType = "email"
    @State private var tone = "professionnel"
    @State private var generating = false
    @State private var result: WritingResult?
    @State private var history: [WritingResult] = []
    @State private var errorMsg: String?
    @State private var copied = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                GlassCard {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 10) {
                            LimuleMark(size: 34)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Studio de rédaction Limule").font(.headline)
                                Text("E-mails, lettres, annonces et rapports.").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        Picker("Type", selection: $contentType) {
                            Text("E-mail").tag("email"); Text("Lettre").tag("letter")
                            Text("Annonce").tag("announcement"); Text("Rapport").tag("report")
                        }
                        .pickerStyle(.segmented)
                        Picker("Ton", selection: $tone) {
                            Text("Professionnel").tag("professionnel"); Text("Amical").tag("amical")
                            Text("Formel").tag("formel")
                        }
                        .pickerStyle(.segmented)
                        TextField("Décrivez ce que vous voulez rédiger…", text: $notes, axis: .vertical)
                            .lineLimit(3...8)
                            #if os(iOS)
                            .textFieldStyle(.roundedBorder)
                            #endif
                        KomptaButton(label: "Générer avec Limule", icon: KomptaBrand.limuleIcon, isLoading: generating) { await generate() }
                            .disabled(notes.trimmingCharacters(in: .whitespaces).isEmpty)
                        if let errorMsg {
                            Text(errorMsg).font(.caption).foregroundStyle(.red)
                        }
                    }
                }

                if let result {
                    GlassCard(tint: theme.primary.opacity(0.06)) {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Label("Brouillon Limule", systemImage: "doc.text.fill")
                                    .font(.subheadline.bold()).foregroundStyle(theme.primary)
                                Spacer()
                                if let c = result.confidence, c > 0 {
                                    Text("\(c)%").font(.caption.bold()).foregroundStyle(.secondary)
                                }
                                Button { copy(result.draft) } label: {
                                    Label(copied ? "Copié" : "Copier", systemImage: copied ? "checkmark" : "doc.on.doc")
                                        .font(.caption.bold())
                                }
                                .buttonStyle(.borderless)
                            }
                            Divider()
                            AIMarkdownText(text: result.draft, accent: theme.primary)
                                .textSelection(.enabled)
                        }
                    }
                }

                if !history.isEmpty {
                    Text("Cette session").font(.headline)
                    ForEach(history) { gen in
                        GlassCard {
                            Text(gen.draft).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Studio Limule")
    }

    private func generate() async {
        generating = true; errorMsg = nil
        let payload = WritingPayload(content_type: contentType, tone: tone, notes: notes)
        do {
            let r = try await APIClient.shared.writeWithAI(payload)
            if let prev = result { history.insert(prev, at: 0) }
            result = r
            notes = ""
        } catch {
            errorMsg = "Limule n'a pas pu générer le texte. Réessayez."
        }
        generating = false
    }

    private func copy(_ text: String) {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #else
        UIPasteboard.general.string = text
        #endif
        copied = true
        Task { try? await Task.sleep(nanoseconds: 1_500_000_000); copied = false }
    }
}

// MARK: - Centre d'aide (tickets support)

struct HelpCenterView: View {
    @StateObject private var state = Loadable<[Ticket]>()
    @State private var showNew = false

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune demande", emptyIcon: "lifepreserver",
                  reload: load) { tickets in
            List {
                Section {
                    NavigationLink {
                        FAQView()
                    } label: {
                        Label("Foire aux questions", systemImage: "questionmark.circle.fill")
                    }
                }
                Section("Mes demandes") {
                    ForEach(tickets) { t in
                        NavigationLink { TicketDetailView(ticket: t) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(t.subject).font(.subheadline.bold())
                                    Text(shortDate(t.created_at)).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                StatusPill(text: t.status, colorName: t.status == "resolved" ? "green" : "orange")
                            }
                        }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Aide & support")
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { TicketFormView { await load() } }
    }
    private func load() async { await state.load { try await APIClient.shared.tickets() } }
}

struct TicketDetailView: View {
    let ticket: Ticket
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text(ticket.subject).font(.title3.bold())
                    Spacer()
                    StatusPill(text: ticket.status, colorName: ticket.status == "resolved" ? "green" : "orange")
                }
                Text(ticket.body).font(.callout)
                ForEach(ticket.messages) { m in
                    GlassCard {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(m.is_staff ? "Support KOMPTA" : m.author_name)
                                .font(.caption.bold()).foregroundStyle(m.is_staff ? .blue : .secondary)
                            Text(m.body).font(.callout)
                        }
                    }
                }
            }.padding()
        }
        .navigationTitle("Demande #\(ticket.id)")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }
}

struct TicketFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var subject = ""
    @State private var body_ = ""
    @State private var priority = "medium"
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Demande") {
                    TextField("Sujet *", text: $subject)
                    TextField("Description", text: $body_, axis: .vertical).lineLimit(3...8)
                    Picker("Priorité", selection: $priority) {
                        Text("Basse").tag("low"); Text("Moyenne").tag("medium"); Text("Haute").tag("high")
                    }
                }
            }
            .navigationTitle("Nouvelle demande")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Envoyer") { Task { await save() } }.disabled(subject.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        do {
            _ = try await APIClient.shared.createTicket(TicketPayload(subject: subject, body: body_, priority: priority))
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}

private struct FAQView: View {
    private let items: [(String, String)] = [
        ("Comment créer une facture ?", "Allez dans Modules → Facturation, puis appuyez sur + pour créer une nouvelle facture."),
        ("Comment ajouter un employé ?", "La gestion des employés se fait depuis l'espace web Entreprise, section Ressources humaines."),
        ("Comment fonctionne le score Teras ?", "Teras analyse vos données financières et opérationnelles pour générer un score de maturité par domaine."),
        ("Comment contacter le support ?", "Depuis Aide & support, créez une nouvelle demande — notre équipe répond généralement sous 24h."),
    ]
    var body: some View {
        List(items, id: \.0) { item in
            VStack(alignment: .leading, spacing: 6) {
                Text(item.0).font(.subheadline.bold())
                Text(item.1).font(.caption).foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
        .navigationTitle("FAQ")
    }
}
