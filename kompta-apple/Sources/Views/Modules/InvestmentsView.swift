import SwiftUI
import Charts

// ============================================================================
//  InvestmentsView — full port of the web Investments page.
//  Live Yahoo Finance quotes, interactive price chart, fundamentals grid,
//  position P&L, per-stock + portfolio Limule AI analyses, ticker-search add
//  flow, edit/delete. Works on iOS (NavigationStack) and macOS (split detail).
// ============================================================================

private let kPeriods: [(key: String, label: String)] = [
    ("1d", "1J"), ("5d", "5J"), ("1mo", "1M"), ("3mo", "3M"),
    ("6mo", "6M"), ("1y", "1A"), ("5y", "5A"), ("max", "Max"),
]

private let kPalette: [Color] = [
    .green, .blue, .orange, .red, .purple, .cyan, .pink, .mint, .indigo, .teal,
]

// MARK: - View model

@MainActor
final class InvestmentsModel: ObservableObject {
    @Published var investments: [Investment] = []
    @Published var quotes: [String: StockQuote] = [:]
    @Published var history: [StockHistoryPoint] = []
    @Published var news: [StockNewsItem] = []

    @Published var loading = false
    @Published var loadError: String?
    @Published var historyLoading = false

    @Published var selectedId: Int?
    @Published var period = "1y"

    @Published var analysis: String?
    @Published var analysisLoading = false
    @Published var portfolioAnalysis: String?
    @Published var portfolioLoading = false

    var selected: Investment? { investments.first { $0.id == selectedId } }

    // ── Loading ──────────────────────────────────────────────────────────
    func loadAll() async {
        loading = true; loadError = nil
        do {
            investments = try await APIClient.shared.investments()
            if selectedId == nil { selectedId = investments.first?.id }
            await refreshQuotes()
            if let s = selected { await loadDetail(for: s) }
        } catch {
            loadError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        loading = false
    }

    func refreshQuotes() async {
        let tickers = Set(investments.map { $0.ticker })
        await withTaskGroup(of: (String, StockQuote?).self) { group in
            for t in tickers {
                group.addTask { (t, try? await APIClient.shared.stockQuote(t)) }
            }
            for await (t, q) in group { if let q { quotes[t] = q } }
        }
    }

    func select(_ id: Int) {
        guard id != selectedId else { return }
        selectedId = id; analysis = nil; news = []; history = []
        if let s = selected { Task { await loadDetail(for: s) } }
    }

    func setPeriod(_ p: String) {
        period = p
        if let s = selected { Task { await loadHistory(for: s) } }
    }

    func loadDetail(for inv: Investment) async {
        async let _ = loadHistory(for: inv)
        if quotes[inv.ticker] == nil, let q = try? await APIClient.shared.stockQuote(inv.ticker) {
            quotes[inv.ticker] = q
        }
        news = (try? await APIClient.shared.stockNewsFr(inv.ticker)) ?? []
        if news.isEmpty { news = (try? await APIClient.shared.stockNews(inv.ticker)) ?? [] }
    }

    func loadHistory(for inv: Investment) async {
        historyLoading = true
        history = (try? await APIClient.shared.stockHistory(inv.ticker, period: period)) ?? []
        historyLoading = false
    }

    // ── Mutations ────────────────────────────────────────────────────────
    func delete(_ inv: Investment) async {
        try? await APIClient.shared.deleteInvestment(inv.id)
        if selectedId == inv.id { selectedId = nil }
        await loadAll()
    }

    // ── AI ───────────────────────────────────────────────────────────────
    func analyzeSelected() async {
        guard let s = selected else { return }
        analysisLoading = true; analysis = nil
        do {
            let res = try await APIClient.shared.analyzeInvestment(s.ticker, invId: s.id)
            analysis = res.analysis
        } catch {
            analysis = "Analyse indisponible pour le moment. Réessayez plus tard."
        }
        analysisLoading = false
    }

    func evaluatePortfolio() async {
        guard !investments.isEmpty else { return }
        portfolioLoading = true; portfolioAnalysis = nil
        do {
            portfolioAnalysis = try await APIClient.shared.analyzePortfolio().analysis
        } catch {
            // Fallback: analyse the top holding individually.
            if let first = investments.first,
               let res = try? await APIClient.shared.analyzeInvestment(first.ticker, invId: first.id) {
                portfolioAnalysis = "Analyse du portefeuille (\(investments.count) position(s))\n\n" + res.analysis
            } else {
                portfolioAnalysis = "Évaluation du portefeuille indisponible pour le moment."
            }
        }
        portfolioLoading = false
    }

    // ── Derived stats ──────────────────────────────────────────────────────
    struct Position: Identifiable { let inv: Investment; let current: Double; let gain: Double; let gainPct: Double; let color: Color
        var id: Int { inv.id } }

    var positions: [Position] {
        investments.enumerated().map { i, inv in
            let q = quotes[inv.ticker]
            let current = (q?.price).map { inv.shares * $0 } ?? inv.invested_amount
            let gain = current - inv.invested_amount
            let pct = inv.invested_amount > 0 ? gain / inv.invested_amount * 100 : 0
            return Position(inv: inv, current: current, gain: gain, gainPct: pct, color: kPalette[i % kPalette.count])
        }
    }
    var totalInvested: Double { investments.reduce(0) { $0 + $1.invested_amount } }
    var totalCurrent: Double { positions.reduce(0) { $0 + $1.current } }
    var totalGain: Double { totalCurrent - totalInvested }
    var totalGainPct: Double { totalInvested > 0 ? totalGain / totalInvested * 100 : 0 }
}

// MARK: - Root view

struct InvestmentsView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var model = InvestmentsModel()
    @State private var mode = 0          // 0 = detail, 1 = portfolio
    @State private var showAdd = false
    @State private var editTarget: Investment?

    var body: some View {
        Group {
            if model.loading && model.investments.isEmpty {
                loadingState
            } else if let err = model.loadError, model.investments.isEmpty {
                ContentUnavailableView {
                    Label("Erreur", systemImage: "exclamationmark.triangle.fill")
                } description: { Text(err) } actions: {
                    Button("Réessayer") { Task { await model.loadAll() } }
                }
            } else if model.investments.isEmpty {
                emptyState
            } else {
                content
            }
        }
        .navigationTitle("Investissements")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { Task { await model.refreshQuotes() } } label: { Image(systemName: "arrow.clockwise") }
            }
            ToolbarItem(placement: .primaryAction) {
                Button { showAdd = true } label: { Image(systemName: "plus") }
            }
        }
        .task { if model.investments.isEmpty { await model.loadAll() } }
        .refreshable { await model.loadAll() }
        .sheet(isPresented: $showAdd) { AddInvestmentSheet { await model.loadAll() } }
        .sheet(item: $editTarget) { inv in
            EditInvestmentSheet(investment: inv) { await model.loadAll() }
        }
    }

    private var loadingState: some View {
        VStack(spacing: 12) { ForEach(0..<5, id: \.self) { _ in ShimmerBox(height: 64, cornerRadius: 14) } }
            .padding()
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("Aucun investissement", systemImage: "chart.line.uptrend.xyaxis")
        } description: {
            Text("Suivez vos actions en temps réel et obtenez l'analyse de Limule.")
        } actions: {
            Button { showAdd = true } label: { Label("Ajouter une position", systemImage: "plus") }
                .buttonStyle(.borderedProminent).tint(theme.primary)
        }
    }

    private var content: some View {
        VStack(spacing: 0) {
            Picker("Vue", selection: $mode) {
                Text("Détail").tag(0)
                Text("Portefeuille").tag(1)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal).padding(.top, 8).padding(.bottom, 4)

            if mode == 0 {
                InvestmentDetailScreen(model: model, onEdit: { editTarget = $0 })
            } else {
                PortfolioScreen(model: model, onEdit: { editTarget = $0 },
                                onOpen: { model.select($0.id); mode = 0 })
            }
        }
    }
}

// MARK: - Detail screen

private struct InvestmentDetailScreen: View {
    @ObservedObject var model: InvestmentsModel
    @EnvironmentObject private var theme: CompanyTheme
    let onEdit: (Investment) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                positionSelector
                if let inv = model.selected { detail(for: inv) }
            }
            .padding()
        }
    }

    private var positionSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(model.positions) { pos in
                    let isSel = pos.inv.id == model.selectedId
                    Button { model.select(pos.inv.id) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(pos.inv.ticker).font(.caption.bold())
                            Text(pctStr(pos.gainPct, 1))
                                .font(.caption2).foregroundStyle(pos.gainPct >= 0 ? .green : .red)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(isSel ? theme.primary.opacity(0.15) : Color.secondary.opacity(0.08),
                                    in: RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10)
                            .stroke(isSel ? theme.primary : .clear, lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder
    private func detail(for inv: Investment) -> some View {
        let quote = model.quotes[inv.ticker]
        let pos = model.positions.first { $0.inv.id == inv.id }

        // Header
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(quote?.name ?? inv.display_name).font(.title2.bold())
                    HStack(spacing: 6) {
                        Text(inv.ticker).font(.caption.bold())
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(.secondary.opacity(0.15), in: Capsule())
                        if let ex = quote?.exchange, !ex.isEmpty {
                            Text(ex).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
                Spacer()
                Menu {
                    Button { onEdit(inv) } label: { Label("Modifier", systemImage: "pencil") }
                    Button(role: .destructive) { Task { await model.delete(inv) } } label: {
                        Label("Supprimer", systemImage: "trash")
                    }
                } label: { Image(systemName: "ellipsis.circle").font(.title3) }
            }
            if let q = quote {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("\(numStr(q.price ?? 0)) \(q.currency)").font(.title.bold())
                    Label("\(signedNum(q.change)) (\(pctStr(q.change_pct)))",
                          systemImage: q.change_pct >= 0 ? "arrow.up.right" : "arrow.down.right")
                        .font(.subheadline.bold())
                        .foregroundStyle(q.change_pct >= 0 ? .green : .red)
                }
                if !q.sector.isEmpty {
                    Text("\(q.sector) · \(q.industry)").font(.caption).foregroundStyle(.secondary)
                }
            }
        }

        chartCard(inv: inv)
        if let q = quote { metricsGrid(q) }
        positionCard(inv: inv, pos: pos, quote: quote)

        AIAnalysisPanel(
            title: "Analyse Limule",
            analysis: model.analysis,
            isLoading: model.analysisLoading,
            onRun: { Task { await model.analyzeSelected() } }
        )

        if !model.news.isEmpty { newsSection }
    }

    private func chartCard(inv: Investment) -> some View {
        GlassCard(padding: 14, cornerRadius: theme.cardRadius) {
            VStack(alignment: .leading, spacing: 10) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(kPeriods, id: \.key) { p in
                            Button { model.setPeriod(p.key) } label: {
                                Text(p.label).font(.caption.bold())
                                    .padding(.horizontal, 10).padding(.vertical, 5)
                                    .background(model.period == p.key ? theme.primary : Color.secondary.opacity(0.1),
                                                in: Capsule())
                                    .foregroundStyle(model.period == p.key ? .white : .secondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if model.historyLoading {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 180)
                } else if model.history.isEmpty {
                    Text("Historique indisponible").font(.callout).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, minHeight: 180)
                } else {
                    priceChart(inv: inv)
                }
            }
        }
    }

    private func priceChart(inv: Investment) -> some View {
        let pts = model.history
        let rising = (pts.last?.c ?? 0) >= (pts.first?.c ?? 0)
        let color: Color = rising ? .green : .red
        return Chart {
            ForEach(Array(pts.enumerated()), id: \.offset) { idx, p in
                LineMark(x: .value("i", idx), y: .value("Prix", p.c))
                    .foregroundStyle(color)
                    .interpolationMethod(.catmullRom)
                AreaMark(x: .value("i", idx), y: .value("Prix", p.c))
                    .foregroundStyle(.linearGradient(colors: [color.opacity(0.25), color.opacity(0)],
                                                     startPoint: .top, endPoint: .bottom))
                    .interpolationMethod(.catmullRom)
            }
            if inv.purchase_price_ref > 0 {
                RuleMark(y: .value("Achat", inv.purchase_price_ref))
                    .foregroundStyle(.orange.opacity(0.7))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    .annotation(position: .top, alignment: .leading) {
                        Text("Achat").font(.caption2).foregroundStyle(.orange)
                    }
            }
        }
        .chartXAxis(.hidden)
        .chartYScale(domain: .automatic(includesZero: false))
        .frame(height: 200)
    }

    private func metricsGrid(_ q: StockQuote) -> some View {
        let cols = [GridItem(.adaptive(minimum: 110), spacing: 10)]
        return VStack(alignment: .leading, spacing: 8) {
            Text("INDICATEURS CLÉS").font(.caption.bold()).foregroundStyle(.secondary)
            LazyVGrid(columns: cols, spacing: 10) {
                metric("Capitalisation", q.market_cap_fmt)
                metric("P/E", fmtOpt(q.pe_ratio, 1))
                metric("BPA", fmtOpt(q.eps, 2))
                metric("Beta", fmtOpt(q.beta, 2))
                metric("+ Haut 52s", fmtOpt(q.week52_high, 2))
                metric("+ Bas 52s", fmtOpt(q.week52_low, 2))
                metric("Ouverture", fmtOpt(q.open, 2))
                metric("Volume", q.volume.map { numStr($0 / 1_000_000, 1) + "M" } ?? "—")
                if let dy = q.dividend_yield { metric("Dividende", numStr(dy) + "%") }
            }
        }
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased()).font(.caption2).foregroundStyle(.secondary)
            Text(value).font(.subheadline.bold()).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
    }

    private func positionCard(inv: Investment, pos: InvestmentsModel.Position?, quote: StockQuote?) -> some View {
        GlassCard(padding: 16, cornerRadius: theme.cardRadius) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("MA POSITION", systemImage: "building.2.fill")
                        .font(.caption.bold()).foregroundStyle(theme.primary)
                    Spacer()
                    Button { onEdit(inv) } label: { Label("Modifier", systemImage: "pencil").font(.caption) }
                        .buttonStyle(.plain).foregroundStyle(theme.primary)
                }
                row("Titres", inv.shares.formatted(.number.precision(.fractionLength(0...4))))
                row("Prix d'achat", "\(numStr(inv.purchase_price_ref)) \(inv.currency_stock)")
                row("Investi", fcfa(inv.invested_amount))
                if let pos {
                    row("Valeur actuelle", "\(numStr(pos.current)) \(quote?.currency ?? "USD")")
                    Divider()
                    HStack {
                        Text("Plus/moins-value").font(.subheadline.bold())
                        Spacer()
                        Text("\(signedNum(pos.gain)) \(quote?.currency ?? "USD") (\(pctStr(pos.gainPct)))")
                            .font(.subheadline.bold())
                            .foregroundStyle(pos.gain >= 0 ? .green : .red)
                    }
                }
            }
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack { Text(label).foregroundStyle(.secondary); Spacer(); Text(value).fontWeight(.semibold) }
            .font(.subheadline)
    }

    private var newsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("ACTUALITÉS").font(.caption.bold()).foregroundStyle(.secondary)
            ForEach(model.news.prefix(6)) { item in
                NewsRow(item: item)
            }
        }
    }
}

private struct NewsRow: View {
    let item: StockNewsItem
    var body: some View {
        let content = VStack(alignment: .leading, spacing: 3) {
            Text(item.title).font(.subheadline.bold()).lineLimit(2)
            if !item.summary.isEmpty {
                Text(item.summary).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            Text("\(item.provider.isEmpty ? "Yahoo Finance" : item.provider)\(item.published.isEmpty ? "" : " · " + String(item.published.prefix(10)))")
                .font(.caption2).foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))

        if let url = URL(string: item.url), !item.url.isEmpty {
            Link(destination: url) { content }.buttonStyle(.plain)
        } else { content }
    }
}

// MARK: - Portfolio screen

private struct PortfolioScreen: View {
    @ObservedObject var model: InvestmentsModel
    @EnvironmentObject private var theme: CompanyTheme
    let onEdit: (Investment) -> Void
    let onOpen: (Investment) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                kpis
                allocationChart
                AIAnalysisPanel(
                    title: "Évaluation du portefeuille",
                    runLabel: "Évaluer le portefeuille",
                    analysis: model.portfolioAnalysis,
                    isLoading: model.portfolioLoading,
                    onRun: { Task { await model.evaluatePortfolio() } }
                )
                positionsList
            }
            .padding()
        }
    }

    private var kpis: some View {
        let cols = [GridItem(.adaptive(minimum: 150), spacing: 12)]
        return LazyVGrid(columns: cols, spacing: 12) {
            MetricCard(title: "Capital investi", value: fcfa(model.totalInvested), icon: "banknote", color: theme.primary)
            MetricCard(title: "Valeur actuelle", value: model.totalCurrent > 0 ? fcfa(model.totalCurrent) : "—",
                       icon: "chart.line.uptrend.xyaxis", color: .blue)
            MetricCard(title: "Plus/moins-value",
                       value: "\(model.totalGain >= 0 ? "+" : "")\(fcfa(model.totalGain))",
                       icon: model.totalGain >= 0 ? "arrow.up.right" : "arrow.down.right",
                       color: model.totalGain >= 0 ? .green : .red)
            MetricCard(title: "Performance",
                       value: pctStr(model.totalGainPct),
                       icon: "percent", color: model.totalGainPct >= 0 ? .green : .red,
                       subtitle: "\(model.investments.count) position(s)")
        }
    }

    private var allocationChart: some View {
        GlassCard(padding: 16, cornerRadius: theme.cardRadius) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Allocation").font(.subheadline.bold())
                if model.totalCurrent > 0 {
                    Chart(model.positions) { pos in
                        SectorMark(angle: .value("Valeur", pos.current), innerRadius: .ratio(0.6), angularInset: 2)
                            .foregroundStyle(pos.color)
                            .annotation(position: .overlay) {
                                Text(pos.inv.ticker).font(.caption2.bold()).foregroundStyle(.white)
                            }
                    }
                    .frame(height: 220)
                } else {
                    Text("Cours indisponibles").font(.callout).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, minHeight: 120)
                }
            }
        }
    }

    private var positionsList: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("POSITIONS").font(.caption.bold()).foregroundStyle(.secondary)
            ForEach(model.positions) { pos in
                Button { onOpen(pos.inv) } label: {
                    HStack(spacing: 12) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 10).fill(pos.color).frame(width: 40, height: 40)
                            Text(pos.inv.ticker.prefix(2)).font(.caption.bold()).foregroundStyle(.white)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(pos.inv.ticker).font(.subheadline.bold())
                            Text(pos.inv.display_name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(fcfa(pos.current)).font(.subheadline.bold())
                            Text(pctStr(pos.gainPct))
                                .font(.caption).foregroundStyle(pos.gainPct >= 0 ? .green : .red)
                        }
                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                    }
                    .padding(12)
                    .background(.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button { onEdit(pos.inv) } label: { Label("Modifier", systemImage: "pencil") }
                }
            }
        }
    }
}

// MARK: - Add sheet (ticker search → amount)

private struct AddInvestmentSheet: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: CompanyTheme

    @State private var query = ""
    @State private var results: [TickerSearchResult] = []
    @State private var picked: TickerSearchResult?
    @State private var amount = ""
    @State private var purchaseDate = ""
    @State private var notes = ""
    @State private var searching = false
    @State private var saving = false
    @State private var errorMsg: String?
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            Form {
                if let picked {
                    Section("Position sélectionnée") {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(picked.name).font(.subheadline.bold())
                            Text("\(picked.ticker) · \(picked.exchange)").font(.caption).foregroundStyle(.secondary)
                        }
                        Button("Changer de titre") { self.picked = nil }
                            .font(.caption).foregroundStyle(theme.primary)
                    }
                    Section("Détails") {
                        TextField("Montant investi (FCFA) *", text: $amount)
                            #if os(iOS)
                            .keyboardType(.numberPad)
                            #endif
                        TextField("Date d'achat (AAAA-MM-JJ)", text: $purchaseDate)
                        TextField("Notes", text: $notes, axis: .vertical)
                    }
                } else {
                    Section("Rechercher un titre") {
                        TextField("Apple, AAPL, Tesla…", text: $query)
                            #if os(iOS)
                            .textInputAutocapitalization(.never)
                            #endif
                            .autocorrectionDisabled()
                            .onChange(of: query) { _, q in scheduleSearch(q) }
                        if searching { ProgressView() }
                    }
                    if !results.isEmpty {
                        Section("Résultats") {
                            ForEach(results) { r in
                                Button { picked = r } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(r.name).font(.subheadline.bold()).foregroundStyle(.primary)
                                        Text("\(r.ticker) · \(r.exchange)").font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }
                if let errorMsg { Section { Text(errorMsg).foregroundStyle(.red).font(.caption) } }
            }
            .navigationTitle("Ajouter une position")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Ajouter") { Task { await save() } }
                        .disabled(picked == nil || amount.isEmpty || saving)
                }
            }
        }
    }

    private func scheduleSearch(_ q: String) {
        searchTask?.cancel()
        let trimmed = q.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 2 else { results = []; return }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            if Task.isCancelled { return }
            searching = true
            let res = (try? await APIClient.shared.searchTickers(trimmed)) ?? []
            if !Task.isCancelled { results = res; searching = false }
        }
    }

    private func save() async {
        guard let picked else { return }
        saving = true; errorMsg = nil
        // Mirror the web: fetch the live quote to derive share count from the invested amount.
        var price = 0.0; var currency = picked.currency ?? "USD"
        if let q = try? await APIClient.shared.stockQuote(picked.ticker) {
            price = q.price ?? 0; currency = q.currency
        }
        let invested = Double(amount) ?? 0
        let shares = price > 0 ? (invested / price * 10000).rounded() / 10000 : 0
        let payload = InvestmentPayload(
            ticker: picked.ticker, display_name: picked.name, exchange: picked.exchange,
            currency_stock: currency, shares: shares, invested_amount: invested,
            purchase_price_ref: price,
            purchase_date: purchaseDate.isEmpty ? nil : purchaseDate,
            notes: notes.isEmpty ? nil : notes)
        do { _ = try await APIClient.shared.createInvestment(payload); await onSaved(); dismiss() }
        catch { errorMsg = (error as? LocalizedError)?.errorDescription ?? "Échec de l'enregistrement." }
        saving = false
    }
}

// MARK: - Edit sheet

private struct EditInvestmentSheet: View {
    let investment: Investment
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var shares: String
    @State private var invested: String
    @State private var priceRef: String
    @State private var purchaseDate: String
    @State private var notes: String
    @State private var saving = false

    init(investment: Investment, onSaved: @escaping () async -> Void) {
        self.investment = investment; self.onSaved = onSaved
        _shares = State(initialValue: String(investment.shares))
        _invested = State(initialValue: String(investment.invested_amount))
        _priceRef = State(initialValue: String(investment.purchase_price_ref))
        _purchaseDate = State(initialValue: investment.purchase_date ?? "")
        _notes = State(initialValue: investment.notes ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(investment.ticker) {
                    labeled("Titres") { TextField("", text: $shares).decimalKeyboard() }
                    labeled("Montant investi (FCFA)") { TextField("", text: $invested).numberKeyboard() }
                    labeled("Prix d'achat réf.") { TextField("", text: $priceRef).decimalKeyboard() }
                    labeled("Date d'achat") { TextField("AAAA-MM-JJ", text: $purchaseDate) }
                }
                Section("Notes") { TextField("Notes", text: $notes, axis: .vertical) }
            }
            .navigationTitle("Modifier la position")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }.disabled(saving)
                }
            }
        }
    }

    private func labeled<V: View>(_ label: String, @ViewBuilder _ field: () -> V) -> some View {
        HStack { Text(label).foregroundStyle(.secondary); Spacer(); field().multilineTextAlignment(.trailing) }
    }

    private func save() async {
        saving = true
        let payload = InvestmentPayload(
            ticker: investment.ticker, display_name: investment.display_name,
            exchange: investment.exchange, currency_stock: investment.currency_stock,
            shares: Double(shares) ?? 0, invested_amount: Double(invested) ?? 0,
            purchase_price_ref: Double(priceRef) ?? 0,
            purchase_date: purchaseDate.isEmpty ? nil : purchaseDate,
            notes: notes.isEmpty ? nil : notes)
        _ = try? await APIClient.shared.updateInvestment(investment.id, payload)
        await onSaved(); dismiss(); saving = false
    }
}

// MARK: - Small helpers

private func fmtOpt(_ v: Double?, _ dec: Int) -> String {
    guard let v else { return "—" }
    return v.formatted(.number.precision(.fractionLength(dec)))
}

/// `%.Nf` without the LocalizedStringKey `specifier:` trap (which only works
/// inside `Text` literals, not when building plain `String`s).
private func numStr(_ v: Double, _ dec: Int = 2) -> String { String(format: "%.\(dec)f", v) }
private func signedNum(_ v: Double, _ dec: Int = 2) -> String { (v >= 0 ? "+" : "") + String(format: "%.\(dec)f", v) }
private func pctStr(_ v: Double, _ dec: Int = 2) -> String { (v >= 0 ? "+" : "") + String(format: "%.\(dec)f", v) + "%" }

private extension View {
    @ViewBuilder func decimalKeyboard() -> some View {
        #if os(iOS)
        self.keyboardType(.decimalPad)
        #else
        self
        #endif
    }
    @ViewBuilder func numberKeyboard() -> some View {
        #if os(iOS)
        self.keyboardType(.numberPad)
        #else
        self
        #endif
    }
}
