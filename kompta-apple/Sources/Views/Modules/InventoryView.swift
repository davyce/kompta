import SwiftUI

// ============================================================================
//  InventoryView — port of the web Inventory page.
//  Catalogue (CRUD + search + category filter), stock movements, low-stock
//  alerts with reorder recommendations, and a Limule AI inventory report.
// ============================================================================

@MainActor
final class InventoryModel: ObservableObject {
    @Published var products: [Product] = []
    @Published var movements: [InventoryMovement] = []
    @Published var lowStock: [LowStockProduct] = []
    @Published var loading = false
    @Published var loadError: String?

    @Published var report: String?
    @Published var reportLoading = false

    func loadAll() async {
        loading = true; loadError = nil
        do {
            products = try await APIClient.shared.products()
            async let mv = APIClient.shared.inventoryMovements()
            async let ls = APIClient.shared.lowStock()
            movements = (try? await mv) ?? []
            lowStock = (try? await ls) ?? []
        } catch {
            loadError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        loading = false
    }

    func delete(_ p: Product) async { try? await APIClient.shared.deleteProduct(p.id); await loadAll() }

    func runReport() async {
        reportLoading = true; report = nil
        report = (try? await APIClient.shared.inventoryReportAI().content)
            ?? "Rapport indisponible pour le moment."
        reportLoading = false
    }

    var categories: [String] {
        ["Tous"] + Set(products.compactMap { $0.category }).sorted()
    }
    var totalValue: Double { products.reduce(0) { $0 + $1.stockValue } }
}

struct InventoryView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var model = InventoryModel()
    @State private var tab = 0
    @State private var search = ""
    @State private var category = "Tous"
    @State private var showAdd = false
    @State private var editTarget: Product?
    @State private var movementTarget: Product?

    private var filtered: [Product] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return model.products.filter { p in
            let catOK = category == "Tous" || p.category == category
            let qOK = q.isEmpty || p.name.lowercased().contains(q) || (p.sku ?? "").lowercased().contains(q)
            return catOK && qOK
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Vue", selection: $tab) {
                Text("Catalogue").tag(0)
                Text("Mouvements").tag(1)
                Text("Alertes").tag(2)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal).padding(.top, 8).padding(.bottom, 4)

            Group {
                switch tab {
                case 1: movementsTab
                case 2: alertsTab
                default: catalogueTab
                }
            }
        }
        .navigationTitle("Inventaire")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showAdd = true } label: { Image(systemName: "plus") }
            }
        }
        .task { if model.products.isEmpty { await model.loadAll() } }
        .refreshable { await model.loadAll() }
        .sheet(isPresented: $showAdd) { ProductFormSheet(product: nil) { await model.loadAll() } }
        .sheet(item: $editTarget) { p in ProductFormSheet(product: p) { await model.loadAll() } }
        .sheet(item: $movementTarget) { p in StockMovementSheet(product: p) { await model.loadAll() } }
    }

    // ── Catalogue ──────────────────────────────────────────────────────────
    private var catalogueTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                kpis
                searchAndFilter
                if model.loading && model.products.isEmpty {
                    ForEach(0..<5, id: \.self) { _ in ShimmerBox(height: 56, cornerRadius: 12) }
                } else if filtered.isEmpty {
                    ContentUnavailableView("Aucun produit", systemImage: "shippingbox",
                                           description: Text("Ajoutez votre premier article au catalogue."))
                        .frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    ForEach(filtered) { p in productRow(p) }
                }
            }
            .padding()
        }
    }

    private var kpis: some View {
        let cols = [GridItem(.adaptive(minimum: 150), spacing: 12)]
        return LazyVGrid(columns: cols, spacing: 12) {
            MetricCard(title: "Valeur du stock", value: fcfa(model.totalValue), icon: "banknote", color: theme.primary)
            MetricCard(title: "Produits", value: "\(model.products.count)", icon: "shippingbox.fill", color: .blue)
            MetricCard(title: "Alertes stock", value: "\(model.lowStock.count)",
                       icon: "exclamationmark.triangle.fill", color: model.lowStock.isEmpty ? .green : .orange)
        }
    }

    private var searchAndFilter: some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Rechercher (nom, SKU)…", text: $search)
                    #if os(iOS)
                    .textInputAutocapitalization(.never)
                    #endif
                    .autocorrectionDisabled()
            }
            .padding(10)
            .background(.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(model.categories, id: \.self) { c in
                        Button { category = c } label: {
                            Text(c).font(.caption.bold())
                                .padding(.horizontal, 12).padding(.vertical, 6)
                                .background(category == c ? theme.primary : Color.secondary.opacity(0.1), in: Capsule())
                                .foregroundStyle(category == c ? .white : .secondary)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func productRow(_ p: Product) -> some View {
        Button { editTarget = p } label: {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10).fill(theme.primary.opacity(0.12)).frame(width: 42, height: 42)
                    Image(systemName: "shippingbox.fill").foregroundStyle(theme.primary)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.name).font(.subheadline.bold()).foregroundStyle(.primary)
                    HStack(spacing: 6) {
                        if let sku = p.sku, !sku.isEmpty { Text(sku).font(.caption2).foregroundStyle(.secondary) }
                        if let c = p.category { Text("· \(c)").font(.caption2).foregroundStyle(.secondary) }
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(fcfa(p.price)).font(.subheadline.bold()).foregroundStyle(theme.primary)
                    Text("Stock \(p.stock_quantity)").font(.caption)
                        .foregroundStyle(p.isLow ? .orange : .secondary)
                }
            }
            .padding(12)
            .background(.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button { editTarget = p } label: { Label("Modifier", systemImage: "pencil") }
            Button { movementTarget = p } label: { Label("Mouvement de stock", systemImage: "arrow.left.arrow.right") }
            Button(role: .destructive) { Task { await model.delete(p) } } label: { Label("Supprimer", systemImage: "trash") }
        }
    }

    // ── Movements ──────────────────────────────────────────────────────────
    private var movementsTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if model.movements.isEmpty {
                    ContentUnavailableView("Aucun mouvement", systemImage: "arrow.left.arrow.right")
                        .frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    ForEach(model.movements) { m in
                        HStack(spacing: 12) {
                            let isIn = m.movement_type == "in"
                            Image(systemName: isIn ? "arrow.down.circle.fill" : "arrow.up.circle.fill")
                                .font(.title3).foregroundStyle(isIn ? .green : .red)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(m.product_name ?? "Produit #\(m.product_id)").font(.subheadline.bold())
                                if let r = m.reason, !r.isEmpty { Text(r).font(.caption).foregroundStyle(.secondary) }
                                Text(shortDate(m.created_at)).font(.caption2).foregroundStyle(.tertiary)
                            }
                            Spacer()
                            Text("\(isIn ? "+" : "-")\(m.quantity)").font(.headline)
                                .foregroundStyle(isIn ? .green : .red)
                        }
                        .padding(12)
                        .background(.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                    }
                }
            }
            .padding()
        }
    }

    // ── Alerts + AI report ──────────────────────────────────────────────────
    private var alertsTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                AIAnalysisPanel(
                    title: "Rapport d'inventaire Limule",
                    runLabel: "Générer le rapport",
                    analysis: model.report, isLoading: model.reportLoading,
                    onRun: { Task { await model.runReport() } }
                )
                if model.lowStock.isEmpty {
                    ContentUnavailableView("Aucune alerte", systemImage: "checkmark.seal.fill",
                                           description: Text("Tous les niveaux de stock sont au-dessus du seuil."))
                        .frame(maxWidth: .infinity).padding(.top, 20)
                } else {
                    Text("STOCK FAIBLE").font(.caption.bold()).foregroundStyle(.secondary)
                    ForEach(model.lowStock) { p in lowRow(p) }
                }
            }
            .padding()
        }
    }

    private func lowRow(_ p: LowStockProduct) -> some View {
        let target = p.reorder_level * 2
        let recommend = max(target - p.stock_quantity, 10)
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.name).font(.subheadline.bold())
                    Text("Seuil \(p.reorder_level)\(p.sku.map { " · " + $0 } ?? "")")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(p.stock_quantity)").font(.title3.bold()).foregroundStyle(.orange)
            }
            Text("Recommandation : commander \(recommend) unité(s) pour atteindre \(target).")
                .font(.caption).foregroundStyle(.secondary)
            if let product = model.products.first(where: { $0.id == p.id }) {
                Button { movementTarget = product } label: {
                    Label("Réapprovisionner", systemImage: "plus.circle.fill").font(.caption.bold())
                }
                .buttonStyle(.borderedProminent).tint(.orange).controlSize(.small)
            }
        }
        .padding(12)
        .background(.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Product form

private struct ProductFormSheet: View {
    let product: Product?
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var sku: String
    @State private var category: String
    @State private var brand: String
    @State private var variant: String
    @State private var price: String
    @State private var stock: String
    @State private var reorder: String
    @State private var saving = false
    @State private var errorMsg: String?

    init(product: Product?, onSaved: @escaping () async -> Void) {
        self.product = product; self.onSaved = onSaved
        _name = State(initialValue: product?.name ?? "")
        _sku = State(initialValue: product?.sku ?? "")
        _category = State(initialValue: product?.category ?? "Général")
        _brand = State(initialValue: product?.brand ?? "KOMPTA")
        _variant = State(initialValue: product?.variant ?? "Standard")
        _price = State(initialValue: product.map { String(Int($0.price)) } ?? "")
        _stock = State(initialValue: product.map { String($0.stock_quantity) } ?? "")
        _reorder = State(initialValue: String(product?.reorderLevel ?? 5))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Identité") {
                    TextField("Nom *", text: $name)
                    TextField("SKU *", text: $sku)
                    TextField("Catégorie", text: $category)
                }
                Section("Détails") {
                    TextField("Marque", text: $brand)
                    TextField("Variante", text: $variant)
                }
                Section("Prix & stock") {
                    labeled("Prix (FCFA)") { TextField("0", text: $price).numberKeyboardI() }
                    labeled("Quantité en stock") { TextField("0", text: $stock).numberKeyboardI() }
                    labeled("Seuil de réappro.") { TextField("5", text: $reorder).numberKeyboardI() }
                }
                if let errorMsg { Section { Text(errorMsg).foregroundStyle(.red).font(.caption) } }
            }
            .navigationTitle(product == nil ? "Nouveau produit" : "Modifier")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }
                        .disabled(name.isEmpty || sku.isEmpty || saving)
                }
            }
        }
    }

    private func labeled<V: View>(_ label: String, @ViewBuilder _ field: () -> V) -> some View {
        HStack { Text(label).foregroundStyle(.secondary); Spacer(); field().multilineTextAlignment(.trailing) }
    }

    private func save() async {
        saving = true; errorMsg = nil
        let payload = ProductPayload(
            name: name, sku: sku, category: category.isEmpty ? "Général" : category,
            brand: brand.isEmpty ? "KOMPTA" : brand, variant: variant.isEmpty ? "Standard" : variant,
            price: Double(price) ?? 0, stock_quantity: Int(stock) ?? 0, reorder_level: Int(reorder) ?? 5)
        do {
            if let product { _ = try await APIClient.shared.updateProduct(product.id, payload) }
            else { _ = try await APIClient.shared.createProduct(payload) }
            await onSaved(); dismiss()
        } catch { errorMsg = (error as? LocalizedError)?.errorDescription ?? "Échec de l'enregistrement." }
        saving = false
    }
}

// MARK: - Stock movement form

private struct StockMovementSheet: View {
    let product: Product
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var type = "in"
    @State private var quantity = ""
    @State private var reason = ""
    @State private var saving = false
    @State private var errorMsg: String?

    var body: some View {
        NavigationStack {
            Form {
                Section(product.name) {
                    Picker("Type", selection: $type) {
                        Text("Entrée").tag("in"); Text("Sortie").tag("out")
                    }.pickerStyle(.segmented)
                    HStack { Text("Quantité").foregroundStyle(.secondary); Spacer()
                        TextField("0", text: $quantity).numberKeyboardI().multilineTextAlignment(.trailing) }
                    TextField("Motif (optionnel)", text: $reason)
                }
                Section { Text("Stock actuel : \(product.stock_quantity)").font(.caption).foregroundStyle(.secondary) }
                if let errorMsg { Section { Text(errorMsg).foregroundStyle(.red).font(.caption) } }
            }
            .navigationTitle("Mouvement de stock")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Valider") { Task { await save() } }
                        .disabled((Int(quantity) ?? 0) <= 0 || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true; errorMsg = nil
        let payload = InventoryMovementPayload(product_id: product.id, movement_type: type,
                                               quantity: Int(quantity) ?? 0, reason: reason)
        do { try await APIClient.shared.createInventoryMovement(payload); await onSaved(); dismiss() }
        catch { errorMsg = (error as? LocalizedError)?.errorDescription ?? "Échec du mouvement." }
        saving = false
    }
}

// MARK: - Helpers

private extension View {
    @ViewBuilder func numberKeyboardI() -> some View {
        #if os(iOS)
        self.keyboardType(.numberPad)
        #else
        self
        #endif
    }
}
