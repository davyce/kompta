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
            }
            .pickerStyle(.segmented)
            .padding()

            if tab == 0 { PurchaseOrdersView() } else { SuppliersView() }
        }
        .navigationTitle("Achats")
    }
}

// MARK: - Fournisseurs

struct SuppliersView: View {
    @StateObject private var state = Loadable<[Supplier]>()
    @State private var showNew = false

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun fournisseur", emptyIcon: "building.2", reload: load) { suppliers in
            List {
                ForEach(suppliers) { s in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(s.name).font(.subheadline.bold())
                        Text([s.email, s.phone, s.city].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { SupplierFormView { await load() } }
    }

    private func load() async { await state.load { try await APIClient.shared.suppliers() } }
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
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
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
