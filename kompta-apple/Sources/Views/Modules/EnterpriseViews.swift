import SwiftUI
import UniformTypeIdentifiers
#if os(iOS)
import UIKit

/// Pont UIKit minimal pour ouvrir l'appareil photo natif (PhotosPicker ne le
/// permet pas — seulement la photothèque). Utilisé pour le logo entreprise.
struct CameraCaptureView: UIViewControllerRepresentable {
    let onCapture: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onCapture: onCapture) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onCapture: (UIImage?) -> Void
        init(onCapture: @escaping (UIImage?) -> Void) { self.onCapture = onCapture }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onCapture(info[.originalImage] as? UIImage)
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onCapture(nil)
        }
    }
}
#endif

// ============================================================================
//  Enterprise parity views — native counterparts for web routes that were
//  missing from iOS/macOS: company, work, calendar, reports, accounting,
//  projects, audit, analytics, fiscal, legislation and safe mode.
// ============================================================================

private func clean(_ value: String?) -> String {
    guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "—" }
    return value
}

private func statusIcon(_ status: String) -> String {
    switch status {
    case "pass", "ready", "done", "active": return "checkmark.circle.fill"
    case "fail", "critical", "overdue": return "exclamationmark.triangle.fill"
    default: return "clock.fill"
    }
}

private func colorFromName(_ name: String) -> Color {
    switch name {
    case "green": return .green
    case "red": return .red
    case "orange": return .orange
    case "blue": return .blue
    case "gray": return .gray
    default: return .secondary
    }
}

private struct InfoLine: View {
    let title: String
    let value: String
    let icon: String
    var tint: Color = .secondary

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .frame(width: 24)
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.caption).foregroundStyle(.secondary)
                Text(value).font(.subheadline).textSelection(.enabled)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Company profile

struct CompanyProfileView: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var state = Loadable<KomptaCompany>()
    @State private var showLogoPicker = false
    @State private var showLogoSourceMenu = false
    #if os(iOS)
    @State private var showCamera = false
    #endif
    @State private var logoData: Data?
    @State private var uploadingLogo = false
    @State private var logoError: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let company = state.value ?? auth.company {
                    header(company)
                    legalCard(company)
                    contactCard(company)
                    financeCard(company)
                } else if state.isLoading {
                    VStack(spacing: 12) {
                        ShimmerBox(height: 130)
                        ShimmerBox(height: 220)
                        ShimmerBox(height: 180)
                    }
                } else if let error = state.error {
                    ContentUnavailableView("Profil indisponible", systemImage: "building.2.crop.circle", description: Text(error))
                }
            }
            .padding()
        }
        .navigationTitle("Entreprise")
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog("Logo de l'entreprise", isPresented: $showLogoSourceMenu, titleVisibility: .visible) {
            #if os(iOS)
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button("Prendre une photo") { showCamera = true }
            }
            #endif
            Button("Choisir un fichier (image ou PDF)") { showLogoPicker = true }
            Button("Annuler", role: .cancel) {}
        }
        .fileImporter(isPresented: $showLogoPicker, allowedContentTypes: [.png, .jpeg, .image, .pdf]) { result in
            Task { await handleLogoPick(result) }
        }
        #if os(iOS)
        .fullScreenCover(isPresented: $showCamera) {
            CameraCaptureView { image in
                showCamera = false
                if let image { Task { await handleCameraCapture(image) } }
            }
            .ignoresSafeArea()
        }
        #endif
    }

    private func header(_ company: KomptaCompany) -> some View {
        GlassCard(padding: 18, cornerRadius: 18) {
            HStack(spacing: 16) {
                Button { showLogoSourceMenu = true } label: {
                    ZStack(alignment: .bottomTrailing) {
                        Group {
                            if let logoData, let img = uiImage(logoData) {
                                img.resizable().scaledToFill()
                                    .frame(width: 64, height: 64)
                                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            } else {
                                AvatarView(initials: company.initial, size: 64, color: theme.primary)
                            }
                        }
                        Image(systemName: uploadingLogo ? "hourglass" : "pencil.circle.fill")
                            .font(.system(size: 20))
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(.white, theme.primary)
                            .background(Circle().fill(.background))
                            .offset(x: 5, y: 5)
                    }
                }
                .buttonStyle(.plain)
                .disabled(uploadingLogo)
                .help("Changer le logo de l'entreprise")

                VStack(alignment: .leading, spacing: 5) {
                    Text(company.name).font(.title2.bold())
                    Text([company.industry, company.organization_type, company.country].compactMap { clean($0) == "—" ? nil : $0 }.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    ProgressView(value: Double(company.completion_score ?? 0), total: 100)
                        .tint(theme.primary)
                    Text("Profil complété à \(company.completion_score ?? 0)% · TERAS \(company.teras_score ?? 0)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Button {
                        showLogoPicker = true
                    } label: {
                        Label(uploadingLogo ? "Envoi…" : (logoData == nil ? "Importer un logo" : "Changer le logo"),
                              systemImage: "photo.badge.plus")
                            .font(.caption.bold())
                    }
                    .buttonStyle(.borderless)
                    .disabled(uploadingLogo)
                    if let logoError {
                        Text(logoError).font(.caption2).foregroundStyle(.red)
                    }
                }
                Spacer()
            }
        }
    }

    private func uiImage(_ data: Data) -> Image? {
        #if os(macOS)
        guard let ns = NSImage(data: data) else { return nil }
        return Image(nsImage: ns)
        #else
        guard let ui = UIImage(data: data) else { return nil }
        return Image(uiImage: ui)
        #endif
    }

    private func handleLogoPick(_ result: Result<URL, Error>) async {
        logoError = nil
        guard case .success(let url) = result else { return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { logoError = "Lecture du fichier impossible"; return }
        let ext = url.pathExtension.lowercased()
        let mime: String
        switch ext {
        case "png": mime = "image/png"
        case "webp": mime = "image/webp"
        case "pdf": mime = "application/pdf"
        default: mime = "image/jpeg"
        }
        uploadingLogo = true
        do {
            let updated = try await APIClient.shared.uploadCompanyLogo(data, fileName: url.lastPathComponent, mime: mime)
            auth.company = updated
            logoData = data
        } catch {
            logoError = (error as? LocalizedError)?.errorDescription ?? "Échec de l'envoi du logo"
        }
        uploadingLogo = false
    }

    #if os(iOS)
    private func handleCameraCapture(_ image: UIImage) async {
        logoError = nil
        // La caméra peut renvoyer du HEIC en interne — on force un JPEG standard,
        // seul format garanti décodable par PIL/reportlab côté backend.
        guard let data = image.jpegData(compressionQuality: 0.9) else {
            logoError = "Impossible de traiter la photo"; return
        }
        uploadingLogo = true
        do {
            let updated = try await APIClient.shared.uploadCompanyLogo(data, fileName: "logo.jpg", mime: "image/jpeg")
            auth.company = updated
            logoData = data
        } catch {
            logoError = (error as? LocalizedError)?.errorDescription ?? "Échec de l'envoi du logo"
        }
        uploadingLogo = false
    }
    #endif

    private func legalCard(_ company: KomptaCompany) -> some View {
        GlassCard(padding: 16, cornerRadius: 18) {
            VStack(alignment: .leading, spacing: 10) {
                Label("Identité légale", systemImage: "doc.text.magnifyingglass")
                    .font(.headline)
                InfoLine(title: "Raison sociale", value: clean(company.legal_name), icon: "building.2", tint: theme.primary)
                InfoLine(title: "Forme juridique", value: clean(company.legal_form), icon: "signature", tint: .indigo)
                InfoLine(title: "RCCM", value: clean(company.rccm), icon: "number", tint: .blue)
                InfoLine(title: "NIU", value: clean(company.niu), icon: "barcode.viewfinder", tint: .teal)
                InfoLine(title: "CNSS", value: clean(company.cnss_number), icon: "person.text.rectangle", tint: .green)
                InfoLine(title: "Régime fiscal", value: clean(company.tax_regime), icon: "percent", tint: .orange)
            }
        }
    }

    private func contactCard(_ company: KomptaCompany) -> some View {
        GlassCard(padding: 16, cornerRadius: 18) {
            VStack(alignment: .leading, spacing: 10) {
                Label("Contact & direction", systemImage: "person.crop.rectangle.stack")
                    .font(.headline)
                InfoLine(title: "Adresse", value: [company.address, company.city, company.country].map(clean).filter { $0 != "—" }.joined(separator: ", "), icon: "mappin.and.ellipse", tint: .red)
                InfoLine(title: "Téléphone", value: clean(company.phone), icon: "phone", tint: .green)
                InfoLine(title: "E-mail", value: clean(company.email), icon: "envelope", tint: .blue)
                InfoLine(title: "Site web", value: clean(company.website), icon: "globe", tint: .cyan)
                InfoLine(title: "Responsable", value: [company.manager_name, company.manager_title].map(clean).filter { $0 != "—" }.joined(separator: " · "), icon: "person.fill.checkmark", tint: theme.primary)
            }
        }
    }

    private func financeCard(_ company: KomptaCompany) -> some View {
        GlassCard(padding: 16, cornerRadius: 18) {
            VStack(alignment: .leading, spacing: 10) {
                Label("Banque & seuils", systemImage: "building.columns.fill")
                    .font(.headline)
                InfoLine(title: "Banque", value: clean(company.bank_name), icon: "building.columns", tint: .purple)
                InfoLine(title: "Compte", value: clean(company.bank_account), icon: "creditcard", tint: .teal)
                InfoLine(title: "Seuil de trésorerie", value: fcfa(Double(company.cash_low_threshold_cents ?? 0) / 100), icon: "bell.badge", tint: .orange)
            }
        }
    }

    private func load() async {
        await state.load {
            let company = try await APIClient.shared.company()
            auth.company = company
            theme.apply(from: company)
            return company
        }
        if (state.value ?? auth.company)?.has_logo == true, logoData == nil {
            logoData = try? await APIClient.shared.companyLogoData()
        }
    }
}

// MARK: - Work hub

struct WorkHubView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @State private var tasks: [KTask] = []
    @State private var meetings: [Meeting] = []
    @State private var notes: [DailyNote] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        List {
            if isLoading {
                Section { ShimmerBox(height: 110); ShimmerBox(height: 180) }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            } else if let error {
                ContentUnavailableView("Travail indisponible", systemImage: "briefcase", description: Text(error))
            } else {
                Section {
                    HStack(spacing: 12) {
                        MetricCard(title: "Ouvertes", value: "\(tasks.filter { $0.status != "done" }.count)", icon: "checklist", color: theme.primary)
                        MetricCard(title: "Réunions", value: "\(meetings.count)", icon: "calendar.badge.clock", color: .indigo)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
                Section("Priorités") {
                    ForEach(tasks.filter { $0.status != "done" }.prefix(8)) { task in
                        NavigationLink { TasksKanbanView() } label: { TaskCompactRow(task: task) }
                    }
                }
                Section("Prochaines réunions") {
                    ForEach(meetings.prefix(6)) { meeting in
                        NavigationLink { MeetingDetailView(meeting: meeting) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(meeting.title).font(.subheadline.bold())
                                    Text(shortDate(meeting.start_at)).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                StatusPill(text: meeting.tag, colorName: meeting.tag_color)
                            }
                        }
                    }
                }
                Section("Notes épinglées") {
                    ForEach(notes.filter(\.pinned).prefix(4)) { note in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(note.title.isEmpty ? shortDate(note.note_date) : note.title).font(.subheadline.bold())
                            Text(note.body).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                        }
                    }
                }
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
        .navigationTitle("Travail")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        error = nil
        do {
            async let taskReq = APIClient.shared.tasks()
            async let meetingReq = APIClient.shared.meetings()
            async let noteReq = APIClient.shared.notes()
            (tasks, meetings, notes) = try await (taskReq, meetingReq, noteReq)
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}

private struct TaskCompactRow: View {
    let task: KTask
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(task.title).font(.subheadline.bold()).lineLimit(1)
                Spacer()
                StatusPill(text: task.priority, colorName: task.priorityColorName)
            }
            Text([task.project, task.assignee_name, shortDate(task.due_date)].filter { !$0.isEmpty && $0 != "—" }.joined(separator: " · "))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Calendar

struct CompanyCalendarView: View {
    @State private var tasks: [KTask] = []
    @State private var meetings: [Meeting] = []
    @State private var isLoading = true

    private var events: [CalendarItem] {
        let meetingItems = meetings.map { CalendarItem(date: String($0.start_at.prefix(10)), title: $0.title, subtitle: $0.location, icon: "calendar.badge.clock", color: .indigo) }
        let taskItems = tasks.compactMap { task -> CalendarItem? in
            guard let due = task.due_date, !due.isEmpty else { return nil }
            return CalendarItem(date: String(due.prefix(10)), title: task.title, subtitle: task.assignee_name, icon: "checkmark.circle", color: task.priority == "high" ? .red : .teal)
        }
        return (meetingItems + taskItems).sorted { $0.date < $1.date }
    }

    var body: some View {
        List {
            if isLoading {
                ForEach(0..<7, id: \.self) { _ in ShimmerBox(height: 54, cornerRadius: 10) }
            } else if events.isEmpty {
                ContentUnavailableView("Aucun événement", systemImage: "calendar")
            } else {
                ForEach(Dictionary(grouping: events, by: \.date).keys.sorted(), id: \.self) { date in
                    Section(shortDate(date)) {
                        ForEach(events.filter { $0.date == date }) { item in
                            HStack(spacing: 12) {
                                Image(systemName: item.icon).foregroundStyle(item.color).frame(width: 24)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.title).font(.subheadline.bold())
                                    if !item.subtitle.isEmpty { Text(item.subtitle).font(.caption).foregroundStyle(.secondary) }
                                }
                            }
                        }
                    }
                }
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
        .navigationTitle("Calendrier")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink { MeetingsView() } label: { Image(systemName: "plus") }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        async let taskReq = APIClient.shared.tasks()
        async let meetingReq = APIClient.shared.meetings()
        tasks = (try? await taskReq) ?? []
        meetings = (try? await meetingReq) ?? []
        isLoading = false
    }
}

private struct CalendarItem: Identifiable, Hashable {
    var id: String { "\(date)-\(title)-\(icon)" }
    let date: String
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
}

// MARK: - Reports

struct ReportsHubNativeView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @State private var overview: DashboardOverview?
    @State private var payrollRuns: [PayrollRun] = []
    @State private var isLoading = true

    var body: some View {
        List {
            if isLoading {
                Section { ShimmerBox(height: 120) }.listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
            } else {
                Section {
                    HStack(spacing: 12) {
                        MetricCard(title: "TERAS", value: "\(overview?.terasScore ?? 0)", icon: "shield.checkered", color: .red)
                        MetricCard(title: "Paie", value: "\(payrollRuns.first?.payslips.count ?? 0)", icon: "person.2.fill", color: .orange)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
                Section {
                    Text("Touchez l'icône Limule pour générer une explication IA détaillée, téléchargeable en PDF avec le logo KOMPTA.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("Rapports") {
                    ReportNavRow(
                        title: "Rapport financier", subtitle: "Cashflow, grand livre et SYSCOHADA",
                        icon: "chart.bar.xaxis", color: theme.primary, destination: AccountingFinanceNativeView(),
                        limule: ("report", {
                            "Génère un rapport financier mensuel complet en français. Données disponibles : Trésorerie=\(fcfa(overview?.treasuryBalance ?? 0)), Chiffre d'affaires=\(fcfa(overview?.invoicesTotal ?? 0)), Nombre de transactions=\(overview?.txCount ?? 0). Inclure analyse P&L, ratios de liquidité, recommandations opérationnelles."
                        })
                    )
                    ReportNavRow(
                        title: "Rapport TERAS", subtitle: "Risques, maturité et recommandations",
                        icon: KomptaBrand.limuleIcon, color: .red, destination: ReportsTerasNativeView(),
                        limule: ("declaration", {
                            "Génère un rapport de conformité TERAS détaillé en français. Score actuel : \(overview?.terasScore ?? 0)/100. Analyser les risques de conformité OHADA/CEMAC, identifier les actions correctives prioritaires, proposer un plan d'amélioration du score."
                        })
                    )
                    ReportNavRow(
                        title: "Analytique", subtitle: "CA, recouvrement, marge et clients",
                        icon: "chart.line.uptrend.xyaxis", color: .blue, destination: CompanyAnalyticsNativeView(),
                        limule: ("report", {
                            "Génère une synthèse analytique en français. Chiffre d'affaires=\(fcfa(overview?.invoicesTotal ?? 0)), Factures payées=\(fcfa(overview?.invoicesPaid ?? 0)), Factures en attente=\(fcfa(overview?.invoicesPending ?? 0)). Inclure analyse du recouvrement, de la marge estimée et des tendances clients, avec recommandations."
                        })
                    )
                    ReportNavRow(
                        title: "Rapport RH", subtitle: "Effectifs et dernier run de paie",
                        icon: "person.2.fill", color: .orange, destination: HRView(),
                        limule: ("report", {
                            "Génère un rapport RH synthétique en français. Effectif=\(overview?.employees ?? 0) employés. Dernier cycle de paie : \(payrollRuns.first?.period ?? "non lancé"), \(payrollRuns.first?.payslips.count ?? 0) bulletins. Inclure analyse des effectifs, recommandations sur la politique RH, gestion des risques liés au personnel."
                        })
                    )
                    ReportNavRow(
                        title: "Audit entreprise", subtitle: "Traçabilité opérationnelle",
                        icon: "doc.text.magnifyingglass", color: .purple, destination: CompanyAuditLogsView(),
                        limule: ("report", {
                            "Génère un rapport d'audit synthétique en français sur la traçabilité opérationnelle de l'entreprise. Contexte : \(overview?.txCount ?? 0) transactions enregistrées, score TERAS=\(overview?.terasScore ?? 0)/100. Inclure une analyse des points de contrôle interne, des anomalies potentielles et des recommandations de gouvernance."
                        })
                    )
                }
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
        .navigationTitle("Rapports")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        async let overviewReq = APIClient.shared.dashboardOverview()
        async let payrollReq = APIClient.shared.payrollRuns()
        overview = try? await overviewReq
        payrollRuns = (try? await payrollReq) ?? []
        isLoading = false
    }
}

private struct ReportNavRow<Destination: View>: View {
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
    let destination: Destination
    /// (kind, prompt) — si fourni, affiche le bouton "Générer avec Limule".
    var limule: (kind: String, prompt: () -> String)? = nil

    @State private var showLimule = false

    var body: some View {
        HStack(spacing: 8) {
            NavigationLink { destination } label: {
                HStack(spacing: 12) {
                    BrandedIcon(name: icon, tint: color, size: 20).frame(width: 28)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title).font(.subheadline.bold())
                        Text(subtitle).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            if let limule {
                Spacer(minLength: 4)
                Button { showLimule = true } label: {
                    BrandedIcon(name: KomptaBrand.limuleIcon, tint: .purple, size: 20)
                }
                .buttonStyle(.plain)
                .sheet(isPresented: $showLimule) {
                    LimuleReportSheet(title: title, kind: limule.kind, prompt: limule.prompt())
                }
            }
        }
    }
}

// ============================================================================
//  Génération de rapport IA (Limule) + export PDF — parité web ReportsHubPage.
// ============================================================================

struct LimuleReportSheet: View {
    let title: String
    let kind: String
    let prompt: String

    @Environment(\.dismiss) private var dismiss
    @State private var content: String = ""
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 10) {
                        BrandedIcon(name: KomptaBrand.limuleIcon, tint: .purple, size: 32)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Limule · Rapport IA").font(.caption.bold()).foregroundStyle(.purple)
                            Text(title).font(.headline)
                        }
                        Spacer()
                    }

                    if loading {
                        HStack(spacing: 8) {
                            ProgressView()
                            Text("Limule génère votre rapport…").font(.subheadline).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 20)
                        .frame(maxWidth: .infinity)
                    } else if let error {
                        VStack(spacing: 10) {
                            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange).font(.title2)
                            Text(error).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                            Button("Réessayer") { Task { await generate() } }
                        }
                        .padding(.vertical, 20)
                        .frame(maxWidth: .infinity)
                    } else if !content.isEmpty {
                        MarkdownText(content, accent: .purple)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        DownloadButton(
                            title: "Exporter en PDF",
                            fileName: "limule-\(title.lowercased().replacingOccurrences(of: " ", with: "-")).pdf",
                            fetch: {
                                try await APIClient.shared.aiContentPdf(
                                    AIContentPdfPayload(title: title, content: content, prompt: prompt, kind: kind)
                                )
                            }
                        )
                        .buttonStyle(.borderedProminent)
                        .tint(.purple)
                    }
                }
                .padding()
            }
            .navigationTitle("Rapport IA")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
        .task { await generate() }
    }

    private func generate() async {
        loading = true; error = nil
        do {
            let result = try await APIClient.shared.aiGenerate(
                AIGeneratePayload(kind: kind, title: title, prompt: prompt, context: "reports")
            )
            content = result.content
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        loading = false
    }
}

struct ReportsTerasNativeView: View {
    @State private var alerts: [TerasAlert] = []
    @State private var scores: [TerasScore] = []
    @StateObject private var readiness = Loadable<ReadinessReport>()

    var body: some View {
        List {
            if let report = readiness.value {
                Section {
                    MetricCard(title: "Readiness OHADA", value: "\(report.score)%", icon: "checkmark.seal.fill", color: report.status == "pass" ? .green : .orange)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
                Section("Actions recommandées") {
                    ForEach(report.next_actions, id: \.self) { Text($0).font(.subheadline) }
                }
            }
            Section("Scores TERAS") {
                if scores.isEmpty {
                    Text("Aucun score disponible").foregroundStyle(.secondary).font(.subheadline)
                } else {
                    ForEach(scores) { score in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(score.domain).font(.subheadline.bold())
                                Spacer()
                                Text("\(score.score)/100").font(.headline)
                            }
                            ProgressView(value: Double(score.score), total: 100).tint(score.score >= 70 ? .green : .orange)
                            Text(score.summary).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            Section("Alertes") {
                if alerts.isEmpty {
                    Text("Aucune alerte active").foregroundStyle(.secondary).font(.subheadline)
                } else {
                    ForEach(alerts) { alert in
                        VStack(alignment: .leading, spacing: 5) {
                            HStack {
                                Label(alert.title, systemImage: statusIcon(alert.severity))
                                    .font(.subheadline.bold())
                                    .foregroundStyle(colorFromName(alert.severityColorName))
                                Spacer()
                                Text("\(alert.confidence)%").font(.caption.bold()).foregroundStyle(.secondary)
                            }
                            Text(alert.recommendation).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                        }
                    }
                }
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
        .navigationTitle("Rapport TERAS")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        async let alertReq = APIClient.shared.terasAlerts()
        async let scoreReq = APIClient.shared.terasScores()
        await readiness.load { try await APIClient.shared.accountingReadiness() }
        alerts = (try? await alertReq) ?? []
        scores = (try? await scoreReq) ?? []
    }
}

// MARK: - Accounting finance

struct AccountingFinanceNativeView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @State private var mode: AccountingModeResponse?
    @State private var cashflow: [CashFlowPoint] = []
    @State private var expenses: [ExpenseCategory] = []
    @State private var syscemac: [SyscemacStatus] = []
    @State private var journal: [JournalEntry] = []
    @State private var balance: TrialBalance?
    @StateObject private var readiness = Loadable<ReadinessReport>()
    @State private var isLoading = true

    var body: some View {
        List {
            if isLoading {
                Section { ShimmerBox(height: 120); ShimmerBox(height: 180) }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            } else {
                Section {
                    HStack(spacing: 12) {
                        MetricCard(title: "Mode", value: (mode?.mode ?? "simple").uppercased(), icon: "switch.2", color: theme.primary)
                        MetricCard(title: "Balance", value: balance?.balanced == true ? "OK" : "À revoir", icon: "scalemass.fill", color: balance?.balanced == true ? .green : .orange)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
                if let balance {
                    Section("Balance générale") {
                        HStack {
                            Text("Débit").foregroundStyle(.secondary)
                            Spacer()
                            Text(fcfa(balance.total_debit)).bold()
                        }
                        HStack {
                            Text("Crédit").foregroundStyle(.secondary)
                            Spacer()
                            Text(fcfa(balance.total_credit)).bold()
                        }
                        ForEach(balance.lines.prefix(12)) { line in
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(line.account_code) · \(line.account_name)").font(.subheadline.bold())
                                Text("Débit \(fcfa(line.debit)) · Crédit \(fcfa(line.credit)) · Solde \(fcfa(line.balance))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                if !cashflow.isEmpty {
                    Section("Cashflow") {
                        CashFlowChart(points: cashflow)
                            .padding(.vertical, 8)
                            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                            .listRowBackground(Color.clear)
                        ForEach(cashflow) { p in
                            HStack {
                                Text(p.label).font(.subheadline.bold())
                                Spacer()
                                VStack(alignment: .trailing) {
                                    Text("+ \(fcfa(p.inflow))").foregroundStyle(.green)
                                    Text("- \(fcfa(p.outflow))").foregroundStyle(.red)
                                }
                                .font(.caption.bold())
                            }
                        }
                    }
                }
                if !expenses.isEmpty {
                    Section("Dépenses") {
                        ExpenseDonutChart(expenses: expenses)
                            .padding(.vertical, 8)
                        ForEach(expenses.prefix(8)) { expense in
                            HStack {
                                Circle().fill(Color(hex: expense.color) ?? .gray).frame(width: 10, height: 10)
                                Text(expense.name)
                                Spacer()
                                Text(fcfa(expense.amount)).bold()
                            }
                        }
                    }
                }
                Section("SYSCOHADA") {
                    ForEach(syscemac) { item in
                        HStack {
                            Label(item.label, systemImage: statusIcon(item.status))
                                .foregroundStyle(colorFromName(item.colorName))
                            Spacer()
                            Text("\(item.count)").font(.caption.bold()).foregroundStyle(.secondary)
                        }
                    }
                }
                if let report = readiness.value {
                    Section("Readiness OHADA") {
                        ForEach(report.sections) { section in
                            NavigationLink {
                                ReadinessSectionDetail(section: section)
                            } label: {
                                HStack {
                                    Text(section.title)
                                    Spacer()
                                    StatusPill(text: section.status, colorName: section.status == "pass" ? "green" : "orange")
                                }
                            }
                        }
                    }
                }
                Section("Grand livre récent") {
                    ForEach(journal.prefix(12)) { entry in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(entry.reference).font(.subheadline.bold())
                                Spacer()
                                Text(fcfa(entry.amount)).bold()
                            }
                            Text(entry.label).font(.caption).foregroundStyle(.secondary)
                            Text(shortDate(entry.date)).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
        .navigationTitle("Comptabilité")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        async let modeReq = APIClient.shared.accountingMode()
        async let cashReq = APIClient.shared.accountingCashflow()
        async let expenseReq = APIClient.shared.accountingExpenses()
        async let sysReq = APIClient.shared.accountingSyscemac()
        async let journalReq = APIClient.shared.accountingJournal(limit: 80)
        async let balanceReq = APIClient.shared.accountingBalance()
        await readiness.load { try await APIClient.shared.accountingReadiness() }
        mode = try? await modeReq
        cashflow = (try? await cashReq) ?? []
        expenses = (try? await expenseReq) ?? []
        syscemac = (try? await sysReq) ?? []
        journal = (try? await journalReq) ?? []
        balance = try? await balanceReq
        isLoading = false
    }
}

private struct ReadinessSectionDetail: View {
    let section: ReadinessSection
    var body: some View {
        List(section.items) { item in
            VStack(alignment: .leading, spacing: 5) {
                Label(item.label, systemImage: statusIcon(item.status))
                    .font(.headline)
                    .foregroundStyle(colorFromName(item.colorName))
                Text(item.detail).font(.subheadline).foregroundStyle(.secondary)
                if let action = item.action, !action.isEmpty {
                    Text(action).font(.caption.bold()).foregroundStyle(.orange)
                }
            }
            .padding(.vertical, 4)
        }
        .navigationTitle(section.title)
    }
}

// MARK: - Projects

struct ProjectsNativeView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var state = Loadable<[KTask]>()
    @State private var showNew = false
    @State private var projectName = ""

    private func grouped(_ tasks: [KTask]) -> [(String, [KTask])] {
        Dictionary(grouping: tasks) { $0.project.isEmpty ? "Sans projet" : $0.project }
            .map { ($0.key, $0.value.sorted { $0.order_index < $1.order_index }) }
            .sorted { $0.0 < $1.0 }
    }

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun projet", emptyIcon: "folder.badge.plus", reload: load) { tasks in
            List {
                ForEach(grouped(tasks), id: \.0) { project, items in
                    let done = items.filter { $0.status == "done" }.count
                    let progress = items.isEmpty ? 0.0 : Double(done) / Double(items.count)
                    Section(project) {
                        HStack(spacing: 12) {
                            MetricCard(title: "Tâches", value: "\(items.count)", icon: "checklist", color: theme.primary)
                            MetricCard(title: "Terminées", value: "\(done)", icon: "checkmark.seal", color: .green)
                        }
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack { Text("Avancement").font(.caption).foregroundStyle(.secondary)
                                Spacer(); Text("\(Int(progress * 100))%").font(.caption.bold()) }
                            ProgressView(value: progress).tint(theme.primary)
                        }
                        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 8, trailing: 16))
                        .listRowBackground(Color.clear)
                        ForEach(items.prefix(6)) { task in TaskCompactRow(task: task) }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Projets")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showNew = true } label: { Image(systemName: "plus") }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { ProjectTaskFormView { await load() } }
    }

    private func load() async { await state.load { try await APIClient.shared.tasks() } }
}

private struct ProjectTaskFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var project = ""
    @State private var title = ""
    @State private var assignee = ""
    @State private var priority = "normal"
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Projet") {
                    TextField("Nom du projet", text: $project)
                    TextField("Première tâche", text: $title)
                    TextField("Assigné à", text: $assignee)
                    Picker("Priorité", selection: $priority) {
                        Text("Basse").tag("low")
                        Text("Normale").tag("normal")
                        Text("Haute").tag("high")
                    }
                    .pickerStyle(.segmented)
                }
            }
            .navigationTitle("Nouveau projet")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Créer") { Task { await save() } }
                        .disabled(project.isEmpty || title.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        do {
            _ = try await APIClient.shared.createTask(TaskPayload(title: title, priority: priority, assignee_name: assignee, project: project))
            await onSaved()
            dismiss()
        } catch { }
        saving = false
    }
}

// MARK: - Audit

struct CompanyAuditLogsView: View {
    @StateObject private var state = Loadable<[CompanyAuditLogEntry]>()
    @State private var search = ""

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun log", emptyIcon: "doc.text.magnifyingglass", reload: load) { logs in
            List(filtered(logs)) { log in
                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        Text(log.action).font(.subheadline.bold())
                        Spacer()
                        Text(shortDate(log.created_at)).font(.caption).foregroundStyle(.secondary)
                    }
                    Text(log.details.isEmpty ? log.resource_type : log.details)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                    Text("\(log.user_name) · \(log.source)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .searchable(text: $search, prompt: "Action, utilisateur ou détail")
        .navigationTitle("Audit")
        .task { await load() }
        .refreshable { await load() }
    }

    private func filtered(_ logs: [CompanyAuditLogEntry]) -> [CompanyAuditLogEntry] {
        guard !search.isEmpty else { return logs }
        return logs.filter {
            $0.action.localizedCaseInsensitiveContains(search) ||
            $0.user_name.localizedCaseInsensitiveContains(search) ||
            $0.details.localizedCaseInsensitiveContains(search)
        }
    }

    private func load() async { await state.load { try await APIClient.shared.companyAuditLogs() } }
}

// MARK: - Analytics

struct CompanyAnalyticsNativeView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @State private var invoices: [Invoice] = []
    @State private var clients: [Client] = []
    @State private var revenue: [RevenueSeriesPoint] = []
    @State private var cashflow: [CashFlowPoint] = []
    @State private var txStats: TransactionStats?
    @State private var isLoading = true

    private var totalRevenue: Double { invoices.reduce(0) { $0 + $1.total_amount } }
    private var paidRevenue: Double { invoices.filter(\.isPaid).reduce(0) { $0 + $1.total_amount } }
    private var recoveryRate: Double { totalRevenue > 0 ? paidRevenue / totalRevenue * 100 : 0 }

    var body: some View {
        List {
            if isLoading {
                Section { ShimmerBox(height: 120); ShimmerBox(height: 220) }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            } else {
                Section {
                    HStack(spacing: 12) {
                        MetricCard(title: "CA facturé", value: fcfa(totalRevenue), icon: "banknote.fill", color: theme.primary)
                        MetricCard(title: "Recouvrement", value: "\(Int(recoveryRate))%", icon: "percent", color: .blue)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    HStack(spacing: 12) {
                        MetricCard(title: "Clients", value: "\(clients.count)", icon: "person.2.fill", color: .orange)
                        MetricCard(title: "Trésorerie", value: fcfa(txStats?.balance ?? 0), icon: "building.columns", color: .teal)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
                Section("Revenus / marge") {
                    TrendBarsView(points: revenue)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
                if !cashflow.isEmpty {
                    Section("Cashflow") {
                        CashFlowChart(points: cashflow)
                            .padding(.vertical, 8)
                            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                            .listRowBackground(Color.clear)
                        ForEach(cashflow) { point in
                            HStack {
                                Text(point.label).font(.subheadline.bold())
                                Spacer()
                                Text(fcfa(point.inflow - point.outflow))
                                    .bold()
                                    .foregroundStyle(point.inflow >= point.outflow ? .green : .red)
                            }
                        }
                    }
                }
                Section("Top clients") {
                    ForEach(topClients(), id: \.name) { item in
                        HStack {
                            Text(item.name)
                            Spacer()
                            Text(fcfa(item.amount)).bold()
                        }
                    }
                }
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
        .navigationTitle("Analytique")
        .task { await load() }
        .refreshable { await load() }
    }

    private func topClients() -> [(name: String, amount: Double)] {
        var totals: [String: Double] = [:]
        for invoice in invoices {
            totals[invoice.customer_name, default: 0] += invoice.total_amount
        }
        let sorted = totals
            .map { (name: $0.key, amount: $0.value) }
            .sorted { $0.amount > $1.amount }
        return Array(sorted.prefix(8))
    }

    private func load() async {
        isLoading = true
        async let invoiceReq = APIClient.shared.invoices()
        async let clientReq = APIClient.shared.clients()
        async let revenueReq = APIClient.shared.revenueSeries(period: "annee")
        async let cashReq = APIClient.shared.accountingCashflow()
        async let txReq = APIClient.shared.transactionStats()
        invoices = (try? await invoiceReq) ?? []
        clients = (try? await clientReq) ?? []
        revenue = (try? await revenueReq) ?? []
        cashflow = (try? await cashReq) ?? []
        txStats = try? await txReq
        isLoading = false
    }
}

// MARK: - Fiscal agenda

struct AgendaFiscalNativeView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var state = Loadable<[FiscalDeadline]>()
    @State private var vat: VatSummary?
    @State private var showNew = false
    @State private var generating = false

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune échéance", emptyIcon: "calendar.badge.exclamationmark", reload: load) { deadlines in
            List {
                if let vat {
                    Section {
                        HStack(spacing: 12) {
                            MetricCard(title: "TVA collectée", value: fcfa(vat.vat_collected), icon: "percent", color: theme.primary)
                            MetricCard(title: "Factures", value: "\(vat.invoices_count)", icon: "doc.text", color: .blue)
                        }
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                    }
                }
                Section("Échéances") {
                    ForEach(deadlines) { item in
                        HStack(spacing: 12) {
                            Image(systemName: statusIcon(item.status)).foregroundStyle(colorFromName(item.colorName)).frame(width: 24)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.title).font(.subheadline.bold())
                                Text("\(item.tax_type) · \(shortDate(item.due_date)) · rappel J-\(item.reminder_days)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button { Task { await toggle(item) } } label: {
                                Image(systemName: item.isDone ? "arrow.uturn.backward.circle" : "checkmark.circle")
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .onDelete { idx in Task { await delete(deadlines, idx) } }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Fiscal")
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button { Task { await generate() } } label: {
                    if generating { Image(systemName: "hourglass") }
                    else { LimuleMark(size: 22, showAura: false) }
                }
                    .disabled(generating)
                Button { showNew = true } label: { Image(systemName: "plus") }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { FiscalDeadlineFormView { await load() } }
    }

    private func load() async {
        await state.load { try await APIClient.shared.fiscalDeadlines() }
        vat = try? await APIClient.shared.fiscalVatSummary()
    }

    private func generate() async {
        generating = true
        _ = try? await APIClient.shared.generateFiscalDeadlines()
        generating = false
        await load()
    }

    private func toggle(_ item: FiscalDeadline) async {
        _ = try? await APIClient.shared.updateFiscalDeadlineStatus(item.id, status: item.isDone ? "upcoming" : "done")
        await load()
    }

    private func delete(_ items: [FiscalDeadline], _ idx: IndexSet) async {
        for i in idx { try? await APIClient.shared.deleteFiscalDeadline(items[i].id) }
        await load()
    }
}

private struct FiscalDeadlineFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var description = ""
    @State private var taxType = "TVA"
    @State private var dueDate = Date()
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Échéance") {
                    TextField("Titre", text: $title)
                    TextField("Description", text: $description, axis: .vertical)
                    Picker("Type", selection: $taxType) {
                        Text("TVA").tag("TVA")
                        Text("IS").tag("IS")
                        Text("CNSS").tag("CNSS")
                        Text("Patente").tag("patente")
                        Text("Autre").tag("autre")
                    }
                    DatePicker("Date limite", selection: $dueDate, displayedComponents: .date)
                }
            }
            .navigationTitle("Nouvelle échéance")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }
                        .disabled(title.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        do {
            _ = try await APIClient.shared.createFiscalDeadline(FiscalDeadlinePayload(title: title, description: description, due_date: f.string(from: dueDate), tax_type: taxType))
            await onSaved()
            dismiss()
        } catch { }
        saving = false
    }
}

// MARK: - Legislation

struct LegislationNativeView: View {
    @StateObject private var state = Loadable<[LegislationDocument]>()
    @State private var context: LegislationContext?
    @State private var filter = ""
    @State private var analyzing: Int?
    @State private var showImporter = false
    @State private var uploading = false
    @State private var uploadError: String?

    private let categories = ["", "fiscal", "social", "commerce", "finance", "general"]

    var body: some View {
        VStack(spacing: 0) {
            Picker("Catégorie", selection: $filter) {
                Text("Tout").tag("")
                Text("Fiscal").tag("fiscal")
                Text("Social").tag("social")
                Text("Commerce").tag("commerce")
                Text("Finance").tag("finance")
                Text("Général").tag("general")
            }
            .pickerStyle(.segmented)
            .padding()

            AsyncList(state: state, emptyTitle: "Aucun document légal", emptyIcon: "books.vertical", reload: load) { docs in
                List {
                    if let context {
                        Section("Contexte Limule") {
                            HStack {
                                LimuleMark(size: 22, showAura: false)
                                Text("\(context.doc_count) document(s) analysé(s)")
                                Spacer()
                            }
                            if !context.context.isEmpty {
                                Text(context.context).font(.caption).foregroundStyle(.secondary).lineLimit(5)
                            }
                        }
                    }
                    Section("Documents") {
                        ForEach(docs) { doc in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(doc.title).font(.subheadline.bold())
                                        Text("\(doc.categoryLabel) · \(doc.country_scope) · \(doc.filename)").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if doc.analyzed {
                                        Image(systemName: "checkmark.seal.fill").foregroundStyle(.green)
                                    }
                                }
                                if !doc.ai_summary.isEmpty {
                                    Text(doc.ai_summary).font(.caption).foregroundStyle(.secondary).lineLimit(4)
                                }
                                Button {
                                    Task { await analyze(doc) }
                                } label: {
                                    HStack(spacing: 6) {
                                        LimuleMark(size: 18, showAura: false)
                                        Text(analyzing == doc.id ? "Analyse Limule…" : (doc.analyzed ? "Réanalyser avec Limule" : "Analyser avec Limule"))
                                    }
                                }
                                .disabled(analyzing != nil)
                                .buttonStyle(.borderless)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
                #if os(iOS)
                .listStyle(.insetGrouped)
                #endif
            }
        }
        .navigationTitle("Législation")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showImporter = true } label: {
                    Image(systemName: uploading ? "hourglass" : "arrow.up.doc")
                }
                .disabled(uploading)
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .onChange(of: filter) { _, _ in Task { await load() } }
        .fileImporter(isPresented: $showImporter,
                      allowedContentTypes: [.pdf, .plainText, .commaSeparatedText, .spreadsheet, .item],
                      allowsMultipleSelection: true) { result in
            Task { await handleImport(result) }
        }
        .overlay(alignment: .bottom) {
            if let uploadError {
                Text(uploadError).font(.caption).foregroundStyle(.white)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(.red, in: Capsule()).padding(.bottom, 12)
            }
        }
    }

    private func load() async {
        await state.load { try await APIClient.shared.legislationDocuments(category: filter.isEmpty ? nil : filter) }
        context = try? await APIClient.shared.legislationContext()
    }

    private func analyze(_ doc: LegislationDocument) async {
        analyzing = doc.id
        _ = try? await APIClient.shared.analyzeLegislationDocument(doc.id)
        analyzing = nil
        await load()
    }

    private func handleImport(_ result: Result<[URL], Error>) async {
        uploadError = nil
        guard case .success(let urls) = result, !urls.isEmpty else { return }
        uploading = true
        let cat = filter.isEmpty ? "general" : filter
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url) else { continue }
            let ext = url.pathExtension.lowercased()
            let mime: String = ext == "pdf" ? "application/pdf"
                : ext == "csv" ? "text/csv"
                : ext == "txt" ? "text/plain"
                : ext == "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                : ext == "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                : "application/octet-stream"
            do {
                _ = try await APIClient.shared.uploadLegislationDocument(
                    data, fileName: url.lastPathComponent, mime: mime,
                    title: url.deletingPathExtension().lastPathComponent, category: cat)
            } catch {
                uploadError = (error as? LocalizedError)?.errorDescription ?? "Échec de l'envoi"
            }
        }
        uploading = false
        await load()
        if uploadError != nil { try? await Task.sleep(nanoseconds: 3_000_000_000); uploadError = nil }
    }
}

// MARK: - Safe mode

struct SafeModeNativeView: View {
    @State private var exporting = false
    @State private var fileURL: URL?
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Label("Mode dégradé", systemImage: "lifepreserver.fill")
                    .font(.headline)
                Text("Générez un pack PDF complet pour travailler hors connexion : entreprise, factures, clients, paie, documents et analyse Limule.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Section {
                Button { Task { await exportPack() } } label: {
                    Label(exporting ? "Préparation…" : "Exporter le pack PDF", systemImage: "square.and.arrow.down")
                }
                .disabled(exporting)
                if let fileURL {
                    ShareLink(item: fileURL) {
                        Label("Partager / ouvrir le pack", systemImage: "square.and.arrow.up")
                    }
                    Text(fileURL.lastPathComponent).font(.caption).foregroundStyle(.secondary)
                }
                if let error { Text(error).font(.caption).foregroundStyle(.red) }
            }
            Section("Restauration") {
                Text("La restauration assistée reste disponible côté web pour les uploads multi-sections. Sur native, ce premier flux couvre l’export d’urgence vérifié.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
        .navigationTitle("Safe Mode")
    }

    private func exportPack() async {
        exporting = true
        error = nil
        do {
            let data = try await APIClient.shared.safeModeExport()
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("kompta-safe-mode-\(Date().timeIntervalSince1970).pdf")
            try data.write(to: url, options: .atomic)
            fileURL = url
        } catch {
            self.error = error.localizedDescription
        }
        exporting = false
    }
}
