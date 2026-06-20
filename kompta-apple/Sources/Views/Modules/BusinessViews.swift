import SwiftUI
import Charts

// ============================================================================
//  Wave 1 — Ventes & clients + Finance core
//  Clients (CRM) · Facturation (Invoices) · Inventaire · Transactions
//  All screens read/write the live backend through APIClient.
// ============================================================================

// MARK: - Clients

struct ClientsView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var state = Loadable<[Client]>()
    @State private var search = ""
    @State private var statusFilter = "all"   // all | active | inactive | prospect
    @State private var showNew = false

    private let filters = [("all", "Tous"), ("active", "Actifs"), ("inactive", "Inactifs"), ("prospect", "Prospects")]

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun client", emptyIcon: "person.crop.circle.badge.plus",
                  reload: load) { clients in
            let displayed = filtered(clients)
            List {
                // KPI bar
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            kpiChip("Total", "\(clients.count)", "person.2", .blue)
                            kpiChip("Actifs", "\(clients.filter { $0.status == "active" }.count)", "checkmark.circle", .green)
                            kpiChip("Prospects", "\(clients.filter { $0.status == "prospect" }.count)", "clock", .orange)
                            kpiChip("Pts fidélité", "\(clients.reduce(0) { $0 + $1.loyalty_points })", "star", theme.primary)
                        }
                        .padding(.horizontal, 2)
                    }
                    // Status filter chips
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(filters, id: \.0) { key, label in
                                Button {
                                    withAnimation(.easeInOut(duration: 0.18)) { statusFilter = key }
                                } label: {
                                    Text(label)
                                        .font(.caption.bold())
                                        .padding(.horizontal, 12).padding(.vertical, 6)
                                        .background(statusFilter == key ? theme.primary : theme.primary.opacity(0.1))
                                        .foregroundStyle(statusFilter == key ? .white : theme.primary)
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 2).padding(.vertical, 2)
                    }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)

                ForEach(displayed) { c in
                    NavigationLink { ClientDetailView(client: c, onChanged: load) } label: { ClientRow(client: c) }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .searchable(text: $search, prompt: "Nom, e-mail ou ville")
        .navigationTitle("Clients")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showNew = true } label: { Image(systemName: "plus") }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) {
            ClientFormView(onSaved: { await load() })
        }
    }

    @ViewBuilder private func kpiChip(_ title: String, _ value: String, _ icon: String, _ color: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.caption).foregroundStyle(color)
            VStack(alignment: .leading, spacing: 1) {
                Text(value).font(.caption.bold()).foregroundStyle(.primary)
                Text(title).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func filtered(_ c: [Client]) -> [Client] {
        c.filter { client in
            let matchSearch = search.isEmpty ||
                client.name.localizedCaseInsensitiveContains(search) ||
                (client.email ?? "").localizedCaseInsensitiveContains(search) ||
                (client.city ?? "").localizedCaseInsensitiveContains(search)
            let matchStatus = statusFilter == "all" || client.status == statusFilter
            return matchSearch && matchStatus
        }
    }
    private func load() async { await state.load { try await APIClient.shared.clients() } }
}

private struct ClientRow: View {
    let client: Client
    @EnvironmentObject private var theme: CompanyTheme

    private var statusColor: Color {
        switch client.status {
        case "active": return .green
        case "inactive": return .gray
        default: return .orange
        }
    }
    private var statusLabel: String {
        switch client.status {
        case "active": return "Actif"
        case "inactive": return "Inactif"
        default: return "Prospect"
        }
    }

    var body: some View {
        HStack(spacing: 14) {
            AvatarView(initials: client.initials, size: 42, color: theme.primary)
            VStack(alignment: .leading, spacing: 3) {
                Text(client.name).font(.subheadline.bold())
                HStack(spacing: 6) {
                    Text(statusLabel)
                        .font(.caption2.bold())
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(statusColor.opacity(0.15))
                        .foregroundStyle(statusColor)
                        .clipShape(Capsule())
                    if let phone = client.phone, !phone.isEmpty {
                        Text(phone).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Spacer()
            if client.loyalty_points > 0 {
                Text("\(client.loyalty_points) pts")
                    .font(.caption2.bold())
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(theme.primary.opacity(0.15))
                    .foregroundStyle(theme.primary)
                    .clipShape(Capsule())
            }
        }
        .padding(.vertical, 3)
    }
}

struct ClientDetailView: View {
    let client: Client
    let onChanged: (() async -> Void)?
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var stats = Loadable<ClientStats>()
    @StateObject private var discounts = Loadable<[ClientDiscount]>()
    @State private var showEdit = false
    @State private var showDeleteConfirm = false
    @State private var showAddDiscount = false
    @State private var showAddPoints = false
    @State private var pointsDelta = 0
    @State private var deleting = false
    @Environment(\.dismiss) private var dismiss

    init(client: Client, onChanged: (() async -> Void)? = nil) {
        self.client = client
        self.onChanged = onChanged
    }

    private var tierColor: Color {
        switch client.loyalty_tier {
        case "gold": return Color(red: 0.85, green: 0.65, blue: 0.1)
        case "silver": return .gray
        case "vip": return .purple
        default: return theme.primary
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Header
                VStack(spacing: 10) {
                    AvatarView(initials: client.initials, size: 76, color: theme.primary)
                    Text(client.name).font(.title2.bold())
                    HStack(spacing: 8) {
                        StatusPill(text: tierLabel(client.loyalty_tier), colorName: tierColorName(client.loyalty_tier))
                        StatusPill(text: statusLabel(client.status), colorName: statusColorName(client.status))
                    }
                }
                .padding(.top)
                .frame(maxWidth: .infinity)

                // Stats KPIs
                if let s = stats.value {
                    HStack(spacing: 12) {
                        MetricCard(title: "Factures", value: "\(s.invoice_count)", icon: "doc.text", color: theme.primary)
                        MetricCard(title: "CA total", value: fcfa(s.total_revenue), icon: "banknote", color: .green)
                    }
                    if s.unpaid_count > 0 {
                        MetricCard(title: "Impayées", value: "\(s.unpaid_count)", icon: "exclamationmark.circle", color: .red)
                    }
                    if let d = s.last_invoice_date {
                        Text("Dernière facture : \(shortDate(d))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                } else {
                    ShimmerBox(height: 80)
                }

                // Contact info
                GlassCard(padding: 0, cornerRadius: 18) {
                    VStack(spacing: 0) {
                        infoRow("E-mail", client.email, "envelope")
                        infoRow("Téléphone", client.phone, "phone")
                        infoRow("Ville", client.city, "mappin.and.ellipse")
                        infoRow("Adresse", client.address, "house")
                        infoRow("Pays", client.country, "globe")
                        if let notes = client.notes, !notes.isEmpty {
                            infoRow("Notes", notes, "note.text", last: true)
                        }
                    }
                }

                // Fidélité / Loyalty panel
                loyaltyPanel

                // Remises spécifiques
                discountsPanel
            }
            .padding()
        }
        .navigationTitle("Fiche client")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                HStack {
                    Button { showEdit = true } label: {
                        Image(systemName: "pencil")
                    }
                    Button(role: .destructive) { showDeleteConfirm = true } label: {
                        Image(systemName: "trash").foregroundStyle(.red)
                    }
                }
            }
        }
        .task {
            async let s: () = stats.load { try await APIClient.shared.clientStats(client.id) }
            async let d: () = discounts.load { try await APIClient.shared.clientDiscounts(client.id) }
            _ = await (s, d)
        }
        .sheet(isPresented: $showEdit) {
            ClientFormView(existing: client, onSaved: {
                await onChanged?()
                dismiss()
            })
        }
        .sheet(isPresented: $showAddDiscount) {
            ClientDiscountFormView(clientId: client.id) {
                await discounts.load { try await APIClient.shared.clientDiscounts(client.id) }
            }
        }
        .alert("Supprimer \(client.name) ?", isPresented: $showDeleteConfirm) {
            Button("Supprimer", role: .destructive) { Task { await deleteClient() } }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Cette action est irréversible.")
        }
    }

    @ViewBuilder private var loyaltyPanel: some View {
        GlassCard(cornerRadius: 18) {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Label("Fidélité", systemImage: "star.fill").font(.headline).foregroundStyle(tierColor)
                    Spacer()
                    Text("\(client.loyalty_points) pts")
                        .font(.subheadline.bold()).foregroundStyle(tierColor)
                }

                // Tier quick-pick
                HStack(spacing: 8) {
                    ForEach(["standard", "silver", "gold", "vip"], id: \.self) { tier in
                        Button {
                            Task { await setTier(tier) }
                        } label: {
                            Text(tier.capitalized)
                                .font(.caption.bold())
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(client.loyalty_tier == tier ? tierColorFor(tier) : tierColorFor(tier).opacity(0.15))
                                .foregroundStyle(client.loyalty_tier == tier ? .white : tierColorFor(tier))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }

                if client.global_discount_percent > 0 {
                    HStack {
                        Text("Remise globale").font(.subheadline).foregroundStyle(.secondary)
                        Spacer()
                        Text("\(Int(client.global_discount_percent))%")
                            .font(.subheadline.bold()).foregroundStyle(.green)
                    }
                }

                // Add/remove points stepper
                HStack {
                    Text("Ajuster points").font(.subheadline)
                    Spacer()
                    Stepper("\(pointsDelta > 0 ? "+" : "")\(pointsDelta)", value: $pointsDelta, in: -500...500, step: 10)
                        .labelsHidden()
                    Text("\(pointsDelta > 0 ? "+" : "")\(pointsDelta)")
                        .font(.subheadline.bold())
                        .foregroundStyle(pointsDelta >= 0 ? .green : .red)
                        .frame(width: 50, alignment: .trailing)
                    Button("OK") { Task { await applyPoints() } }
                        .buttonStyle(.bordered).disabled(pointsDelta == 0)
                }
            }
        }
    }

    @ViewBuilder private var discountsPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Remises spécifiques").font(.headline)
                Spacer()
                Button { showAddDiscount = true } label: {
                    Image(systemName: "plus.circle").foregroundStyle(theme.primary)
                }
            }
            if let list = discounts.value {
                if list.isEmpty {
                    Text("Aucune remise spécifique")
                        .font(.caption).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 8)
                } else {
                    ForEach(list) { d in
                        GlassCard(padding: 12, cornerRadius: 12) {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(d.displayLabel).font(.subheadline.bold())
                                    Text(d.applies_to == "all" ? "Toutes opérations" : d.applies_to == "pos" ? "Caisse" : "Factures")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Button(role: .destructive) {
                                    Task { await removeDiscount(d.id) }
                                } label: {
                                    Image(systemName: "trash").foregroundStyle(.red.opacity(0.7))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            } else {
                ShimmerBox(height: 60)
            }
        }
    }

    @ViewBuilder private func infoRow(_ label: String, _ value: String?, _ icon: String, last: Bool = false) -> some View {
        if let value, !value.isEmpty {
            HStack(spacing: 14) {
                Image(systemName: icon).frame(width: 26).foregroundStyle(theme.primary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(.caption).foregroundStyle(.secondary)
                    Text(value).font(.subheadline)
                }
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            if !last { Divider().padding(.leading, 56) }
        }
    }

    private func tierLabel(_ tier: String) -> String {
        switch tier { case "gold": return "Gold"; case "silver": return "Silver"; case "vip": return "VIP"; default: return "Standard" }
    }
    private func tierColorName(_ tier: String) -> String {
        switch tier { case "gold": return "yellow"; case "silver": return "gray"; case "vip": return "purple"; default: return "blue" }
    }
    private func statusLabel(_ s: String) -> String {
        switch s { case "active": return "Actif"; case "inactive": return "Inactif"; default: return "Prospect" }
    }
    private func statusColorName(_ s: String) -> String {
        switch s { case "active": return "green"; case "inactive": return "gray"; default: return "orange" }
    }
    private func tierColorFor(_ tier: String) -> Color {
        switch tier { case "gold": return Color(red: 0.85, green: 0.65, blue: 0.1); case "silver": return .gray; case "vip": return .purple; default: return theme.primary }
    }

    private func setTier(_ tier: String) async {
        let p = UpdateClientLoyaltyPayload(points_delta: 0, loyalty_tier: tier, global_discount_percent: nil)
        _ = try? await APIClient.shared.updateClientLoyalty(client.id, p)
    }

    private func applyPoints() async {
        guard pointsDelta != 0 else { return }
        let p = UpdateClientLoyaltyPayload(points_delta: pointsDelta, loyalty_tier: nil, global_discount_percent: nil)
        if (try? await APIClient.shared.updateClientLoyalty(client.id, p)) != nil {
            pointsDelta = 0
        }
    }

    private func removeDiscount(_ discountId: Int) async {
        try? await APIClient.shared.deleteClientDiscount(client.id, discountId)
        await discounts.load { try await APIClient.shared.clientDiscounts(client.id) }
    }

    private func deleteClient() async {
        deleting = true
        try? await APIClient.shared.deleteClient(client.id)
        await onChanged?()
        dismiss()
    }
}

private struct ClientDiscountFormView: View {
    let clientId: Int
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var label = ""
    @State private var discountType = "percent"
    @State private var discountValue = 10.0
    @State private var appliesTo = "all"
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Remise") {
                    TextField("Libellé (optionnel)", text: $label)
                    Picker("Type", selection: $discountType) {
                        Text("Pourcentage (%)").tag("percent")
                        Text("Montant fixe (XAF)").tag("fixed")
                    }
                    HStack {
                        Text("Valeur")
                        Spacer()
                        TextField("Valeur", value: $discountValue, format: .number)
                            .multilineTextAlignment(.trailing)
                            #if os(iOS)
                            .keyboardType(.decimalPad)
                            #endif
                            .frame(width: 100)
                        Text(discountType == "percent" ? "%" : "XAF").foregroundStyle(.secondary)
                    }
                    Picker("Applicable sur", selection: $appliesTo) {
                        Text("Toutes opérations").tag("all")
                        Text("Factures seulement").tag("invoice")
                        Text("Caisse seulement").tag("pos")
                    }
                }
                if let error { Text(error).foregroundStyle(.red).font(.caption) }
            }
            .navigationTitle("Nouvelle remise")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Ajouter") { Task { await save() } }
                        .disabled(saving || discountValue <= 0)
                }
            }
        }
    }

    private func save() async {
        saving = true; error = nil
        let p = ClientDiscountPayload(label: label, discount_type: discountType,
                                     discount_value: discountValue, applies_to: appliesTo)
        do {
            _ = try await APIClient.shared.createClientDiscount(clientId, p)
            await onSaved()
            dismiss()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        saving = false
    }
}

struct ClientFormView: View {
    let existing: Client?
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var city = ""
    @State private var address = ""
    @State private var country = ""
    @State private var notes = ""
    @State private var status = "active"
    @State private var saving = false
    @State private var error: String?

    init(existing: Client? = nil, onSaved: @escaping () async -> Void) {
        self.existing = existing
        self.onSaved = onSaved
        if let c = existing {
            _name = State(initialValue: c.name)
            _email = State(initialValue: c.email ?? "")
            _phone = State(initialValue: c.phone ?? "")
            _city = State(initialValue: c.city ?? "")
            _address = State(initialValue: c.address ?? "")
            _country = State(initialValue: c.country ?? "")
            _notes = State(initialValue: c.notes ?? "")
            _status = State(initialValue: c.status)
        }
    }

    var isEdit: Bool { existing != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section("Identité") {
                    TextField("Nom complet *", text: $name)
                    TextField("E-mail", text: $email)
                        #if os(iOS)
                        .keyboardType(.emailAddress).textInputAutocapitalization(.never)
                        #endif
                    TextField("Téléphone", text: $phone)
                        #if os(iOS)
                        .keyboardType(.phonePad)
                        #endif
                    Picker("Statut", selection: $status) {
                        Text("Actif").tag("active")
                        Text("Prospect").tag("prospect")
                        Text("Inactif").tag("inactive")
                    }
                }
                Section("Localisation") {
                    TextField("Ville", text: $city)
                    TextField("Adresse", text: $address)
                    TextField("Pays", text: $country)
                }
                Section("Notes") {
                    TextField("Remarques", text: $notes, axis: .vertical).lineLimit(2...5)
                }
                if let error { Text(error).foregroundStyle(.red).font(.caption) }
            }
            .navigationTitle(isEdit ? "Modifier client" : "Nouveau client")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEdit ? "Mettre à jour" : "Enregistrer") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true; error = nil
        let payload = ClientPayload(
            name: name,
            email: email.isEmpty ? nil : email,
            phone: phone.isEmpty ? nil : phone,
            address: address.isEmpty ? nil : address,
            city: city.isEmpty ? nil : city,
            country: country.isEmpty ? nil : country,
            notes: notes.isEmpty ? nil : notes,
            status: status)
        do {
            if let existing {
                _ = try await APIClient.shared.updateClient(existing.id, payload)
            } else {
                _ = try await APIClient.shared.createClient(payload)
            }
            await onSaved()
            dismiss()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        saving = false
    }
}

// MARK: - Facturation (Invoices)

struct BillingView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var state = Loadable<[Invoice]>()
    @State private var statusFilter = "all"
    @State private var search = ""
    @State private var showNew = false

    private let filters = [
        ("all", "Toutes"), ("draft", "Brouillon"), ("sent", "Envoyées"),
        ("paid", "Payées"), ("overdue", "En retard")
    ]

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune facture", emptyIcon: "doc.text",
                  reload: load) { invoices in
            let displayed = filtered(invoices)
            List {
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            kpiChip("Total", fcfa(invoices.reduce(0) { $0 + $1.total_amount }), "doc.richtext", theme.primary)
                            kpiChip("Payées", fcfa(invoices.filter(\.isPaid).reduce(0) { $0 + $1.total_amount }), "checkmark.seal", .green)
                            kpiChip("En attente", fcfa(invoices.filter { $0.status == "sent" }.reduce(0) { $0 + $1.total_amount }), "clock", .orange)
                            kpiChip("En retard", fcfa(invoices.filter { $0.status == "overdue" }.reduce(0) { $0 + $1.total_amount }), "exclamationmark.circle", .red)
                        }
                        .padding(.horizontal, 2)
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(filters, id: \.0) { key, label in
                                Button {
                                    withAnimation(.easeInOut(duration: 0.18)) { statusFilter = key }
                                } label: {
                                    Text(label)
                                        .font(.caption.bold())
                                        .padding(.horizontal, 12).padding(.vertical, 6)
                                        .background(statusFilter == key ? theme.primary : theme.primary.opacity(0.1))
                                        .foregroundStyle(statusFilter == key ? .white : theme.primary)
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 2).padding(.vertical, 2)
                    }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)

                ForEach(displayed) { inv in
                    NavigationLink {
                        InvoiceDetailView(invoice: inv, onChanged: load)
                    } label: {
                        InvoiceRow(invoice: inv)
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .searchable(text: $search, prompt: "Numéro, client…")
        .navigationTitle("Facturation")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showNew = true } label: { Image(systemName: "plus") }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) {
            InvoiceFormView(onSaved: { await load() })
        }
    }

    @ViewBuilder private func kpiChip(_ title: String, _ value: String, _ icon: String, _ color: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.caption).foregroundStyle(color)
            VStack(alignment: .leading, spacing: 1) {
                Text(value).font(.caption.bold()).foregroundStyle(.primary)
                Text(title).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func filtered(_ all: [Invoice]) -> [Invoice] {
        all.filter { inv in
            let matchStatus = statusFilter == "all" || inv.status == statusFilter
            let matchSearch = search.isEmpty ||
                inv.number.localizedCaseInsensitiveContains(search) ||
                inv.customer_name.localizedCaseInsensitiveContains(search)
            return matchStatus && matchSearch
        }
    }

    private func load() async { await state.load { try await APIClient.shared.invoices() } }
}

private struct InvoiceRow: View {
    let invoice: Invoice
    @EnvironmentObject private var theme: CompanyTheme

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text(invoice.number).font(.subheadline.bold())
                Text(invoice.customer_name).font(.caption).foregroundStyle(.secondary)
                if let due = invoice.due_date {
                    Text("Échéance : \(shortDate(due))").font(.caption2).foregroundStyle(.secondary)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text(fcfa(invoice.total_amount)).font(.subheadline.bold())
                StatusPill(text: invStatusLabel(invoice.status), colorName: invoice.statusColorName)
            }
        }
        .padding(.vertical, 3)
    }
}

private func invStatusLabel(_ s: String) -> String {
    switch s {
    case "paid": return "Payée"
    case "sent": return "Envoyée"
    case "draft": return "Brouillon"
    case "overdue": return "En retard"
    default: return s.capitalized
    }
}

struct InvoiceDetailView: View {
    let invoice: Invoice
    let onChanged: () async -> Void
    @EnvironmentObject private var theme: CompanyTheme
    @Environment(\.dismiss) private var dismiss
    @State private var paying = false
    @State private var exporting = false
    @State private var exportURL: URL?
    @State private var relancing = false

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                VStack(spacing: 8) {
                    Text(invoice.number).font(.title2.bold())
                    StatusPill(text: invStatusLabel(invoice.status), colorName: invoice.statusColorName)
                    Text(invoice.customer_name).font(.subheadline).foregroundStyle(.secondary)
                    if let due = invoice.due_date {
                        HStack(spacing: 4) {
                            Image(systemName: "calendar").font(.caption)
                            Text("Échéance : \(shortDate(due))").font(.caption)
                        }
                        .foregroundStyle(.secondary)
                    }
                }
                .padding(.top)
                .frame(maxWidth: .infinity)

                GlassCard(padding: 0, cornerRadius: 18) {
                    VStack(spacing: 0) {
                        ForEach(invoice.lines) { line in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(line.description).font(.subheadline)
                                    Text("\(line.quantity) × \(fcfa(line.unit_price))")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(fcfa(line.total)).font(.subheadline.bold())
                            }
                            .padding(.horizontal, 16).padding(.vertical, 12)
                            Divider().padding(.leading, 16)
                        }
                        totalRow("Sous-total (HT)", invoice.subtotal)
                        if invoice.tax_amount > 0 {
                            totalRow("TVA", invoice.tax_amount)
                        }
                        totalRow("Total (TTC)", invoice.total_amount, bold: true)
                    }
                }

                if !invoice.isPaid {
                    KomptaButton(label: "Marquer comme payée", icon: "checkmark.circle.fill", isLoading: paying) {
                        await pay()
                    }
                    if invoice.status == "sent" || invoice.status == "overdue" {
                        KomptaButton(label: relancing ? "Relance envoyée…" : "Envoyer une relance",
                                     icon: "bell.badge.fill", style: .outlined, isLoading: relancing) {
                            await relance()
                        }
                    }
                }

                if let exportURL {
                    VStack(spacing: 10) {
                        ShareLink(item: exportURL) {
                            Label("Télécharger / partager le PDF", systemImage: "square.and.arrow.up")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(theme.primary.opacity(0.12), in: RoundedRectangle(cornerRadius: theme.buttonRadius))
                                .foregroundStyle(theme.primary)
                        }
                        .buttonStyle(.plain)
                        #if os(macOS)
                        Button { printPDF(exportURL) } label: {
                            Label("Imprimer", systemImage: "printer.fill")
                                .frame(maxWidth: .infinity).padding(.vertical, 12)
                                .background(.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: theme.buttonRadius))
                        }
                        .buttonStyle(.plain)
                        #endif
                    }
                }
            }.padding()
        }
        .navigationTitle("Facture")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { Task { await exportInvoice() } } label: {
                    Image(systemName: exporting ? "hourglass" : "square.and.arrow.down")
                }
                .disabled(exporting)
            }
        }
    }

    private func exportInvoice() async {
        exporting = true
        // Real A4 PDF (downloadable + printable). Falls back to HTML if rendering fails.
        if let pdf = await exportInvoicePDF(invoiceId: invoice.id, number: invoice.number) {
            exportURL = pdf
        } else if let data = try? await APIClient.shared.invoiceExportHTML(invoice.id) {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(invoice.number).html")
            try? data.write(to: url, options: .atomic)
            exportURL = url
        }
        exporting = false
    }

    #if os(macOS)
    private func printPDF(_ url: URL) {
        // Open in Preview where the user gets the full print dialog.
        NSWorkspace.shared.open(url)
    }
    #endif

    private func relance() async {
        relancing = true
        try? await APIClient.shared.relanceInvoice(invoice.id)
        await onChanged()
        relancing = false
    }

    private func totalRow(_ label: String, _ value: Double, bold: Bool = false) -> some View {
        HStack {
            Text(label).font(bold ? .subheadline.bold() : .subheadline).foregroundStyle(bold ? .primary : .secondary)
            Spacer()
            Text(fcfa(value)).font(bold ? .headline : .subheadline).foregroundStyle(bold ? theme.primary : .primary)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
    }

    private func pay() async {
        paying = true
        do {
            _ = try await APIClient.shared.payInvoice(invoice.id, InvoicePaymentPayload())
            await onChanged()
            dismiss()
        } catch { }
        paying = false
    }
}

struct InvoiceFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: CompanyTheme
    @State private var customerName = ""
    @State private var customerEmail = ""
    @State private var dueDate = ""
    @State private var saveAsDraft = false
    @State private var lines: [InvoiceLinePayload] = [InvoiceLinePayload(description: "", quantity: 1, unit_price: 0, tax_rate: 18)]
    @State private var saving = false
    @State private var errorMsg: String?

    var subtotal: Double { lines.reduce(0) { $0 + Double($1.quantity) * $1.unit_price } }
    var tax: Double { lines.reduce(0) { $0 + Double($1.quantity) * $1.unit_price * $1.tax_rate / 100 } }
    var total: Double { subtotal + tax }

    var body: some View {
        NavigationStack {
            Form {
                Section("Client") {
                    TextField("Nom du client *", text: $customerName)
                    TextField("E-mail (optionnel)", text: $customerEmail)
                        #if os(iOS)
                        .keyboardType(.emailAddress)
                        #endif
                    TextField("Échéance (YYYY-MM-DD)", text: $dueDate)
                }
                Section {
                    Toggle("Enregistrer comme brouillon", isOn: $saveAsDraft)
                }
                Section("Lignes de facturation") {
                    ForEach(lines.indices, id: \.self) { i in
                        VStack(alignment: .leading, spacing: 6) {
                            TextField("Description", text: $lines[i].description)
                                .font(.subheadline)
                            HStack(spacing: 10) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Qté").font(.caption2).foregroundStyle(.secondary)
                                    TextField("1", value: $lines[i].quantity, format: .number)
                                        #if os(iOS)
                                        .keyboardType(.numberPad)
                                        #endif
                                        .frame(width: 50)
                                }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("PU (FCFA)").font(.caption2).foregroundStyle(.secondary)
                                    TextField("0", value: $lines[i].unit_price, format: .number)
                                        #if os(iOS)
                                        .keyboardType(.decimalPad)
                                        #endif
                                        .frame(maxWidth: .infinity)
                                }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("TVA %").font(.caption2).foregroundStyle(.secondary)
                                    TextField("18", value: $lines[i].tax_rate, format: .number)
                                        #if os(iOS)
                                        .keyboardType(.decimalPad)
                                        #endif
                                        .frame(width: 50)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .onDelete { lines.remove(atOffsets: $0) }
                    Button {
                        lines.append(InvoiceLinePayload(description: "", quantity: 1, unit_price: 0, tax_rate: 18))
                    } label: {
                        Label("Ajouter une ligne", systemImage: "plus.circle")
                    }
                }
                Section("Récapitulatif") {
                    HStack { Text("Sous-total HT"); Spacer(); Text(fcfa(subtotal)) }
                    HStack { Text("TVA"); Spacer(); Text(fcfa(tax)) }
                    HStack { Text("Total TTC").bold(); Spacer(); Text(fcfa(total)).bold().foregroundStyle(theme.primary) }
                }
                if let err = errorMsg {
                    Section { Text(err).foregroundStyle(.red).font(.caption) }
                }
            }
            .navigationTitle("Nouvelle facture")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Créer") { Task { await save() } }
                        .disabled(customerName.isEmpty || lines.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true; errorMsg = nil
        let validLines = lines.filter { !$0.description.isEmpty }
        guard !validLines.isEmpty else {
            errorMsg = "Ajoutez au moins une ligne avec une description."
            saving = false; return
        }
        let payload = InvoicePayload(
            customer_name: customerName,
            customer_email: customerEmail.isEmpty ? nil : customerEmail,
            status: saveAsDraft ? "draft" : "sent",
            due_date: dueDate.isEmpty ? nil : dueDate,
            lines: validLines
        )
        do {
            _ = try await APIClient.shared.createInvoice(payload)
            await onSaved()
            dismiss()
        } catch {
            errorMsg = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        saving = false
    }
}

// MARK: - Inventaire

// NOTE: InventoryView now lives in Views/Modules/InventoryView.swift
// (catalogue CRUD + stock movements + low-stock alerts + Limule AI report).

// MARK: - Transactions

private let txCategories: [(key: String, label: String)] = [
    ("ventes", "Ventes"),
    ("clients_reglements", "Règlements clients"),
    ("achats_fournisseurs", "Achats fournisseurs"),
    ("salaires_charges", "Salaires & charges"),
    ("loyer_charges_fixes", "Loyer & charges fixes"),
    ("banque_frais", "Frais bancaires"),
    ("impots_taxes", "Impôts & taxes"),
    ("investissements", "Investissements"),
    ("remboursements", "Remboursements"),
    ("transferts_internes", "Transferts internes"),
    ("emprunts_remboursements", "Emprunts"),
    ("tresorerie", "Trésorerie"),
    ("divers_entrees", "Divers entrées"),
    ("divers_sorties", "Divers sorties"),
    ("divers", "Divers"),
]

private func txCatLabel(_ key: String) -> String {
    txCategories.first { $0.key == key }?.label ?? key.capitalized
}

// MARK: - Monthly cashflow chart

private struct MonthlyFlowChart: View {
    let transactions: [BankTransaction]
    @EnvironmentObject private var theme: CompanyTheme

    private struct Bar: Identifiable {
        let id = UUID()
        let label: String; let sortKey: String; let type: String; let kValue: Double
    }

    private var data: [Bar] {
        let labelFmt = DateFormatter(); labelFmt.dateFormat = "MMM"; labelFmt.locale = Locale(identifier: "fr_FR")
        var byMonth: [String: (c: Double, d: Double)] = [:]
        for t in transactions {
            let ym = String(t.date.prefix(7))
            var e = byMonth[ym] ?? (0, 0)
            if t.isInflow { e.c += abs(t.amount) } else { e.d += abs(t.amount) }
            byMonth[ym] = e
        }
        return byMonth
            .sorted { $0.key < $1.key }
            .suffix(6)
            .flatMap { ym, v -> [Bar] in
                let parts = ym.split(separator: "-")
                var label = ym
                if parts.count == 2, let y = Int(parts[0]), let m = Int(parts[1]) {
                    var comp = DateComponents(); comp.year = y; comp.month = m
                    if let d = Calendar.current.date(from: comp) { label = labelFmt.string(from: d).capitalized }
                }
                var bars: [Bar] = []
                if v.c > 0 { bars.append(Bar(label: label, sortKey: ym, type: "Entrées", kValue: v.c / 1_000)) }
                if v.d > 0 { bars.append(Bar(label: label, sortKey: ym, type: "Sorties", kValue: v.d / 1_000)) }
                return bars
            }
    }

    var body: some View {
        if data.isEmpty { EmptyView() } else {
            VStack(alignment: .leading, spacing: 8) {
                Text("Flux mensuel").font(.caption.bold()).foregroundStyle(.secondary)
                Chart(data) { bar in
                    BarMark(x: .value("Mois", bar.label), y: .value("K FCFA", bar.kValue), width: .fixed(22))
                        .foregroundStyle(by: .value("Type", bar.type))
                        .position(by: .value("Type", bar.type), span: .ratio(0.6))
                        .cornerRadius(4)
                }
                .chartForegroundStyleScale(["Entrées": Color.green, "Sorties": Color.red])
                .chartLegend(position: .topTrailing)
                .chartYAxisLabel("K FCFA", alignment: .trailing)
                .frame(height: 170)
            }
        }
    }
}

struct TransactionsView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var txns = Loadable<[BankTransaction]>()
    @StateObject private var statsState = Loadable<TransactionStats>()
    @State private var showNew = false
    @State private var editTxn: BankTransaction?
    @State private var typeFilter = "all"
    @State private var search = ""

    private let typeFilters = [("all", "Tout"), ("credit", "Entrées"), ("debit", "Sorties")]

    private var displayed: [BankTransaction] {
        guard let items = txns.value else { return [] }
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return items.filter { t in
            let matchType: Bool
            switch typeFilter {
            case "credit": matchType = t.isInflow
            case "debit":  matchType = !t.isInflow
            default:       matchType = true
            }
            let matchQ = q.isEmpty
                || t.label.lowercased().contains(q)
                || (t.counterpart ?? "").lowercased().contains(q)
                || (t.reference ?? "").lowercased().contains(q)
            return matchType && matchQ
        }
    }

    private var topCategories: [(key: String, value: Double)] {
        (statsState.value?.by_category ?? [:])
            .sorted { $0.value > $1.value }
            .prefix(6)
            .map { $0 }
    }

    var body: some View {
        List {
            if let s = statsState.value {
                Section {
                    HStack(spacing: 12) {
                        MetricCard(title: "Entrées", value: fcfa(s.total_credits), icon: "arrow.down.left", color: .green)
                        MetricCard(title: "Sorties", value: fcfa(s.total_debits), icon: "arrow.up.right", color: .red)
                    }
                    HStack(spacing: 12) {
                        MetricCard(title: "Solde", value: fcfa(s.balance), icon: "equal.circle",
                                   color: s.balance >= 0 ? .green : .red)
                        MetricCard(title: "Opérations", value: "\(s.count)", icon: "list.bullet", color: .blue)
                    }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }

            if let items = txns.value, !items.isEmpty {
                Section {
                    MonthlyFlowChart(transactions: items)
                        .padding(.vertical, 8)
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                .listRowBackground(Color.clear)
            }

            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(typeFilters, id: \.0) { key, lbl in
                            Button { typeFilter = key } label: {
                                Text(lbl)
                                    .font(.caption.bold())
                                    .padding(.horizontal, 12).padding(.vertical, 6)
                                    .background(typeFilter == key ? theme.primary : theme.primary.opacity(0.1))
                                    .foregroundStyle(typeFilter == key ? .white : theme.primary)
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 2)
                }
            } header: {
                Text("Mouvements")
            }
            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
            .listRowBackground(Color.clear)

            Section {
                if txns.value == nil {
                    ForEach(0..<5, id: \.self) { _ in ShimmerBox(height: 40, cornerRadius: 8) }
                } else if displayed.isEmpty {
                    ContentUnavailableView("Aucun mouvement", systemImage: "arrow.left.arrow.right")
                } else {
                    ForEach(displayed) { t in
                        TransactionRow(txn: t)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    Task { try? await APIClient.shared.deleteTransaction(t.id); await load() }
                                } label: { Label("Supprimer", systemImage: "trash") }
                            }
                            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                Button { editTxn = t } label: {
                                    Label("Modifier", systemImage: "pencil")
                                }
                                .tint(.blue)
                            }
                    }
                }
            }

            if !topCategories.isEmpty {
                Section("Par catégorie") {
                    ForEach(topCategories, id: \.key) { pair in
                        HStack(spacing: 10) {
                            Circle().fill(Color.teal.opacity(0.7)).frame(width: 8, height: 8)
                            Text(txCatLabel(pair.key)).font(.subheadline)
                            Spacer()
                            Text(fcfa(pair.value)).font(.subheadline.bold()).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
        .navigationTitle("Transactions")
        .searchable(text: $search, prompt: "Rechercher…")
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { TransactionFormView { await load() } }
        .sheet(item: $editTxn) { t in TransactionEditSheet(txn: t) { await load() } }
    }

    private func load() async {
        async let a: Void = txns.load { try await APIClient.shared.transactions() }
        async let b: Void = statsState.load { try await APIClient.shared.transactionStats() }
        _ = await (a, b)
    }
}

private struct TransactionRow: View {
    let txn: BankTransaction
    var body: some View {
        HStack {
            Image(systemName: txn.isInflow ? "arrow.down.left.circle.fill" : "arrow.up.right.circle.fill")
                .foregroundStyle(txn.isInflow ? .green : .red)
            VStack(alignment: .leading, spacing: 2) {
                Text(txn.label).font(.subheadline).lineLimit(1)
                HStack(spacing: 4) {
                    Text(shortDate(txn.date)).font(.caption).foregroundStyle(.secondary)
                    if !txn.category.isEmpty {
                        Text("·").font(.caption).foregroundStyle(.secondary)
                        Text(txCatLabel(txn.category)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            }
            Spacer()
            Text(fcfa(abs(txn.amount)))
                .font(.subheadline.bold())
                .foregroundStyle(txn.isInflow ? .green : .red)
        }
        .padding(.vertical, 2)
    }
}

struct TransactionFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var label = ""
    @State private var category = ""
    @State private var counterpart = ""
    @State private var amount = ""
    @State private var isInflow = true
    @State private var date = Date()
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Mouvement") {
                    TextField("Libellé *", text: $label)
                    Picker("Sens", selection: $isInflow) {
                        Text("Entrée").tag(true); Text("Sortie").tag(false)
                    }.pickerStyle(.segmented)
                    TextField("Montant (FCFA) *", text: $amount)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                }
                Section("Détails") {
                    Picker("Catégorie", selection: $category) {
                        Text("—").tag("")
                        ForEach(txCategories, id: \.key) { c in Text(c.label).tag(c.key) }
                    }
                    TextField("Contrepartie", text: $counterpart)
                }
            }
            .navigationTitle("Nouvelle transaction")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }
                        .disabled(label.isEmpty || Double(amount) == nil || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        let val = Double(amount) ?? 0
        let signed = isInflow ? val : -val
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        let payload = BankTransactionPayload(
            date: f.string(from: date), label: label, amount: signed,
            debit: isInflow ? nil : val, credit: isInflow ? val : nil,
            category: category, counterpart: counterpart.isEmpty ? nil : counterpart)
        do { _ = try await APIClient.shared.createTransaction(payload); await onSaved(); dismiss() }
        catch { }
        saving = false
    }
}

struct TransactionEditSheet: View {
    let txn: BankTransaction
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var label: String
    @State private var amount: String
    @State private var isInflow: Bool
    @State private var date: Date
    @State private var category: String
    @State private var counterpart: String
    @State private var notes: String
    @State private var saving = false

    init(txn: BankTransaction, onSaved: @escaping () async -> Void) {
        self.txn = txn; self.onSaved = onSaved
        _label = State(initialValue: txn.label)
        _amount = State(initialValue: String(abs(txn.amount)))
        _isInflow = State(initialValue: txn.isInflow)
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        _date = State(initialValue: f.date(from: txn.date) ?? Date())
        _category = State(initialValue: txn.category)
        _counterpart = State(initialValue: txn.counterpart ?? "")
        _notes = State(initialValue: txn.notes ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Mouvement") {
                    TextField("Libellé", text: $label)
                    Picker("Sens", selection: $isInflow) {
                        Text("Entrée").tag(true); Text("Sortie").tag(false)
                    }.pickerStyle(.segmented)
                    TextField("Montant (FCFA)", text: $amount)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                }
                Section("Détails") {
                    Picker("Catégorie", selection: $category) {
                        Text("—").tag("")
                        ForEach(txCategories, id: \.key) { c in Text(c.label).tag(c.key) }
                    }
                    TextField("Contrepartie", text: $counterpart)
                    TextField("Notes", text: $notes)
                }
            }
            .navigationTitle("Modifier")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }
                        .disabled(label.isEmpty || Double(amount) == nil || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        let val = Double(amount) ?? 0
        let signed = isInflow ? val : -val
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        let payload = BankTransactionPayload(
            date: f.string(from: date), label: label, amount: signed,
            debit: isInflow ? nil : val, credit: isInflow ? val : nil,
            category: category,
            counterpart: counterpart.isEmpty ? nil : counterpart,
            notes: notes.isEmpty ? nil : notes)
        do { _ = try await APIClient.shared.updateTransaction(txn.id, payload); await onSaved(); dismiss() }
        catch { }
        saving = false
    }
}

// MARK: - Shared status pill

struct StatusPill: View {
    let text: String
    let colorName: String
    private var color: Color {
        switch colorName {
        case "green": return .green; case "red": return .red
        case "blue": return .blue; case "orange": return .orange
        default: return .gray
        }
    }
    var body: some View {
        Text(text.capitalized)
            .font(.caption2.bold())
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}
