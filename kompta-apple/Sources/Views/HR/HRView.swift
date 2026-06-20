import SwiftUI

struct HRView: View {
    @EnvironmentObject private var theme: CompanyTheme

    @State private var employees: [Employee] = []
    @State private var isLoading = true
    @State private var search    = ""
    @State private var selected: Employee?
    @State private var showNew   = false

    var filtered: [Employee] {
        search.isEmpty ? employees
            : employees.filter {
                $0.full_name.localizedCaseInsensitiveContains(search) ||
                $0.department.localizedCaseInsensitiveContains(search) ||
                ($0.position ?? "").localizedCaseInsensitiveContains(search)
            }
    }

    var body: some View {
        Group {
            if isLoading {
                loadingSkeleton
            } else if employees.isEmpty {
                ContentUnavailableView("Aucun employé", systemImage: "person.slash.fill")
            } else {
                employeeList
            }
        }
        .searchable(text: $search, prompt: "Nom, poste ou service")
        .navigationTitle("Ressources humaines")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.large)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
            ToolbarItem(placement: .secondaryAction) {
                CsvImportButton(title: "Importer CSV", importer: { d, n in try await APIClient.shared.importEmployeesCsv(d, fileName: n) }, onDone: { await load() })
            }
        }
        .task    { await load() }
        .refreshable { await load() }
        .sheet(item: $selected) { EmployeeDetailView(employee: $0) }
        .sheet(isPresented: $showNew) { EmployeeFormView { await load() } }
    }

    // MARK: - List

    private var employeeList: some View {
        List(filtered) { emp in
            Button { selected = emp } label: {
                HStack(spacing: 14) {
                    AvatarView(initials: emp.initials, size: 44, color: theme.primary)

                    VStack(alignment: .leading, spacing: 3) {
                        Text(emp.full_name).font(.subheadline.bold())
                        if let pos = emp.position {
                            Text(pos).font(.caption).foregroundStyle(.secondary)
                        }
                        if !emp.department.isEmpty {
                            Text(emp.department).font(.caption2).foregroundStyle(theme.primary.opacity(0.8))
                        }
                    }
                    Spacer()
                    Circle()
                        .fill(emp.isActive ? Color.green : Color.orange)
                        .frame(width: 8, height: 8)
                }
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
    }

    // MARK: - Loading skeleton

    private var loadingSkeleton: some View {
        List(0..<8, id: \.self) { _ in
            HStack(spacing: 14) {
                ShimmerBox(height: 44, cornerRadius: 22).frame(width: 44)
                VStack(alignment: .leading, spacing: 6) {
                    ShimmerBox(height: 12, cornerRadius: 4).frame(width: 120)
                    ShimmerBox(height: 10, cornerRadius: 4).frame(width: 80)
                }
            }
            .padding(.vertical, 4)
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
    }

    private func load() async {
        isLoading = true
        employees = (try? await APIClient.shared.employees()) ?? []
        isLoading = false
    }
}

// MARK: - Employee create form

let accessRoles: [(String, String)] = [
    ("employe", "Employé"), ("manager_entreprise", "Manager"),
    ("comptable", "Comptable"), ("rh_entreprise", "RH"),
    ("responsable_pos", "Responsable caisse"), ("caissier_pos", "Caissier"),
]

struct EmployeeFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var firstName = ""
    @State private var lastName  = ""
    @State private var email     = ""
    @State private var phone     = ""
    @State private var jobTitle  = ""
    @State private var department = "Operations"
    @State private var employmentType = "CDI"
    @State private var salary    = ""
    @State private var createAccount = true
    @State private var accessRole = "employe"
    @State private var saving    = false
    @State private var errorMsg: String?
    @State private var credsBox: CredsBox?

    private let departments = ["Operations", "Finance", "RH", "Commercial", "Technique", "Direction", "Autre"]
    private let contractTypes = ["CDI", "CDD", "Stage", "Freelance", "Bénévolat"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Identité") {
                    TextField("Prénom *", text: $firstName)
                    TextField("Nom *", text: $lastName)
                }
                Section("Contact") {
                    TextField("E-mail", text: $email)
                        #if os(iOS)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        #endif
                    TextField("Téléphone", text: $phone)
                        #if os(iOS)
                        .keyboardType(.phonePad)
                        #endif
                }
                Section("Poste") {
                    TextField("Intitulé du poste *", text: $jobTitle)
                    Picker("Département", selection: $department) {
                        ForEach(departments, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Type de contrat", selection: $employmentType) {
                        ForEach(contractTypes, id: \.self) { Text($0).tag($0) }
                    }
                    TextField("Salaire net (FCFA)", text: $salary)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                }
                Section {
                    Toggle(isOn: $createAccount) {
                        Label("Créer un compte d'accès", systemImage: "key.fill")
                    }
                    if createAccount {
                        Picker("Rôle", selection: $accessRole) {
                            ForEach(accessRoles, id: \.0) { Text($0.1).tag($0.0) }
                        }
                    }
                } footer: {
                    if createAccount {
                        Text("Un identifiant de connexion et un mot de passe temporaire seront générés (affichés une seule fois).")
                    }
                }
                if let errorMsg {
                    Section { Text(errorMsg).foregroundStyle(.red).font(.caption) }
                }
            }
            .navigationTitle("Nouvel employé")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Création…" : "Créer") { Task { await save() } }
                        .disabled(firstName.isEmpty || lastName.isEmpty || jobTitle.isEmpty || saving)
                }
            }
            .sheet(item: $credsBox) { box in
                CredentialsResultView(result: box.result) {
                    Task { await onSaved() }
                    dismiss()
                }
            }
        }
    }

    private func save() async {
        saving = true; errorMsg = nil
        let sal = Double(salary.replacingOccurrences(of: ",", with: ".").replacingOccurrences(of: " ", with: "")) ?? 0
        do {
            if createAccount {
                let payload = EmployeeQuickCreatePayload(
                    first_name: firstName, last_name: lastName, job_title: jobTitle,
                    phone: phone, email: email, employment_type: employmentType,
                    department: department, salary: sal, access_role: accessRole,
                    payout_phone: phone)
                let result = try await APIClient.shared.quickCreateEmployee(payload)
                credsBox = CredsBox(result: result)
                // credentials sheet handles dismiss + reload
            } else {
                let payload = EmployeePayload(
                    first_name: firstName, last_name: lastName, email: email,
                    phone: phone, job_title: jobTitle, department: department,
                    employment_type: employmentType, salary: sal)
                _ = try await APIClient.shared.createEmployee(payload)
                await onSaved(); dismiss()
            }
        } catch {
            errorMsg = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        saving = false
    }
}

private struct CredsBox: Identifiable { let id = UUID(); let result: EmployeeProvisioningResult }

// MARK: - Credentials result (shown once)

struct CredentialsResultView: View {
    let result: EmployeeProvisioningResult
    let onClose: () -> Void
    @EnvironmentObject private var theme: CompanyTheme
    @State private var copied = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    ZStack {
                        Circle().fill(theme.primary.opacity(0.15)).frame(width: 72, height: 72)
                        Image(systemName: "key.fill").font(.system(size: 30)).foregroundStyle(theme.primary)
                    }
                    Text("Accès créé pour \(result.employee.full_name)").font(.headline).multilineTextAlignment(.center)
                    Text(result.access_note).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)

                    GlassCard(padding: 0, cornerRadius: 16) {
                        VStack(spacing: 0) {
                            credRow("Identifiant", result.login_identifier, "person.text.rectangle")
                            Divider().padding(.leading, 50)
                            credRow("Mot de passe temporaire", result.temporary_password, "lock.fill")
                        }
                    }

                    Button {
                        let text = "Identifiant : \(result.login_identifier)\nMot de passe : \(result.temporary_password)"
                        #if os(macOS)
                        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text, forType: .string)
                        #else
                        UIPasteboard.general.string = text
                        #endif
                        copied = true
                    } label: {
                        Label(copied ? "Copié" : "Copier les identifiants", systemImage: copied ? "checkmark" : "doc.on.doc")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).tint(theme.primary)

                    Label("Ce mot de passe ne sera plus affiché. L'employé devra le changer à la première connexion.",
                          systemImage: "exclamationmark.triangle.fill")
                        .font(.caption2).foregroundStyle(.orange).multilineTextAlignment(.center)
                }
                .padding()
            }
            .navigationTitle("Identifiants")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Terminé") { onClose() } } }
        }
    }

    private func credRow(_ label: String, _ value: String, _ icon: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).frame(width: 26).foregroundStyle(theme.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.caption).foregroundStyle(.secondary)
                Text(value).font(.body.monospaced().bold()).textSelection(.enabled)
            }
            Spacer()
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
    }
}

// MARK: - Employee detail sheet

struct EmployeeDetailView: View {
    let employee: Employee
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: CompanyTheme
    @State private var account: EmployeeAccountInfo?
    @State private var generating = false
    @State private var credsBox: CredsBox?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Avatar hero
                    VStack(spacing: 12) {
                        AvatarView(initials: employee.initials, size: 80, color: theme.primary)
                        Text(employee.full_name).font(.title2.bold())
                        if let pos = employee.position {
                            Text(pos).font(.subheadline).foregroundStyle(.secondary)
                        }
                        Label(
                            employee.isActive ? "Actif" : "Inactif",
                            systemImage: employee.isActive ? "checkmark.circle.fill" : "pause.circle.fill"
                        )
                        .font(.caption.bold())
                        .foregroundStyle(employee.isActive ? .green : .orange)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()

                    // Info sections
                    GlassCard(padding: 0, cornerRadius: 18) {
                        VStack(spacing: 0) {
                            if !employee.department.isEmpty {
                                infoRow("Service", value: employee.department, icon: "building.2")
                                Divider().padding(.leading, 56)
                            }
                            if !employee.phone.isEmpty {
                                infoRow("Téléphone", value: employee.phone, icon: "phone")
                                Divider().padding(.leading, 56)
                            }
                            if !employee.email.isEmpty {
                                infoRow("E-mail", value: employee.email, icon: "envelope")
                            }
                        }
                    }
                    .padding(.horizontal)

                    // Access & account
                    VStack(alignment: .leading, spacing: 10) {
                        Text("ACCÈS & COMPTE").font(.caption.bold()).foregroundStyle(.secondary)
                        GlassCard(padding: 14, cornerRadius: 16) {
                            VStack(alignment: .leading, spacing: 10) {
                                if let a = account {
                                    HStack {
                                        Label(a.login_identifier.isEmpty ? "Aucun compte" : a.login_identifier,
                                              systemImage: "person.text.rectangle")
                                            .font(.subheadline)
                                        Spacer()
                                        StatusPill(text: accountStatusLabel(a.account_status),
                                                   colorName: a.account_status == "active" ? "green" : "orange")
                                    }
                                    if a.has_active_temporary_credential {
                                        Label("Mot de passe temporaire actif", systemImage: "clock.badge.exclamationmark")
                                            .font(.caption).foregroundStyle(.orange)
                                    }
                                    Text("Rôle : \(roleLabel(a.role))").font(.caption).foregroundStyle(.secondary)
                                } else {
                                    Text("Chargement du compte…").font(.caption).foregroundStyle(.secondary)
                                }
                                Button {
                                    Task { await regenerate() }
                                } label: {
                                    HStack {
                                        if generating { ProgressView().controlSize(.small) }
                                        Label(generating ? "Génération…" : "Générer / réinitialiser l'accès",
                                              systemImage: "key.horizontal.fill")
                                    }
                                    .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.borderedProminent).tint(theme.primary)
                                .disabled(generating)
                            }
                        }
                    }
                    .padding(.horizontal)
                }
            }
            .navigationTitle("Profil")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Fermer") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    DownloadButton(title: "Contrat (PDF)", fileName: "contrat-\(employee.id).pdf",
                                   fetch: { try await APIClient.shared.employeeContractPDF(employee.id) })
                }
            }
            .task { account = try? await APIClient.shared.employeeAccountInfo(employee.id) }
            .sheet(item: $credsBox) { box in
                CredentialsResultView(result: box.result) {
                    credsBox = nil
                    Task { account = try? await APIClient.shared.employeeAccountInfo(employee.id) }
                }
            }
        }
    }

    private func regenerate() async {
        generating = true
        if let result = try? await APIClient.shared.generateEmployeeAccess(employee.id, role: account?.role ?? "employe") {
            credsBox = CredsBox(result: result)
        }
        generating = false
    }

    private func accountStatusLabel(_ s: String) -> String {
        switch s { case "active": return "Actif"; case "invited": return "Invité"
        case "suspended": return "Suspendu"; default: return s.capitalized }
    }
    private func roleLabel(_ r: String) -> String {
        accessRoles.first { $0.0 == r }?.1 ?? r
    }

    private func infoRow(_ label: String, value: String, icon: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .frame(width: 28)
                .foregroundStyle(theme.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.caption).foregroundStyle(.secondary)
                Text(value).font(.subheadline)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
    }
}
