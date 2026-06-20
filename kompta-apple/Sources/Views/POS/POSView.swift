import SwiftUI

// MARK: - Payment option model

private struct POSPaymentOption: Identifiable {
    let id: String
    let method: String
    let accountId: Int?
    let label: String
    let symbol: String
}

private func posPaymentOptions(accounts: [PaymentAccount]) -> [POSPaymentOption] {
    var opts: [POSPaymentOption] = accounts
        .filter { $0.enabled && $0.use_for_pos }
        .map { a in
            let method = a.provider == "zola" ? "qr" : a.provider
            return POSPaymentOption(
                id: "acc-\(a.id)", method: method, accountId: a.id,
                label: a.label, symbol: _posSymbol(method)
            )
        }
    if !opts.contains(where: { $0.method == "cash" }) {
        opts.append(.init(id: "cash", method: "cash", accountId: nil, label: "Espèces", symbol: "banknote"))
    }
    if !opts.contains(where: { $0.method == "card" }) {
        opts.append(.init(id: "card", method: "card", accountId: nil, label: "Carte", symbol: "creditcard.fill"))
    }
    return opts
}

private func _posSymbol(_ method: String) -> String {
    switch method {
    case "cash":  return "banknote"
    case "card":  return "creditcard.fill"
    case "bank":  return "building.columns.fill"
    case "qr":    return "qrcode"
    default:      return "iphone"
    }
}

private func _productIcon(_ category: String?) -> (symbol: String, tint: Color) {
    switch category?.lowercased() {
    case "alimentation", "boissons", "food":  return ("fork.knife",                    .orange)
    case "électronique", "tech":               return ("laptopcomputer",                .blue)
    case "santé", "pharmacie", "health":      return ("cross.case.fill",               .red)
    case "services":                           return ("wrench.and.screwdriver.fill",   .cyan)
    case "maison", "home":                    return ("house.fill",                    .brown)
    case "beauté", "beauty":                   return ("sparkles",                     .pink)
    default:                                   return ("cube.box.fill",                .secondary)
    }
}

// MARK: - Root view

struct POSView: View {
    @EnvironmentObject private var theme: CompanyTheme

    // Data
    @State private var products:        [Product]        = []
    @State private var payAccounts:     [PaymentAccount] = []
    @State private var isLoading        = true

    // Catalog filters
    @State private var search           = ""
    @State private var selectedCategory = "Tous"

    // Cart
    @State private var cart:            [CartItem] = []

    // Payment
    @State private var paymentMethod    = "cash"
    @State private var paymentAccountId: Int? = nil

    // Price adjustments
    @State private var discountPercent: Double = 0
    @State private var tvaEnabled              = true
    @State private var tvaRate:         Double = 18

    // Client shown on receipt
    @State private var clientName       = ""

    // UI
    @State private var showCart         = false
    @State private var lastSale:        SaleResponse?
    @State private var showReceipt      = false
    @State private var isSaving         = false
    @State private var errorMsg:        String?

    // MARK: Computed

    private var categories: [String] {
        ["Tous"] + Array(Set(products.compactMap(\.category))).sorted()
    }

    private var filtered: [Product] {
        let q = search.trimmingCharacters(in: .whitespaces)
        return products.filter {
            let matchQ = q.isEmpty
                || $0.name.localizedCaseInsensitiveContains(q)
                || ($0.sku?.localizedCaseInsensitiveContains(q) ?? false)
            let matchC = selectedCategory == "Tous" || $0.category == selectedCategory
            return matchQ && matchC
        }
    }

    private var cartCount:  Int    { cart.reduce(0) { $0 + Int($1.quantity) } }
    private var subtotal:   Double { cart.reduce(0) { $0 + $1.total } }
    private var discountAmt:Double { (subtotal * discountPercent / 100).rounded() }
    private var afterDisc:  Double { subtotal - discountAmt }
    private var tax:        Double { tvaEnabled ? (afterDisc * tvaRate / 100).rounded() : 0 }
    private var grandTotal: Double { afterDisc + tax }
    private var posOptions: [POSPaymentOption] { posPaymentOptions(accounts: payAccounts) }

    // MARK: Body

    var body: some View {
        #if os(iOS)
        iOSLayout
        #else
        macOSLayout
        #endif
    }

    // MARK: - iOS layout

    private var iOSLayout: some View {
        VStack(spacing: 0) {
            searchBar.padding([.horizontal, .top])
            categoryBar
            Divider()
            Group {
                if isLoading       { skeleton }
                else if filtered.isEmpty { emptyState }
                else               { catalogScroll }
            }
        }
        .navigationTitle("Caisse")
        .toolbar {
            #if os(iOS)
            ToolbarItem(placement: .navigationBarTrailing) { cartBadgeButton }
            #endif
        }
        .sheet(isPresented: $showCart) { cartSheetView }
        .sheet(isPresented: $showReceipt) { receiptSheetView }
        .task { await loadData() }
    }

    // MARK: - macOS layout

    private var macOSLayout: some View {
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                searchBar.padding()
                categoryBar.padding(.horizontal)
                Divider()
                Group {
                    if isLoading           { skeleton }
                    else if filtered.isEmpty { emptyState }
                    else                   { catalogScroll }
                }
            }

            Divider()

            macCartPanel.frame(width: 340)
        }
        .navigationTitle("Point de vente")
        .sheet(isPresented: $showReceipt) { receiptSheetView }
        .task { await loadData() }
    }

    // MARK: - Shared catalog components

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField("Rechercher un produit…", text: $search)
                .textFieldStyle(.plain)
                .autocorrectionDisabled()
            if !search.isEmpty {
                Button { search = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(10)
        .background(.quaternary)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var categoryBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(categories, id: \.self) { cat in
                    Button(cat) { selectedCategory = cat }
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 14).padding(.vertical, 7)
                        .background(selectedCategory == cat ? theme.primary : Color.secondary.opacity(0.12))
                        .foregroundStyle(selectedCategory == cat ? Color.white : Color.primary)
                        .clipShape(Capsule())
                        .buttonStyle(.plain)
                        .animation(.spring(duration: 0.2), value: selectedCategory)
                }
            }
            .padding(.horizontal).padding(.vertical, 8)
        }
    }

    private var catalogScroll: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 148))], spacing: 12) {
                ForEach(filtered) { p in
                    POSProductCard(product: p) { add(p) }
                        .environmentObject(theme)
                }
            }
            .padding()
        }
    }

    private var skeleton: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 148))], spacing: 12) {
                ForEach(0..<8, id: \.self) { _ in ShimmerBox(height: 130, cornerRadius: 14) }
            }.padding()
        }
    }

    private var emptyState: some View {
        ContentUnavailableView(
            "Aucun produit",
            systemImage: "cube.box",
            description: Text(search.isEmpty
                ? "Ajoutez des produits dans l'inventaire"
                : "Aucun résultat pour « \(search) »")
        )
    }

    private var cartBadgeButton: some View {
        Button { showCart = true } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "cart.fill")
                if cartCount > 0 {
                    Text("\(min(cartCount, 99))")
                        .font(.system(size: 9, weight: .bold))
                        .padding(3)
                        .background(theme.primary)
                        .foregroundStyle(.white)
                        .clipShape(Circle())
                        .offset(x: 10, y: -10)
                }
            }
        }
    }

    // MARK: - iOS cart sheet

    private var cartSheetView: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    cartItemsList
                    Divider().padding(.vertical, 4)
                    adjustmentsSection
                    Divider().padding(.vertical, 4)
                    totalsSection
                    paymentMethodSection
                    checkoutSection
                }
                .padding(.bottom, 32)
            }
            .navigationTitle("Panier (\(cartCount))")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { showCart = false }
                }
                if !cart.isEmpty {
                    ToolbarItem(placement: .destructiveAction) {
                        Button("Vider") { cart = [] }
                            .foregroundStyle(.red)
                    }
                }
            }
        }
    }

    // MARK: - macOS cart panel

    private var macCartPanel: some View {
        VStack(spacing: 0) {
            HStack {
                Label("Panier", systemImage: "cart.fill").font(.headline)
                Spacer()
                if !cart.isEmpty {
                    Button("Vider") { cart = [] }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.red)
                        .buttonStyle(.plain)
                }
            }
            .padding()
            Divider()

            ScrollView {
                VStack(spacing: 0) {
                    cartItemsList
                    Divider().padding(.vertical, 4)
                    adjustmentsSection
                    Divider().padding(.vertical, 4)
                    totalsSection
                    paymentMethodSection
                    checkoutSection
                }
                .padding(.bottom, 16)
            }
        }
    }

    // MARK: - Shared cart sections

    @ViewBuilder
    private var cartItemsList: some View {
        if cart.isEmpty {
            VStack(spacing: 12) {
                Image(systemName: "cart").font(.system(size: 40)).foregroundStyle(.secondary)
                Text("Panier vide").font(.subheadline).foregroundStyle(.secondary)
                Text("Touchez un produit pour l'ajouter").font(.caption).foregroundStyle(.tertiary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 28)
        } else {
            VStack(spacing: 0) {
                ForEach(cart) { item in
                    cartRow(item: item)
                    if item.id != cart.last?.id {
                        Divider().padding(.leading, 60)
                    }
                }
            }
        }
    }

    private func cartRow(item: CartItem) -> some View {
        HStack(spacing: 12) {
            let icon = _productIcon(item.product.category)
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(icon.tint.opacity(0.12))
                Image(systemName: icon.symbol).font(.footnote).foregroundStyle(icon.tint)
            }
            .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.product.name).font(.subheadline.weight(.medium)).lineLimit(1)
                Text(fcfa(item.total))
                    .font(.caption).foregroundStyle(.secondary)
            }

            Spacer()

            HStack(spacing: 4) {
                Button {
                    if let i = cart.firstIndex(where: { $0.id == item.id }) {
                        if cart[i].quantity > 1 { cart[i].quantity -= 1 }
                        else { cart.remove(at: i) }
                    }
                } label: {
                    Image(systemName: item.quantity == 1 ? "trash" : "minus")
                        .font(.caption2.weight(.bold))
                        .frame(width: 28, height: 28)
                        .background(Color.secondary.opacity(0.12))
                        .foregroundStyle(item.quantity == 1 ? Color.red : Color.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)

                Text("\(Int(item.quantity))")
                    .font(.subheadline.weight(.semibold))
                    .frame(width: 28)
                    .multilineTextAlignment(.center)

                Button {
                    if let i = cart.firstIndex(where: { $0.id == item.id }) {
                        cart[i].quantity += 1
                    }
                } label: {
                    Image(systemName: "plus")
                        .font(.caption2.weight(.bold))
                        .frame(width: 28, height: 28)
                        .background(Color.secondary.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
    }

    private var adjustmentsSection: some View {
        VStack(spacing: 12) {
            // Remise
            HStack(spacing: 8) {
                Image(systemName: "percent").font(.caption).foregroundStyle(.secondary)
                Text("Remise").font(.subheadline)
                Spacer()
                HStack(spacing: 4) {
                    TextField("0", value: $discountPercent, format: .number.precision(.fractionLength(0)))
                        #if os(iOS)
                        .keyboardType(.numberPad)
                        #endif
                        .textFieldStyle(.plain)
                        .frame(width: 40)
                        .multilineTextAlignment(.trailing)
                        .padding(5)
                        .background(Color.secondary.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    Text("%").font(.caption).foregroundStyle(.secondary)
                }
            }

            // TVA
            HStack(spacing: 8) {
                Image(systemName: "doc.text").font(.caption).foregroundStyle(.secondary)
                Toggle(isOn: $tvaEnabled) {
                    HStack(spacing: 6) {
                        Text("TVA").font(.subheadline)
                        if tvaEnabled {
                            HStack(spacing: 2) {
                                TextField("18", value: $tvaRate, format: .number.precision(.fractionLength(0)))
                                    #if os(iOS)
                                    .keyboardType(.numberPad)
                                    #endif
                                    .textFieldStyle(.plain)
                                    .frame(width: 32)
                                    .multilineTextAlignment(.center)
                                    .padding(4)
                                    .background(Color.secondary.opacity(0.1))
                                    .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                                Text("%").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .tint(theme.primary)
            }

            // Client name
            HStack(spacing: 8) {
                Image(systemName: "person").font(.caption).foregroundStyle(.secondary)
                TextField("Nom du client (optionnel)", text: $clientName)
                    .textFieldStyle(.plain)
                    .font(.subheadline)
            }
            .padding(8)
            .background(Color.secondary.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    private var totalsSection: some View {
        VStack(spacing: 6) {
            HStack {
                Text("Sous-total").foregroundStyle(.secondary)
                Spacer()
                Text(fcfa(subtotal))
            }
            if discountAmt > 0 {
                HStack {
                    Text("Remise \(Int(discountPercent))%").foregroundStyle(.red)
                    Spacer()
                    Text("-\(fcfa(discountAmt))").foregroundStyle(.red)
                }
            }
            if tvaEnabled {
                HStack {
                    Text("TVA \(Int(tvaRate))%").foregroundStyle(.secondary)
                    Spacer()
                    Text(fcfa(tax))
                }
            }
            Divider()
            HStack {
                Text("TOTAL").font(.headline.weight(.heavy))
                Spacer()
                Text(fcfa(grandTotal))
                    .font(.title3.bold())
                    .foregroundStyle(theme.primary)
            }
        }
        .font(.subheadline)
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    private var paymentMethodSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("MODE DE PAIEMENT")
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)

            let cols = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]
            LazyVGrid(columns: cols, spacing: 8) {
                ForEach(posOptions) { opt in
                    let isSelected = paymentMethod == opt.method && paymentAccountId == opt.accountId
                    Button {
                        paymentMethod    = opt.method
                        paymentAccountId = opt.accountId
                    } label: {
                        VStack(spacing: 5) {
                            Image(systemName: opt.symbol).font(.title3)
                            Text(opt.label)
                                .font(.caption2.weight(.medium))
                                .lineLimit(2)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(isSelected ? theme.primary.opacity(0.12) : Color.secondary.opacity(0.07))
                        .foregroundStyle(isSelected ? theme.primary : Color.primary)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .strokeBorder(isSelected ? theme.primary : Color.clear, lineWidth: 1.5)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    private var checkoutSection: some View {
        VStack(spacing: 8) {
            if let err = errorMsg {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                    Text(err).fixedSize(horizontal: false, vertical: true)
                }
                .font(.caption)
                .foregroundStyle(.red)
                .padding(10)
                .background(Color.red.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            Button {
                Task { await confirmSale() }
            } label: {
                HStack {
                    if isSaving {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "checkmark.seal.fill")
                        Text("Encaisser · \(fcfa(grandTotal))")
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(cart.isEmpty ? Color.secondary.opacity(0.3) : theme.primary)
                .foregroundStyle(.white)
                .font(.headline)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(cart.isEmpty || isSaving)
        }
        .padding(.horizontal)
        .padding(.top, 4)
        .padding(.bottom, 8)
    }

    // MARK: - Receipt sheet

    private var receiptSheetView: some View {
        Group {
            if let sale = lastSale {
                ReceiptView(sale: sale, clientName: clientName)
                    .environmentObject(theme)
            }
        }
    }

    // MARK: - Actions

    private func add(_ product: Product) {
        guard product.stock_quantity > 0 else { return }
        if let i = cart.firstIndex(where: { $0.product.id == product.id }) {
            guard Int(cart[i].quantity) < product.stock_quantity else { return }
            cart[i].quantity += 1
        } else {
            cart.append(CartItem(product: product, quantity: 1, unitPrice: product.price))
        }
    }

    private func confirmSale() async {
        guard !cart.isEmpty else { return }
        isSaving = true; errorMsg = nil
        let payload = SalePayload(
            items: cart.map { SaleItemPayload(product_id: $0.product.id, quantity: Int($0.quantity)) },
            payment_method: paymentMethod,
            payment_account_id: paymentAccountId,
            discount_percent: discountPercent,
            tva_enabled: tvaEnabled,
            tax_rate: tvaRate
        )
        do {
            let sale = try await APIClient.shared.createSale(payload)
            lastSale = sale
            cart = []
            discountPercent = 0
            clientName = ""
            showCart = false
            showReceipt = true
        } catch {
            errorMsg = error.localizedDescription
        }
        isSaving = false
    }

    private func loadData() async {
        isLoading = true
        async let productsTask = APIClient.shared.products()
        async let accountsTask = APIClient.shared.paymentAccounts()
        products    = (try? await productsTask) ?? []
        payAccounts = (try? await accountsTask) ?? []
        // Auto-select default POS account
        let posAccounts = payAccounts.filter { $0.enabled && $0.use_for_pos }
        if let def = posAccounts.first(where: { $0.is_default_pos }) ?? posAccounts.first {
            paymentMethod    = def.provider == "zola" ? "qr" : def.provider
            paymentAccountId = def.id
        }
        isLoading = false
    }
}

// MARK: - Product card

struct POSProductCard: View {
    let product: Product
    let onTap: () -> Void
    @EnvironmentObject private var theme: CompanyTheme

    private var icon: (symbol: String, tint: Color) { _productIcon(product.category) }

    private var stockBadge: (label: String, color: Color) {
        if product.stock_quantity <= 0 { return ("Rupture", .red) }
        if product.stock_quantity <= 5  { return ("×\(product.stock_quantity)", .orange) }
        return ("×\(product.stock_quantity)", .green)
    }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(icon.tint.opacity(0.12))
                    Image(systemName: icon.symbol)
                        .font(.title2)
                        .foregroundStyle(icon.tint)
                }
                .frame(height: 56)

                Text(product.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)
                    .foregroundStyle(product.stock_quantity <= 0 ? Color.secondary : Color.primary)

                if let cat = product.category {
                    Text(cat)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                HStack(alignment: .firstTextBaseline) {
                    Text(fcfa(product.price))
                        .font(.caption.bold())
                        .foregroundStyle(product.stock_quantity <= 0 ? Color.secondary : theme.primary)
                    Spacer()
                    Text(stockBadge.label)
                        .font(.caption2.bold())
                        .padding(.horizontal, 5).padding(.vertical, 2)
                        .background(stockBadge.color.opacity(0.15))
                        .foregroundStyle(stockBadge.color)
                        .clipShape(Capsule())
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(product.stock_quantity <= 0
                ? Color.secondary.opacity(0.05)
                : Color.primary.opacity(0.04))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .opacity(product.stock_quantity <= 0 ? 0.5 : 1)
        }
        .buttonStyle(.plain)
        .disabled(product.stock_quantity <= 0)
    }
}

// MARK: - Receipt view

struct ReceiptView: View {
    let sale: SaleResponse
    let clientName: String
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: CompanyTheme

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 64))
                        .foregroundStyle(.green)

                    VStack(spacing: 4) {
                        Text("Vente réussie !").font(.title2.bold())
                        if let num = sale.receipt_number {
                            Text("Reçu n° \(num)").font(.subheadline).foregroundStyle(.secondary)
                        }
                        if !clientName.isEmpty {
                            Text("Client : \(clientName)").font(.caption).foregroundStyle(.secondary)
                        }
                    }

                    GlassCard(padding: 16, cornerRadius: 16) {
                        VStack(spacing: 10) {
                            if let items = sale.items, !items.isEmpty {
                                ForEach(items, id: \.product_id) { item in
                                    HStack {
                                        Text("\(item.quantity)× \(item.name)")
                                            .font(.subheadline)
                                            .lineLimit(1)
                                        Spacer()
                                        Text(fcfa(item.total))
                                            .font(.subheadline.weight(.semibold))
                                    }
                                }
                                Divider()
                            }

                            HStack {
                                Text("TOTAL TTC").font(.headline.weight(.heavy))
                                Spacer()
                                Text(fcfa(sale.total_amount))
                                    .font(.title3.bold())
                                    .foregroundStyle(theme.primary)
                            }

                            let payLabel = (sale.payment_account_label?.isEmpty == false)
                                ? sale.payment_account_label!
                                : (sale.payment_method?.capitalized ?? "")
                            if !payLabel.isEmpty {
                                HStack {
                                    Text("Paiement").foregroundStyle(.secondary)
                                    Spacer()
                                    Text(payLabel).foregroundStyle(.secondary)
                                }
                                .font(.caption)
                            }
                        }
                    }
                    .environmentObject(theme)

                    Text("Transaction enregistrée dans la comptabilité")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(24)
            }
            .navigationTitle("Reçu")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Nouvelle vente") { dismiss() }
                }
            }
        }
    }
}

