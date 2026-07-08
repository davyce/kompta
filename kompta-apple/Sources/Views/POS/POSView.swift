import SwiftUI
import PassKit
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

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
        opts.append(.init(id: "card", method: "card", accountId: nil, label: "Carte (hors app)", symbol: "creditcard.fill"))
    }
    // Tap to Pay on iPhone (StripeTerminal) : encaissement carte RÉEL, sans
    // lecteur externe. iOS uniquement (NFC absent sur Mac). Reste proposé
    // même si le compte Stripe/l'entitlement Apple ne sont pas encore
    // approuvés — la tentative échoue alors avec un message explicite
    // (cf. TapToPayCheckout.CheckoutError) plutôt que de masquer l'option.
    #if os(iOS)
    opts.append(.init(id: "tap_to_pay", method: "tap_to_pay", accountId: nil, label: "Tap to Pay", symbol: "wave.3.right.circle.fill"))
    #endif
    // Apple Pay : proposé uniquement si l'entreprise a activé/vérifié
    // "apple_pay" côté backend (compte Stripe) ET si l'appareil peut payer
    // (PassKit configuré avec au moins une carte Wallet).
    if accounts.contains(where: { $0.provider == "apple_pay" && $0.enabled && $0.use_for_pos })
        && PKPaymentAuthorizationController.canMakePayments() {
        opts.append(.init(id: "apple_pay", method: "apple_pay", accountId: nil, label: "Apple Pay", symbol: "applelogo"))
    }
    return opts
}

private func _posSymbol(_ method: String) -> String {
    switch method {
    case "cash":      return "banknote"
    case "card":      return "creditcard.fill"
    case "tap_to_pay": return "wave.3.right.circle.fill"
    case "bank":      return "building.columns.fill"
    case "qr":        return "qrcode"
    case "apple_pay": return "applelogo"
    default:          return "iphone"
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
    @State private var clients:         [Client]         = []
    @State private var isLoading        = true

    // Catalog filters
    @State private var search           = ""
    @State private var selectedCategory = "Tous"

    // Cart
    @State private var cart:            [CartItem] = []
    // Clé d'idempotence de la tentative de checkout en cours : générée une
    // fois au premier tap sur "Encaisser" pour ce panier, réutilisée si la
    // requête est retentée après un échec réseau, effacée une fois la vente
    // confirmée ou le panier vidé (nouveau panier → nouvelle clé).
    @State private var checkoutKey:     String?

    // Payment
    @State private var paymentMethod    = "cash"
    @State private var paymentAccountId: Int? = nil

    // Price adjustments
    @State private var discountPercent: Double = 0
    @State private var tvaEnabled              = true
    @State private var tvaRate:         Double = 18

    // Client shown on receipt
    @State private var clientName       = ""
    @State private var selectedClientId: Int?
    @State private var clientDiscounts: [ClientDiscount] = []

    // UI
    @State private var showCart         = false
    @State private var lastSale:        SaleResponse?
    @State private var showReceipt      = false
    @State private var isSaving         = false
    @State private var errorMsg:        String?
    @State private var showHistory      = false
    @State private var cashBalance:     PosSessionBalance?
    private let applePayCheckout = ApplePayCheckout()

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
        Group {
            #if os(iOS)
            iOSLayout
            #else
            macOSLayout
            #endif
        }
        .onChange(of: subtotal) { _, _ in
            if let id = selectedClientId, let client = clients.first(where: { $0.id == id }) {
                applyClientPromotion(client)
            }
        }
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
            ToolbarItem(placement: .navigationBarLeading) { cashBalanceBadge }
            ToolbarItem(placement: .navigationBarTrailing) { cartBadgeButton }
            #endif
            ToolbarItem(placement: .secondaryAction) {
                Button { showHistory = true } label: { Label("Historique des ventes", systemImage: "clock.arrow.circlepath") }
            }
            ToolbarItem(placement: .secondaryAction) {
                DownloadButton(title: "Exporter ventes (CSV)", fileName: "ventes-pos.csv",
                               fetch: { try await APIClient.shared.posSalesExportCSV() })
            }
        }
        .sheet(isPresented: $showCart) { cartSheetView }
        .sheet(isPresented: $showReceipt) { receiptSheetView }
        .sheet(isPresented: $showHistory) { SalesHistoryView().environmentObject(theme) }
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
        .toolbar {
            ToolbarItem(placement: .navigation) { cashBalanceBadge }
            ToolbarItem(placement: .primaryAction) {
                Button { showHistory = true } label: { Label("Historique des ventes", systemImage: "clock.arrow.circlepath") }
            }
        }
        .sheet(isPresented: $showReceipt) { receiptSheetView }
        .sheet(isPresented: $showHistory) { SalesHistoryView().environmentObject(theme) }
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

    @ViewBuilder
    private var cashBalanceBadge: some View {
        if let balance = cashBalance {
            HStack(spacing: 4) {
                Image(systemName: "banknote").font(.caption)
                Text(fcfa(balance.expectedCash)).font(.caption.weight(.semibold))
            }
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(Color.green.opacity(0.15), in: Capsule())
            .foregroundStyle(.green)
            .help("Solde théorique de la caisse (fonds de départ + ventes en espèces depuis l'ouverture)")
        }
    }

    private var cartBadgeButton: some View {
        // Le badge doit rester DANS le cadre du bouton — un offset qui déborde
        // du frame est rogné par les bornes de clipping de la toolbar iOS.
        Button { showCart = true } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "cart.fill")
                    .frame(width: 26, height: 26, alignment: .bottomLeading)
                if cartCount > 0 {
                    Text("\(min(cartCount, 99))")
                        .font(.system(size: 8, weight: .bold))
                        .padding(3)
                        .frame(minWidth: 14, minHeight: 14)
                        .background(Color.red)
                        .foregroundStyle(.white)
                        .clipShape(Circle())
                }
            }
            .frame(width: 26, height: 26)
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
                Picker("Client", selection: $selectedClientId) {
                    Text("Aucun client").tag(nil as Int?)
                    ForEach(clients.filter(\.isActive)) { client in
                        Text(client.global_discount_percent > 0
                             ? "\(client.name) · -\(Int(client.global_discount_percent))%"
                             : client.name)
                            .tag(client.id as Int?)
                    }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)
                .onChange(of: selectedClientId) { _, id in
                    Task { await selectClient(id) }
                }
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
                if paymentMethod == "apple_pay" {
                    Task { await confirmSaleWithApplePay() }
                } else if paymentMethod == "tap_to_pay" {
                    Task { await confirmSaleWithTapToPay() }
                } else {
                    Task { await confirmSale() }
                }
            } label: {
                HStack {
                    if isSaving {
                        ProgressView().tint(.white)
                        if paymentMethod == "tap_to_pay" { Text("Approchez la carte…") }
                    } else {
                        Image(systemName: paymentMethod == "apple_pay" ? "applelogo" : paymentMethod == "tap_to_pay" ? "wave.3.right.circle.fill" : "checkmark.seal.fill")
                        Text(paymentMethod == "apple_pay" ? "Payer avec Apple Pay · \(fcfa(grandTotal))" : paymentMethod == "tap_to_pay" ? "Tap to Pay · \(fcfa(grandTotal))" : "Encaisser · \(fcfa(grandTotal))")
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

    /// Encaissement Apple Pay : la feuille PassKit doit être confirmée par
    /// Stripe AVANT de créer la vente côté backend (l'argent doit être capturé
    /// en premier). Une fois le paiement Apple Pay réussi, on enchaîne sur le
    /// flux normal de création de vente (avec payment_method="apple_pay").
    private func confirmSaleWithApplePay() async {
        guard !cart.isEmpty else { return }
        isSaving = true; errorMsg = nil
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            applePayCheckout.start(
                amountCents: Int((grandTotal * 100).rounded()),
                currency: "XAF",
                description: "Vente POS KOMPTA"
            ) { result in
                Task { @MainActor in
                    switch result {
                    case .success:
                        await confirmSale()
                    case .failure(let error):
                        if !(error is CancellationError) {
                            errorMsg = error.localizedDescription
                        }
                        isSaving = false
                    }
                    continuation.resume()
                }
            }
        }
    }

    /// Encaissement Tap to Pay on iPhone : même principe qu'Apple Pay — la
    /// carte doit être débitée AVANT que la vente ne soit créée côté backend.
    /// Pas de `#if os(iOS)` ici : `TapToPayCheckout` a son propre stub macOS
    /// qui échoue proprement (option jamais proposée sur Mac de toute façon).
    private func confirmSaleWithTapToPay() async {
        guard !cart.isEmpty else { return }
        isSaving = true; errorMsg = nil
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            TapToPayCheckout.shared.start(
                amountCents: Int((grandTotal * 100).rounded()),
                currency: "XAF",
                description: "Vente POS KOMPTA"
            ) { result in
                Task { @MainActor in
                    switch result {
                    case .success:
                        await confirmSale()
                    case .failure(let error):
                        errorMsg = error.localizedDescription
                        isSaving = false
                    }
                    continuation.resume()
                }
            }
        }
    }

    private func confirmSale() async {
        guard !cart.isEmpty else { return }
        isSaving = true; errorMsg = nil
        // Réutilise la clé déjà générée pour cette tentative (retry après
        // échec réseau) ou en génère une nouvelle si aucune n'est en cours.
        let key = checkoutKey ?? UUID().uuidString
        if checkoutKey == nil { checkoutKey = key }
        let payload = SalePayload(
            items: cart.map { SaleItemPayload(product_id: $0.product.id, quantity: Int($0.quantity)) },
            payment_method: paymentMethod,
            payment_account_id: paymentAccountId,
            client_id: selectedClientId,
            discount_percent: discountPercent,
            tva_enabled: tvaEnabled,
            tax_rate: tvaRate,
            idempotency_key: key
        )
        do {
            let sale = try await APIClient.shared.createSale(payload)
            lastSale = sale
            cart = []
            checkoutKey = nil
            discountPercent = 0
            clientName = ""
            selectedClientId = nil
            clientDiscounts = []
            showCart = false
            showReceipt = true
            await loadCashBalance()
        } catch {
            errorMsg = error.localizedDescription
        }
        isSaving = false
    }

    private func loadData() async {
        isLoading = true
        async let productsTask = APIClient.shared.products()
        async let accountsTask = APIClient.shared.paymentAccounts()
        async let clientsTask = APIClient.shared.clients()
        products    = (try? await productsTask) ?? []
        payAccounts = (try? await accountsTask) ?? []
        clients     = (try? await clientsTask) ?? []
        // Auto-select default POS account
        let posAccounts = payAccounts.filter { $0.enabled && $0.use_for_pos }
        if let def = posAccounts.first(where: { $0.is_default_pos }) ?? posAccounts.first {
            paymentMethod    = def.provider == "zola" ? "qr" : def.provider
            paymentAccountId = def.id
        }
        isLoading = false
        await loadCashBalance()
    }

    private func loadCashBalance() async {
        cashBalance = try? await APIClient.shared.posSessionBalance()
    }

    private func selectClient(_ id: Int?) async {
        guard let id, let client = clients.first(where: { $0.id == id }) else {
            clientName = ""
            clientDiscounts = []
            discountPercent = 0
            return
        }
        clientName = client.name
        clientDiscounts = (try? await APIClient.shared.clientDiscounts(id)) ?? []
        applyClientPromotion(client)
    }

    private func applyClientPromotion(_ client: Client) {
        let eligible = clientDiscounts.filter {
            $0.active && ($0.applies_to == "all" || $0.applies_to == "pos")
                && $0.min_order_amount <= subtotal
        }
        let bestPercent = eligible
            .filter { $0.discount_type == "percent" }
            .map(\.discount_value).max() ?? 0
        let bestFixed = eligible
            .filter { $0.discount_type == "fixed" }
            .map(\.discount_value).max() ?? 0
        let fixedAsPercent = subtotal > 0 ? min(100, bestFixed / subtotal * 100) : 0
        discountPercent = max(client.global_discount_percent, bestPercent, fixedAsPercent)
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
                ZStack(alignment: .topTrailing) {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(icon.tint.opacity(0.12))
                    Image(systemName: icon.symbol)
                        .font(.title2)
                        .foregroundStyle(icon.tint)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    // Badge de stock : fond plein + texte blanc pour rester lisible
                    // même à 3 chiffres (l'ancien badge en coin de ligne de prix,
                    // en .caption2 sur fond à 15% d'opacité, était illisible).
                    Text(stockBadge.label)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(stockBadge.color, in: Capsule())
                        .padding(5)
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

                Text(fcfa(product.price))
                    .font(.caption.bold())
                    .foregroundStyle(product.stock_quantity <= 0 ? Color.secondary : theme.primary)
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

/// Reçu de caisse affiché juste après un encaissement — reprend le design du
/// "Ticket de caisse" web (logo K, en-tête entreprise, sous-total/remise/TTC,
/// boutons Imprimer / Nouvelle vente) pour une expérience identique.
struct ReceiptView: View {
    let sale: SaleResponse
    let clientName: String
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: CompanyTheme
    @State private var preparingPrint = false

    private var subtotal: Double {
        (sale.items ?? []).reduce(0) { $0 + $1.total }
    }
    private var discountAmount: Double { sale.discount_amount ?? 0 }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    // ── En-tête : logo K + nom entreprise ──
                    VStack(spacing: 10) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(theme.primary)
                                .frame(width: 52, height: 52)
                            Text("K").font(.system(size: 26, weight: .black)).foregroundStyle(.white)
                        }
                        Text(theme.companyName).font(.title3.bold())
                        VStack(spacing: 2) {
                            Text("TICKET DE CAISSE").font(.caption.bold()).foregroundStyle(.secondary)
                            if let num = sale.receipt_number {
                                Text(num).font(.subheadline.monospaced())
                            }
                        }
                    }
                    .padding(.top, 20)
                    .padding(.bottom, 16)

                    dashedDivider

                    // ── Lignes d'articles ──
                    VStack(spacing: 8) {
                        if let items = sale.items, !items.isEmpty {
                            ForEach(items, id: \.product_id) { item in
                                HStack {
                                    Text("\(item.quantity)× \(item.name)")
                                        .font(.subheadline)
                                        .lineLimit(1)
                                    Spacer()
                                    Text(fcfa(item.total)).font(.subheadline.weight(.semibold))
                                }
                            }
                        }
                    }
                    .padding(.vertical, 14)

                    dashedDivider

                    // ── Totaux ──
                    VStack(spacing: 8) {
                        HStack {
                            Text("Sous-total").foregroundStyle(.secondary)
                            Spacer()
                            Text(fcfa(subtotal)).foregroundStyle(.secondary)
                        }
                        .font(.subheadline)

                        if discountAmount > 0 {
                            HStack {
                                Text("Remise" + (sale.discount_percent.map { $0 > 0 ? " (\(Int($0))%)" : "" } ?? ""))
                                Spacer()
                                Text("-\(fcfa(discountAmount))")
                            }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.red)
                        }

                        HStack {
                            Text("TOTAL TTC").font(.headline.weight(.heavy))
                            Spacer()
                            Text(fcfa(sale.total_amount))
                                .font(.title3.bold())
                                .foregroundStyle(theme.primary)
                        }
                        .padding(.top, 4)

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
                    .padding(.vertical, 14)

                    let receiptClient = sale.client_name?.isEmpty == false ? sale.client_name! : clientName
                    if !receiptClient.isEmpty || (sale.loyalty_points_earned ?? 0) > 0 {
                        dashedDivider
                        VStack(spacing: 4) {
                            if !receiptClient.isEmpty {
                                Text("Client : \(receiptClient)").font(.caption).foregroundStyle(.secondary)
                            }
                            if let points = sale.loyalty_points_earned, points > 0 {
                                Text("+\(points) point(s) fidélité").font(.caption.bold()).foregroundStyle(theme.primary)
                            }
                        }
                        .padding(.vertical, 10)
                    }

                    dashedDivider

                    VStack(spacing: 2) {
                        Text("Merci pour votre achat").font(.subheadline)
                        Text("Ticket généré par \(theme.companyName)")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 16)

                    // ── Actions ──
                    HStack(spacing: 10) {
                        Button {
                            Task { await preparePrint() }
                        } label: {
                            HStack {
                                if preparingPrint { ProgressView() }
                                else { Image(systemName: "printer") }
                                Text("Imprimer")
                            }
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: theme.buttonRadius))
                        }
                        .buttonStyle(.plain)
                        .disabled(preparingPrint)

                        Button { dismiss() } label: {
                            HStack {
                                Image(systemName: "cart.fill")
                                Text("Nouvelle vente")
                            }
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(theme.primary, in: RoundedRectangle(cornerRadius: theme.buttonRadius))
                            .foregroundStyle(.white)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.top, 4)
                }
                .padding(20)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(.background)
                        .shadow(color: .black.opacity(0.06), radius: 12, y: 4)
                )
                .padding(16)
            }
            .navigationTitle("Ticket de caisse")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    DownloadButton(
                        title: "Télécharger le ticket",
                        fileName: "ticket-\(sale.receipt_number ?? String(sale.id)).pdf",
                        fetch: { try await APIClient.shared.saleReceiptPDF(sale.id) }
                    )
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
    }

    private var dashedDivider: some View {
        Rectangle()
            .fill(Color.secondary.opacity(0.3))
            .frame(height: 1)
            .overlay(
                GeometryReader { geo in
                    Path { path in
                        path.move(to: CGPoint(x: 0, y: 0.5))
                        path.addLine(to: CGPoint(x: geo.size.width, y: 0.5))
                    }
                    .stroke(style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    .foregroundStyle(Color.secondary.opacity(0.4))
                }
            )
    }

    private func preparePrint() async {
        preparingPrint = true
        if let url = await exportSaleReceiptPDF(saleId: sale.id, receiptNumber: sale.receipt_number ?? "ticket-\(sale.id)") {
            #if os(macOS)
            NSWorkspace.shared.open(url)
            #else
            let controller = UIPrintInteractionController.shared
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = sale.receipt_number ?? "Ticket KOMPTA"
            controller.printInfo = info
            controller.printingItem = url
            controller.present(animated: true)
            #endif
        }
        preparingPrint = false
    }
}

// MARK: - Historique des ventes
//
// Après paiement à la caisse, la vente n'apparaît jamais sur la page
// Facturation (un ticket de caisse n'est pas une facture client — deux
// enregistrements distincts, par design). Mais il n'existait AUCUN endroit
// pour retrouver un ticket déjà payé une fois la feuille de reçu fermée :
// cet écran comble ce vide via GET /pos/sales.

struct SalesHistoryView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var state = Loadable<[SaleHistoryItem]>()
    @State private var selected: SaleHistoryItem?

    var body: some View {
        NavigationStack {
            AsyncList(state: state, emptyTitle: "Aucune vente enregistrée", emptyIcon: "cart",
                      reload: load) { sales in
                List(sales) { sale in
                    Button { selected = sale } label: { row(sale) }
                        .buttonStyle(.plain)
                }
                #if os(iOS)
                .listStyle(.insetGrouped)
                #endif
            }
            .navigationTitle("Historique des ventes")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } } }
            .task { await load() }
            .refreshable { await load() }
            .sheet(item: $selected) { sale in SaleDetailView(sale: sale).environmentObject(theme) }
        }
    }

    private func row(_ sale: SaleHistoryItem) -> some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous).fill(theme.primary.opacity(0.12))
                Image(systemName: "receipt").foregroundStyle(theme.primary)
            }
            .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(sale.receipt_number ?? "Vente #\(sale.id)").font(.subheadline.bold())
                Text("\(sale.items.count) article(s) · \(sale.payment_account_label?.isEmpty == false ? sale.payment_account_label! : (sale.payment_method?.capitalized ?? ""))")
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                if let d = sale.created_at { Text(shortDate(d)).font(.caption2).foregroundStyle(.tertiary) }
            }
            Spacer()
            Text(fcfa(sale.total_amount)).font(.subheadline.bold()).foregroundStyle(theme.primary)
        }
        .padding(.vertical, 3)
    }

    private func load() async { await state.load { try await APIClient.shared.posSales() } }
}

/// Détail d'une vente passée — même présentation qu'un reçu, en lecture seule.
private struct SaleDetailView: View {
    let sale: SaleHistoryItem
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: CompanyTheme

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    VStack(spacing: 4) {
                        Text(sale.receipt_number ?? "Vente #\(sale.id)").font(.title3.bold())
                        if let d = sale.created_at { Text(shortDate(d)).font(.caption).foregroundStyle(.secondary) }
                    }

                    GlassCard(padding: 16, cornerRadius: 16) {
                        VStack(spacing: 10) {
                            ForEach(sale.items, id: \.product_name) { item in
                                HStack {
                                    Text("\(item.quantity)× \(item.product_name)").font(.subheadline).lineLimit(1)
                                    Spacer()
                                    Text(fcfa(item.line_total)).font(.subheadline.weight(.semibold))
                                }
                            }
                            Divider()
                            HStack {
                                Text("TOTAL TTC").font(.headline.weight(.heavy))
                                Spacer()
                                Text(fcfa(sale.total_amount)).font(.title3.bold()).foregroundStyle(theme.primary)
                            }
                            let payLabel = (sale.payment_account_label?.isEmpty == false)
                                ? sale.payment_account_label! : (sale.payment_method?.capitalized ?? "")
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
                }
                .padding(24)
            }
            .navigationTitle("Reçu")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    DownloadButton(
                        title: "Partager le ticket",
                        fileName: "ticket-\(sale.receipt_number ?? String(sale.id)).pdf",
                        fetch: { try await APIClient.shared.saleReceiptPDF(sale.id) }
                    )
                }
                ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } }
            }
        }
    }
}
