import SwiftUI

// ============================================================================
//  Achats — Fournisseurs + Bons de commande (Phase B)
// ============================================================================

private let STATUS_LABEL: [String: String] = [
    "draft": "Brouillon", "ordered": "Commandé", "received": "Reçu", "paid": "Payé", "cancelled": "Annulé",
]
private let APPROVAL_LABEL: [String: String] = [
    "pending": "En attente d'approbation", "approved": "Approuvé", "rejected": "Rejeté",
]

struct PurchasesView: View {
    @State private var tab = 0

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                Text("Bons de commande").tag(0)
                Text("Fournisseurs").tag(1)
                Text("Reçues").tag(2)
            }
            .pickerStyle(.segmented)
            .padding()

            switch tab {
            case 0: PurchaseOrdersView()
            case 1: SuppliersView()
            default: ReceivedOrdersView()
            }
        }
        .navigationTitle("Achats")
    }
}

// MARK: - Fournisseurs

struct SuppliersView: View {
    @StateObject private var state = Loadable<[Supplier]>()
    @State private var incoming: [SupplierConnection] = []
    @State private var showNew = false
    @State private var connecting: Supplier?
    @State private var respondingId: Int?
    @State private var showConnectCompany = false

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun fournisseur", emptyIcon: "building.2", reload: load) { suppliers in
            List {
                if !incoming.isEmpty {
                    Section("Demandes de connexion reçues") {
                        ForEach(incoming) { c in
                            VStack(alignment: .leading, spacing: 6) {
                                Text("\(c.requester_company_name) souhaite vous ajouter comme fournisseur connecté")
                                    .font(.caption)
                                HStack(spacing: 8) {
                                    Button {
                                        Task { await respond(c, accept: true) }
                                    } label: {
                                        if respondingId == c.id { ProgressView() } else { Text("Accepter").font(.caption.bold()) }
                                    }
                                    .buttonStyle(.borderedProminent).tint(.green)
                                    Button("Refuser") { Task { await respond(c, accept: false) } }
                                        .buttonStyle(.bordered).tint(.red)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
                Section {
                    ForEach(suppliers) { s in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text(s.name).font(.subheadline.bold())
                                if s.linked_company_id != nil {
                                    StatusPill(text: "Connecté", colorName: "green")
                                }
                            }
                            Text([s.email, s.phone, s.city].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                            if s.linked_company_id == nil {
                                Button("Connecter à une entreprise") { connecting = s }
                                    .font(.caption.bold()).buttonStyle(.bordered)
                            }
                        }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                HStack {
                    Button { showConnectCompany = true } label: { Image(systemName: "magnifyingglass").accessibilityLabel("Connecter une entreprise") }
                    Button { showNew = true } label: { Image(systemName: "plus").accessibilityLabel("Nouveau") }
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { SupplierFormView { await load() } }
        .sheet(item: $connecting) { s in ConnectSupplierView(supplier: s) { await load() } }
        .sheet(isPresented: $showConnectCompany) { ConnectCompanyDirectView { await load() } }
    }

    private func load() async {
        await state.load { try await APIClient.shared.suppliers() }
        incoming = (try? await APIClient.shared.incomingSupplierConnections()) ?? []
    }

    private func respond(_ c: SupplierConnection, accept: Bool) async {
        respondingId = c.id
        _ = try? await (accept ? APIClient.shared.acceptSupplierConnection(c.id) : APIClient.shared.declineSupplierConnection(c.id))
        await load()
        respondingId = nil
    }
}

struct ConnectSupplierView: View {
    let supplier: Supplier
    let onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [CompanySearchResult] = []
    @State private var searching = false
    @State private var connectingId: Int?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("Nom ou email de l'entreprise…", text: $query)
                        .onChange(of: query) { _, newValue in Task { await search(newValue) } }
                } footer: {
                    Text("Une fois qu'elle accepte, vos bons de commande vers « \(supplier.name) » apparaîtront directement dans son espace Achats.")
                }
                if searching { ProgressView() }
                ForEach(results) { c in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(c.name).font(.subheadline.bold())
                            Text([c.industry, c.city].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button {
                            Task { await connect(c) }
                        } label: {
                            if connectingId == c.id { ProgressView() } else { Text("Inviter").font(.caption.bold()) }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(connectingId != nil)
                    }
                }
            }
            .navigationTitle("Connecter « \(supplier.name) »")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } }
            }
        }
    }

    private func search(_ q: String) async {
        guard q.trimmingCharacters(in: .whitespaces).count >= 2 else { results = []; return }
        searching = true
        results = (try? await APIClient.shared.searchCompanies(q)) ?? []
        searching = false
    }

    private func connect(_ c: CompanySearchResult) async {
        connectingId = c.id
        _ = try? await APIClient.shared.connectSupplier(supplier.id, targetCompanyId: c.id)
        connectingId = nil
        await onDone()
        dismiss()
    }
}

struct ConnectCompanyDirectView: View {
    let onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [CompanySearchResult] = []
    @State private var searching = false
    @State private var connectingId: Int?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("Nom ou email de l'entreprise…", text: $query)
                        .onChange(of: query) { _, newValue in Task { await search(newValue) } }
                } footer: {
                    Text("Une fiche fournisseur est créée automatiquement et la demande de connexion lui est envoyée.")
                }
                if searching { ProgressView() }
                ForEach(results) { c in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(c.name).font(.subheadline.bold())
                            Text([c.industry, c.city].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button {
                            Task { await connect(c) }
                        } label: {
                            if connectingId == c.id { ProgressView() } else { Text("Connecter").font(.caption.bold()) }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(connectingId != nil)
                    }
                }
            }
            .navigationTitle("Connecter une entreprise")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } }
            }
        }
    }

    private func search(_ q: String) async {
        guard q.trimmingCharacters(in: .whitespaces).count >= 2 else { results = []; return }
        searching = true
        results = (try? await APIClient.shared.searchCompanies(q)) ?? []
        searching = false
    }

    private func connect(_ c: CompanySearchResult) async {
        connectingId = c.id
        _ = try? await APIClient.shared.connectCompanyDirect(targetCompanyId: c.id)
        connectingId = nil
        await onDone()
        dismiss()
    }
}

struct SupplierFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var city = ""
    @State private var taxId = ""
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Fournisseur") {
                    TextField("Nom *", text: $name)
                    TextField("Email", text: $email)
                    TextField("Téléphone", text: $phone)
                    TextField("Ville", text: $city)
                    TextField("NIU / NIF", text: $taxId)
                }
            }
            .navigationTitle("Nouveau fournisseur")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }.disabled(name.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        do {
            _ = try await APIClient.shared.createSupplier(SupplierPayload(
                name: name, email: email.isEmpty ? nil : email, phone: phone.isEmpty ? nil : phone,
                city: city.isEmpty ? nil : city, tax_id: taxId.isEmpty ? nil : taxId
            ))
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}

// MARK: - Bons de commande

struct PurchaseOrdersView: View {
    @StateObject private var state = Loadable<[PurchaseOrder]>()
    @State private var showNew = false
    @State private var busyId: Int?

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun bon de commande", emptyIcon: "cart", reload: load) { orders in
            List {
                ForEach(orders) { po in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            StatusPill(text: STATUS_LABEL[po.status] ?? po.status, colorName: statusColor(po.status))
                            if po.approval_status != "not_required" {
                                StatusPill(text: APPROVAL_LABEL[po.approval_status] ?? po.approval_status, colorName: "indigo")
                            }
                            Spacer()
                            Text(fcfa(po.total_amount)).font(.subheadline.bold())
                        }
                        Text("\(po.number) · \(po.supplier_name)").font(.subheadline.bold())
                        Text("\(po.lines.count) ligne(s)").font(.caption).foregroundStyle(.secondary)
                        HStack(spacing: 8) {
                            if po.status == "draft" && po.approval_status == "pending" {
                                actionButton("Approuver", busy: busyId == po.id) { await approve(po) }
                            }
                            if po.status == "draft" && po.approval_status != "pending" && po.approval_status != "rejected" {
                                actionButton("Commander", busy: busyId == po.id) { await order(po) }
                            }
                            if (po.status == "draft" || po.status == "ordered") && po.approval_status != "pending" && po.approval_status != "rejected" {
                                actionButton("Réceptionner", busy: busyId == po.id) { await receive(po) }
                            }
                            if po.status == "received" {
                                actionButton("Régler", busy: busyId == po.id) { await pay(po) }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus").accessibilityLabel("Nouveau") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { NewPurchaseOrderView { await load() } }
    }

    private func statusColor(_ s: String) -> String {
        switch s {
        case "paid": return "green"
        case "received": return "orange"
        case "ordered": return "blue"
        case "cancelled": return "red"
        default: return "gray"
        }
    }

    @ViewBuilder
    private func actionButton(_ label: String, busy: Bool, action: @escaping () async -> Void) -> some View {
        Button {
            Task { await action() }
        } label: {
            if busy { ProgressView() } else { Text(label).font(.caption.bold()) }
        }
        .buttonStyle(.bordered)
        .disabled(busy)
    }

    private func load() async { await state.load { try await APIClient.shared.purchaseOrders() } }
    private func approve(_ po: PurchaseOrder) async {
        busyId = po.id
        _ = try? await APIClient.shared.approvePurchaseOrder(po.id)
        await load(); busyId = nil
    }
    private func order(_ po: PurchaseOrder) async {
        busyId = po.id
        _ = try? await APIClient.shared.orderPurchaseOrder(po.id)
        await load(); busyId = nil
    }
    private func receive(_ po: PurchaseOrder) async {
        busyId = po.id
        _ = try? await APIClient.shared.receivePurchaseOrder(po.id)
        await load(); busyId = nil
    }
    private func pay(_ po: PurchaseOrder) async {
        busyId = po.id
        _ = try? await APIClient.shared.payPurchaseOrder(po.id, method: "bank")
        await load(); busyId = nil
    }
}

struct NewPurchaseOrderView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @StateObject private var suppliersState = Loadable<[Supplier]>()
    @State private var supplierId: Int?
    @State private var description = ""
    @State private var quantity = 1
    @State private var unitCost = 0.0
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Fournisseur") {
                    if let suppliers = suppliersState.value {
                        Picker("Fournisseur *", selection: $supplierId) {
                            Text("Sélectionner…").tag(Int?.none)
                            ForEach(suppliers) { s in Text(s.name).tag(Int?.some(s.id)) }
                        }
                    } else {
                        ProgressView()
                    }
                }
                // Version simplifiée : une seule ligne libre (hors-stock) par bon
                // de commande depuis l'app mobile — la gestion multi-lignes
                // détaillée par produit reste sur le web pour l'instant.
                Section("Ligne") {
                    TextField("Description *", text: $description)
                    Stepper("Quantité : \(quantity)", value: $quantity, in: 1...9999)
                    TextField("Coût unitaire", value: $unitCost, format: .number)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                }
            }
            .navigationTitle("Nouveau bon de commande")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Créer") { Task { await save() } }
                        .disabled(supplierId == nil || description.isEmpty || saving)
                }
            }
        }
        .task { await suppliersState.load { try await APIClient.shared.suppliers() } }
    }

    private func save() async {
        guard let supplierId else { return }
        saving = true
        do {
            let line = PurchaseOrderLinePayload(description: description, quantity: quantity, unit_cost: unitCost)
            _ = try await APIClient.shared.createPurchaseOrder(PurchaseOrderPayload(supplier_id: supplierId, lines: [line]))
            await onSaved(); dismiss()
        } catch { }
        saving = false
    }
}

// MARK: - Commandes reçues (réseau fournisseurs)

private let SUPPLIER_DECISION_LABEL: [String: String] = [
    "pending": "À traiter", "accepted": "Acceptée", "declined": "Refusée",
]

struct ReceivedOrdersView: View {
    @StateObject private var state = Loadable<[PurchaseOrder]>()
    @State private var busyId: Int?
    @State private var declining: PurchaseOrder?

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune commande reçue", emptyIcon: "tray.and.arrow.down", reload: load) { orders in
            List {
                ForEach(orders) { po in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            let decision = po.supplier_decision ?? "pending"
                            StatusPill(text: SUPPLIER_DECISION_LABEL[decision] ?? decision, colorName: decisionColor(decision))
                            Spacer()
                            Text(fcfa(po.total_amount)).font(.subheadline.bold())
                        }
                        Text("\(po.number) · \(po.buyer_company_name ?? "")").font(.subheadline.bold())
                        Text("\(po.lines.count) ligne(s)").font(.caption).foregroundStyle(.secondary)
                        if let reason = po.supplier_decision_reason, !reason.isEmpty {
                            Text("Motif : \(reason)").font(.caption).foregroundStyle(.red)
                        }
                        if (po.supplier_decision ?? "pending") == "pending" {
                            HStack(spacing: 8) {
                                Button {
                                    Task { await accept(po) }
                                } label: {
                                    if busyId == po.id { ProgressView() } else { Text("Accepter").font(.caption.bold()) }
                                }
                                .buttonStyle(.borderedProminent).tint(.green)
                                Button("Refuser") { declining = po }
                                    .buttonStyle(.bordered).tint(.red)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .task { await load() }
        .refreshable { await load() }
        .alert("Refuser ce bon de commande ?", isPresented: Binding(get: { declining != nil }, set: { if !$0 { declining = nil } })) {
            Button("Refuser", role: .destructive) { if let po = declining { Task { await decline(po) } } }
            Button("Annuler", role: .cancel) { declining = nil }
        }
    }

    private func decisionColor(_ s: String) -> String {
        switch s {
        case "accepted": return "green"
        case "declined": return "red"
        default: return "orange"
        }
    }

    private func load() async { await state.load { try await APIClient.shared.receivedPurchaseOrders() } }
    private func accept(_ po: PurchaseOrder) async {
        busyId = po.id
        _ = try? await APIClient.shared.supplierAcceptPurchaseOrder(po.id)
        await load(); busyId = nil
    }
    private func decline(_ po: PurchaseOrder) async {
        declining = nil
        busyId = po.id
        _ = try? await APIClient.shared.supplierDeclinePurchaseOrder(po.id, reason: "")
        await load(); busyId = nil
    }
}
