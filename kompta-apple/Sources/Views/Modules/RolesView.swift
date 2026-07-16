import SwiftUI

// ============================================================================
//  Custom roles management — create roles with per-module permission limits.
//  scope: "company" (internal staff), "admin" (platform staff), "group".
// ============================================================================

struct RolesManagementView: View {
    let scope: String
    var title: String = "Rôles & accès"
    var groupId: Int? = nil

    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var state = Loadable<[CustomRole]>()
    @State private var permissions: [RolePermission] = []
    @State private var editing: CustomRole?
    @State private var showNew = false
    @State private var showStaff = false
    @State private var showAssign = false

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun rôle personnalisé",
                  emptyIcon: "person.badge.shield.checkmark", reload: load) { roles in
            List {
                Section {
                    Text("Créez des rôles avec un accès limité à certains modules, puis attribuez-les à vos utilisateurs.")
                        .font(.caption).foregroundStyle(.secondary)
                    if scope == "company" {
                        Button { showAssign = true } label: {
                            Label("Attribuer un rôle à un membre", systemImage: "person.badge.shield.checkmark")
                        }
                        .disabled((state.value?.isEmpty ?? true))
                    }
                }
                ForEach(roles) { r in
                    Button { editing = r } label: { roleRow(r) }.buttonStyle(.plain)
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                Task { try? await APIClient.shared.deleteRole(r.id); await load() }
                            } label: { Label("Supprimer", systemImage: "trash") }
                        }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle(title)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            if scope == "admin" {
                ToolbarItem(placement: .primaryAction) {
                    Button { showStaff = true } label: { Label("Créer un staff", systemImage: "person.fill.badge.plus") }
                        .disabled((state.value?.isEmpty ?? true))
                }
            }
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus").accessibilityLabel("Nouveau") } }
        }
        .task { await loadAll() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { RoleFormView(scope: scope, role: nil, permissions: permissions, groupId: groupId) { await load() } }
        .sheet(item: $editing) { r in RoleFormView(scope: scope, role: r, permissions: permissions, groupId: groupId) { await load() } }
        .sheet(isPresented: $showStaff) { StaffCreateView(roles: state.value ?? []) { await load() } }
        .sheet(isPresented: $showAssign) { MembersAccessView(roles: state.value ?? []) { await load() } }
    }

    private func roleRow(_ r: CustomRole) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill((Color(hex: r.color) ?? theme.primary).opacity(0.18)).frame(width: 40, height: 40)
                Image(systemName: "shield.lefthalf.filled").foregroundStyle(Color(hex: r.color) ?? theme.primary)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(r.name).font(.subheadline.bold())
                if !r.description.isEmpty { Text(r.description).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                Text("\(r.permissions.count) accès · \(r.member_count) membre(s)")
                    .font(.caption2).foregroundStyle(.tertiary)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
        }
        .padding(.vertical, 3)
    }

    private func loadAll() async {
        permissions = (try? await APIClient.shared.rolePermissions(scope: scope)) ?? []
        await load()
    }
    private func load() async { await state.load { try await APIClient.shared.roles(scope: scope, groupId: groupId) } }
}

// MARK: - Attribution d'un rôle personnalisé aux membres de l'entreprise

struct MembersAccessView: View {
    let roles: [CustomRole]
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var state = Loadable<[CompanyUserRow]>()
    @State private var working: Int?
    @State private var toast: String?

    var body: some View {
        NavigationStack {
            AsyncList(state: state, emptyTitle: "Aucun membre", emptyIcon: "person.2", reload: load) { users in
                List {
                    if let toast {
                        Section { Text(toast).font(.caption.bold()).foregroundStyle(theme.primary) }
                    }
                    Section {
                        Text("Choisissez un rôle personnalisé pour chaque membre. Le rôle limite les modules visibles dans l'app.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    ForEach(users) { u in row(u) }
                }
                #if os(iOS)
                .listStyle(.insetGrouped)
                #endif
            }
            .navigationTitle("Membres & accès")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } } }
            .task { await load() }
        }
    }

    private func row(_ u: CompanyUserRow) -> some View {
        HStack(spacing: 12) {
            AvatarView(initials: u.initials, size: 38, color: theme.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text(u.full_name).font(.subheadline.bold())
                Text(u.email).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            if working == u.id {
                ProgressView()
            } else {
                Picker("", selection: Binding(
                    get: { u.custom_role_id ?? -1 },
                    set: { newValue in Task { await assign(u, roleId: newValue == -1 ? nil : newValue) } }
                )) {
                    Text("Rôle de base").tag(-1)
                    ForEach(roles) { r in Text(r.name).tag(r.id) }
                }
                .labelsHidden()
                .pickerStyle(.menu)
                .tint(theme.primary)
            }
        }
        .padding(.vertical, 2)
    }

    private func load() async { await state.load { try await APIClient.shared.companyUsers() } }

    private func assign(_ u: CompanyUserRow, roleId: Int?) async {
        working = u.id
        defer { working = nil }
        do {
            try await APIClient.shared.assignCustomRole(u.id, roleId: roleId)
            let name = roleId.flatMap { id in roles.first(where: { $0.id == id })?.name } ?? "Rôle de base"
            withAnimation { toast = "« \(u.full_name) » → \(name)" }
            await load()
            await onSaved()
        } catch {
            withAnimation { toast = error.localizedDescription }
        }
    }
}

struct RoleFormView: View {
    let scope: String
    let role: CustomRole?
    let permissions: [RolePermission]
    var groupId: Int? = nil
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: CompanyTheme
    @State private var name: String
    @State private var description: String
    @State private var color: String
    @State private var selected: Set<String>
    @State private var saving = false
    @State private var errorMsg: String?

    private let palette = ["#6366f1", "#059669", "#f59e0b", "#ef4444", "#0ea5e9", "#a855f7"]

    init(scope: String, role: CustomRole?, permissions: [RolePermission], groupId: Int? = nil, onSaved: @escaping () async -> Void) {
        self.scope = scope; self.role = role; self.permissions = permissions; self.groupId = groupId; self.onSaved = onSaved
        _name = State(initialValue: role?.name ?? "")
        _description = State(initialValue: role?.description ?? "")
        _color = State(initialValue: role?.color ?? "#6366f1")
        _selected = State(initialValue: Set(role?.permissions ?? []))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Rôle") {
                    TextField("Nom du rôle *", text: $name)
                    TextField("Description", text: $description, axis: .vertical).lineLimit(1...3)
                    HStack(spacing: 10) {
                        ForEach(palette, id: \.self) { c in
                            Circle().fill(Color(hex: c) ?? .gray).frame(width: 26, height: 26)
                                .overlay(Circle().strokeBorder(.primary, lineWidth: color == c ? 2 : 0))
                                .onTapGesture { color = c }
                        }
                    }
                }
                Section {
                    ForEach(permissions) { p in
                        Toggle(isOn: Binding(
                            get: { selected.contains(p.key) },
                            set: { on in if on { selected.insert(p.key) } else { selected.remove(p.key) } }
                        )) { Text(p.label) }
                    }
                } header: {
                    HStack {
                        Text("Accès (\(selected.count)/\(permissions.count))")
                        Spacer()
                        Button(selected.count == permissions.count ? "Aucun" : "Tout") {
                            selected = selected.count == permissions.count ? [] : Set(permissions.map(\.key))
                        }.font(.caption)
                    }
                }
                if let errorMsg { Section { Text(errorMsg).foregroundStyle(.red).font(.caption) } }
            }
            .navigationTitle(role == nil ? "Nouveau rôle" : "Modifier le rôle")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "…" : "Enregistrer") { Task { await save() } }.disabled(name.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true; errorMsg = nil
        let payload = RolePayload(name: name, description: description, scope: scope,
                                  permissions: Array(selected), color: color, group_id: groupId)
        do {
            if let role { _ = try await APIClient.shared.updateRole(role.id, payload) }
            else { _ = try await APIClient.shared.createRole(payload) }
            await onSaved(); dismiss()
        } catch {
            errorMsg = (error as? LocalizedError)?.errorDescription ?? "Échec de l'enregistrement"
        }
        saving = false
    }
}

// ============================================================================
//  Staff creation — admin provisions a platform staff member with a custom
//  admin-scoped role + a generated access key (shown once).
// ============================================================================

struct StaffCreateView: View {
    let roles: [CustomRole]
    let onCreated: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: CompanyTheme
    @State private var fullName = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var address = ""
    @State private var department = ""
    @State private var roleId: Int?
    @State private var saving = false
    @State private var errorMsg: String?
    @State private var result: StaffCreatedResult?

    var body: some View {
        NavigationStack {
            Group {
                if let result {
                    credentials(result)
                } else {
                    form
                }
            }
            .navigationTitle(result == nil ? "Créer un staff" : "Accès généré")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                if result == nil {
                    ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(saving ? "…" : "Créer") { Task { await create() } }
                            .disabled(fullName.isEmpty || email.isEmpty || roleId == nil || saving)
                    }
                } else {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Terminé") { Task { await onCreated(); dismiss() } }
                    }
                }
            }
        }
    }

    private var form: some View {
        Form {
            Section("Identité") {
                TextField("Nom complet *", text: $fullName)
                TextField("E-mail *", text: $email)
                    #if os(iOS)
                    .keyboardType(.emailAddress).textInputAutocapitalization(.never)
                    #endif
                TextField("Téléphone", text: $phone)
                    #if os(iOS)
                    .keyboardType(.phonePad)
                    #endif
                TextField("Adresse", text: $address, axis: .vertical).lineLimit(1...3)
                TextField("Département", text: $department)
            }
            Section {
                if roles.isEmpty {
                    Text("Créez d'abord un rôle d'administration pour pouvoir y rattacher un staff.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                ForEach(roles) { r in
                    Button { roleId = r.id } label: {
                        HStack {
                            Image(systemName: "shield.lefthalf.filled")
                                .foregroundStyle(Color(hex: r.color) ?? theme.primary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(r.name).foregroundStyle(.primary)
                                Text("\(r.permissions.count) accès").font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if roleId == r.id { Image(systemName: "checkmark.circle.fill").foregroundStyle(theme.primary) }
                        }
                    }.buttonStyle(.plain)
                }
            } header: { Text("Rôle d'administration *") }
            if let errorMsg { Section { Text(errorMsg).foregroundStyle(.red).font(.caption) } }
        }
    }

    private func credentials(_ r: StaffCreatedResult) -> some View {
        Form {
            Section {
                Label("Compte staff créé", systemImage: "checkmark.seal.fill")
                    .foregroundStyle(.green).font(.headline)
                Text("Rôle : \(r.role_name)").font(.subheadline)
                Text("Transmettez ces identifiants au staff. Le mot de passe temporaire ne sera plus affiché ensuite — il devra le changer à la première connexion.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section("Identifiants de connexion") {
                credentialRow("Identifiant", r.login_identifier)
                credentialRow("Mot de passe temporaire", r.temporary_password)
            }
        }
    }

    private func credentialRow(_ label: String, _ value: String) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.caption).foregroundStyle(.secondary)
                Text(value).font(.system(.body, design: .monospaced)).textSelection(.enabled)
            }
            Spacer()
            Button {
                #if os(iOS)
                UIPasteboard.general.string = value
                #elseif os(macOS)
                NSPasteboard.general.clearContents(); NSPasteboard.general.setString(value, forType: .string)
                #endif
            } label: { Image(systemName: "doc.on.doc").accessibilityLabel("Copier") }
            .buttonStyle(.borderless)
        }
    }

    private func create() async {
        saving = true; errorMsg = nil
        guard let roleId else { saving = false; return }
        let payload = StaffCreatePayload(full_name: fullName, email: email, phone: phone,
                                         address: address, department: department, custom_role_id: roleId)
        do { result = try await APIClient.shared.createStaff(payload) }
        catch { errorMsg = (error as? LocalizedError)?.errorDescription ?? "Échec de la création" }
        saving = false
    }
}
