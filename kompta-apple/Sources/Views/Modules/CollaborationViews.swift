import SwiftUI
import UniformTypeIdentifiers

// ============================================================================
//  Wave 3 — Collaboration
//  Tâches / Kanban · Chat · Réunions · Notes · Documents
// ============================================================================

// MARK: - Tâches / Kanban

private let taskColumns: [(key: String, title: String)] = [
    ("todo", "À faire"), ("doing", "En cours"), ("review", "En révision"), ("done", "Terminé"),
]

private func taskAccent(_ key: String) -> Color {
    switch key {
    case "todo":   return .orange
    case "doing":  return .blue
    case "review": return .purple
    default:       return .green
    }
}

/// Surface de carte adaptative (claire en mode clair, sombre en mode sombre) —
/// remplace le blanc codé en dur qui cassait en thème sombre.
private extension Color {
    static var taskCardSurface: Color {
        #if os(iOS)
        Color(.secondarySystemGroupedBackground)
        #elseif os(macOS)
        Color(nsColor: .controlBackgroundColor)
        #else
        Color.white
        #endif
    }
}

struct TasksKanbanView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var state = Loadable<[KTask]>()
    @State private var showNew = false
    @State private var selectedStatus = "todo"
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var hSize
    #endif

    /// Kanban horizontal en colonnes sur écran large (iPad / macOS) ; sur iPhone
    /// (largeur compacte) on bascule sur un sélecteur de statut + liste verticale
    /// pleine largeur — plus lisible et sans scroll horizontal.
    private var useKanban: Bool {
        #if os(macOS)
        return true
        #else
        return hSize == .regular
        #endif
    }

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune tâche", emptyIcon: "checklist",
                  reload: load) { tasks in
            if useKanban {
                kanbanLayout(tasks)
            } else {
                listLayout(tasks)
            }
        }
        .navigationTitle("Tâches")
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { TaskFormView { await load() } }
    }

    // MARK: iPad / macOS — kanban horizontal en colonnes
    @ViewBuilder
    private func kanbanLayout(_ tasks: [KTask]) -> some View {
        ScrollView(.vertical, showsIndicators: false) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 14) {
                    ForEach(taskColumns, id: \.key) { col in
                        KanbanColumn(
                            columnKey: col.key,
                            title: col.title,
                            tasks: sorted(tasks, col.key),
                            onAdvance: { task in Task { await advance(task) } },
                            onDelete: { task in Task { await remove(task) } }
                        )
                    }
                }
                .padding(16)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: iPhone — sélecteur de statut + liste verticale pleine largeur
    @ViewBuilder
    private func listLayout(_ tasks: [KTask]) -> some View {
        let current = sorted(tasks, selectedStatus)
        VStack(spacing: 0) {
            StatusSwitcher(
                selected: $selectedStatus,
                counts: Dictionary(uniqueKeysWithValues: taskColumns.map { col in (col.key, tasks.filter { $0.status == col.key }.count) })
            )
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 4)

            if current.isEmpty {
                Spacer(minLength: 0)
                VStack(spacing: 8) {
                    Image(systemName: "tray").font(.largeTitle).foregroundStyle(.tertiary)
                    Text("Aucune tâche ici").font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(spacing: 12) {
                        ForEach(current) { task in
                            TaskKanbanCard(task: task, accent: taskAccent(task.status),
                                           onAdvance: { Task { await advance(task) } },
                                           onDelete: { Task { await remove(task) } })
                        }
                    }
                    .padding(16)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .animation(.easeInOut(duration: 0.2), value: selectedStatus)
    }

    private func sorted(_ tasks: [KTask], _ key: String) -> [KTask] {
        tasks.filter { $0.status == key }.sorted { $0.order_index < $1.order_index }
    }

    private func load() async { await state.load { try await APIClient.shared.tasks() } }

    private func advance(_ task: KTask) async {
        guard let idx = taskColumns.firstIndex(where: { $0.key == task.status }), idx < taskColumns.count - 1 else { return }
        let next = taskColumns[idx + 1].key
        // PATCH minimal (statut seul) : fonctionne pour tous les profils.
        _ = try? await APIClient.shared.setTaskStatus(task.id, next)
        await load()
    }
    private func remove(_ task: KTask) async {
        try? await APIClient.shared.deleteTask(task.id)
        await load()
    }
}

/// Sélecteur de statut (iPhone) : pastille colorée + libellé + compteur, le
/// segment actif teinté de sa couleur. Défilable horizontalement par sécurité.
private struct StatusSwitcher: View {
    @Binding var selected: String
    let counts: [String: Int]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(taskColumns, id: \.key) { col in
                    let isOn = selected == col.key
                    let accent = taskAccent(col.key)
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) { selected = col.key }
                    } label: {
                        HStack(spacing: 6) {
                            Circle().fill(accent).frame(width: 8, height: 8)
                            Text(col.title).font(.subheadline.weight(.semibold))
                            Text("\(counts[col.key] ?? 0)")
                                .font(.caption2.bold())
                                .padding(.horizontal, 6).padding(.vertical, 1)
                                .background((isOn ? accent : Color.secondary).opacity(0.18), in: Capsule())
                        }
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .background(isOn ? accent.opacity(0.15) : Color.secondary.opacity(0.08), in: Capsule())
                        .foregroundStyle(isOn ? accent : .secondary)
                        .overlay(Capsule().strokeBorder(isOn ? accent.opacity(0.4) : .clear, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
    }
}

private struct KanbanColumn: View {
    let columnKey: String
    let title: String
    let tasks: [KTask]
    let onAdvance: (KTask) -> Void
    let onDelete: (KTask) -> Void

    private var accent: Color {
        taskAccent(columnKey)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Circle().fill(accent).frame(width: 9, height: 9)
                Text(title).font(.subheadline.bold())
                Text("\(tasks.count)")
                    .font(.caption2.bold())
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(accent.opacity(0.15))
                    .foregroundStyle(accent)
                    .clipShape(Capsule())
                Spacer(minLength: 0)
            }

            if tasks.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: "tray").font(.title3).foregroundStyle(.tertiary)
                    Text("Vide").font(.caption).foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 24)
            } else {
                VStack(spacing: 10) {
                    ForEach(tasks) { task in
                        TaskKanbanCard(task: task, accent: accent,
                                       onAdvance: { onAdvance(task) },
                                       onDelete: { onDelete(task) })
                    }
                }
            }
        }
        .padding(12)
        .frame(width: 290, alignment: .top)
        .background(Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct TaskKanbanCard: View {
    let task: KTask
    let accent: Color
    let onAdvance: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(task.title)
                .font(.subheadline.weight(.semibold))
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)

            if !task.description.isEmpty {
                Text(task.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            HStack(spacing: 8) {
                if !task.assignee_name.isEmpty {
                    Label(task.assignee_name, systemImage: "person.fill")
                        .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
                if let due = task.due_date, !due.isEmpty {
                    Label(due, systemImage: "calendar")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }

            HStack {
                StatusPill(text: task.priority, colorName: task.priorityColorName)
                Spacer()
                if task.status != "done" {
                    Button(action: onAdvance) {
                        Image(systemName: "arrow.right.circle.fill")
                            .foregroundStyle(accent)
                    }
                    .buttonStyle(.plain)
                }
                Button(action: onDelete) {
                    Image(systemName: "trash").foregroundStyle(.red.opacity(0.8))
                }
                .buttonStyle(.plain)
            }
            .font(.callout)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.taskCardSurface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.primary.opacity(0.06), lineWidth: 1)
        )
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2)
                .fill(accent)
                .frame(width: 3)
                .padding(.vertical, 8)
        }
    }
}

struct TaskFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var assigneeName = ""
    @State private var priority = "normal"
    @State private var dueDate = Date()
    @State private var hasDueDate = false
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Tâche") {
                    TextField("Titre *", text: $title)
                    TextField("Assigné à", text: $assigneeName)
                    Picker("Priorité", selection: $priority) {
                        Text("Basse").tag("low"); Text("Normale").tag("normal"); Text("Haute").tag("high")
                    }
                    Toggle("Date d'échéance", isOn: $hasDueDate)
                    if hasDueDate { DatePicker("Échéance", selection: $dueDate, displayedComponents: .date) }
                }
            }
            .navigationTitle("Nouvelle tâche")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }.disabled(title.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        let payload = TaskPayload(title: title, priority: priority,
                                   due_date: hasDueDate ? f.string(from: dueDate) : nil, assignee_name: assigneeName)
        do { _ = try await APIClient.shared.createTask(payload); await onSaved(); dismiss() }
        catch { }
        saving = false
    }
}

// MARK: - Chat / Canaux

struct ChatChannelsView: View {
    @StateObject private var state = Loadable<[ChatChannel]>()
    @State private var showNew = false
    @EnvironmentObject private var auth: AuthManager

    /// Seul un admin d'entreprise peut créer un canal (au-delà du "general"
    /// par défaut) — même règle que côté backend (routes.py create_channel).
    private var canCreateChannel: Bool {
        ["admin_entreprise", "manager_entreprise", "super_admin"].contains(auth.currentUser?.role ?? "")
    }

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun canal", emptyIcon: "bubble.left.and.bubble.right",
                  reload: load) { channels in
            List {
                ForEach(channels) { ch in
                    NavigationLink { ChannelDetailView(channel: ch) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "number").foregroundStyle(.secondary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ch.name).font(.subheadline.bold())
                                if !ch.topic.isEmpty { Text(ch.topic).font(.caption).foregroundStyle(.secondary) }
                            }
                            if ch.is_restricted {
                                Spacer()
                                Image(systemName: "lock.fill").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Canaux")
        .toolbar {
            if canCreateChannel {
                ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { ChannelFormView { await load() } }
    }
    private func load() async { await state.load { try await APIClient.shared.chatChannels() } }
}

struct ChannelFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var topic = ""
    @State private var saving = false
    @State private var companyUsers: [CompanyUserRow] = []
    @State private var selectedMemberIds: Set<Int> = []

    var body: some View {
        NavigationStack {
            Form {
                Section("Canal") {
                    TextField("Nom *", text: $name)
                    TextField("Sujet", text: $topic)
                }
                Section("Membres (laisser vide = canal ouvert à tous)") {
                    if companyUsers.isEmpty {
                        Text("Aucun utilisateur trouvé").font(.caption).foregroundStyle(.secondary)
                    }
                    ForEach(companyUsers) { u in
                        Button {
                            if selectedMemberIds.contains(u.id) { selectedMemberIds.remove(u.id) }
                            else { selectedMemberIds.insert(u.id) }
                        } label: {
                            HStack {
                                Text(u.full_name)
                                Spacer()
                                Text(u.role).font(.caption).foregroundStyle(.secondary)
                                if selectedMemberIds.contains(u.id) {
                                    Image(systemName: "checkmark").foregroundStyle(.tint)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle("Nouveau canal")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Créer") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                }
            }
        }
        .task {
            companyUsers = (try? await APIClient.shared.chatCompanyUsers()) ?? []
        }
    }

    private func save() async {
        saving = true
        do {
            _ = try await APIClient.shared.createChannel(name: name, topic: topic, memberUserIds: Array(selectedMemberIds))
            await onSaved(); dismiss()
        }
        catch { }
        saving = false
    }
}

struct ChannelDetailView: View {
    let channel: ChatChannel
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var state = Loadable<[ChatMsg]>()
    @State private var detail: ChatChannelDetail?
    @State private var draft = ""
    @State private var sending = false
    @State private var showMembers = false
    @State private var taskToast: String?
    @State private var mentionQuery: String?

    /// Employés du canal dont le nom correspond au "@..." en cours de frappe —
    /// insérer le nom exact garantit que Limule associe correctement la
    /// tâche à la bonne personne (voir chat_ai_action côté backend).
    private var mentionSuggestions: [ChatMember] {
        guard let mentionQuery, let detail else { return [] }
        let q = mentionQuery.lowercased()
        let matches = detail.members.filter { q.isEmpty || $0.name.lowercased().contains(q) }
        return Array(matches.prefix(5))
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            AsyncList(state: state, emptyTitle: "Aucun message", emptyIcon: "bubble.left", reload: load) { msgs in
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(msgs) { m in
                                ChannelMessageRow(
                                    msg: m,
                                    isMine: m.author_id == auth.currentUser?.id,
                                    onCreateDetectedTask: { Task { await createDetectedTask(from: m) } }
                                )
                                    .id(m.id)
                                    .contextMenu {
                                        Button {
                                            Task { await createTask(from: m) }
                                        } label: {
                                            Label("Créer une tâche (IA)", systemImage: "checklist")
                                        }
                                    }
                            }
                        }
                        .padding()
                    }
                    .onChange(of: msgs.count) { _, _ in
                        withAnimation { proxy.scrollTo(msgs.last?.id, anchor: .bottom) }
                    }
                }
            }
            Divider()
            if let taskToast {
                Text(taskToast)
                    .font(.caption.bold())
                    .foregroundStyle(theme.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal).padding(.top, 6)
                    .transition(.opacity)
            }
            if !mentionSuggestions.isEmpty {
                mentionDropdown
            }
            HStack(spacing: 10) {
                TextField("Message dans #\(channel.name)…", text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...4)
                    .onSubmit { Task { await send() } }
                    .onChange(of: draft) { _, newValue in updateMentionQuery(newValue) }
                Button { Task { await send() } } label: {
                    Image(systemName: sending ? "ellipsis.circle" : "arrow.up.circle.fill").font(.title2)
                        .foregroundStyle(draft.trimmingCharacters(in: .whitespaces).isEmpty ? .secondary : theme.primary)
                }
                .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty || sending)
                .buttonStyle(.plain)
            }
            .padding()
        }
        .navigationTitle("#\(channel.name)")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showMembers = true } label: { Image(systemName: "person.2.fill") }
            }
        }
        .task { await load() }
        .sheet(isPresented: $showMembers) { ChannelMembersSheet(detail: detail, channel: channel) }
    }

    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10).fill(theme.primary.opacity(0.15)).frame(width: 38, height: 38)
                Image(systemName: "number").foregroundStyle(theme.primary)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(channel.name).font(.subheadline.bold())
                Text(channel.topic.isEmpty ? "Canal d'équipe" : channel.topic)
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            if let d = detail {
                Button { showMembers = true } label: {
                    HStack(spacing: 5) {
                        Circle().fill(.green).frame(width: 7, height: 7)
                        Text("\(d.online_count) en ligne · \(d.member_count)")
                            .font(.caption.bold()).foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal).padding(.vertical, 10)
    }

    private func load() async {
        await state.load { try await APIClient.shared.channelMessages(channel.id) }
        detail = try? await APIClient.shared.channelDetail(channel.id)
    }
    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        mentionQuery = nil
        sending = true; draft = ""
        do { _ = try await APIClient.shared.sendMessage(channel.id, body: text); await load() }
        catch { draft = text }
        sending = false
    }

    private var mentionDropdown: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(mentionSuggestions) { member in
                Button { insertMention(member) } label: {
                    HStack(spacing: 8) {
                        Circle().fill(theme.primary.opacity(0.15)).frame(width: 26, height: 26)
                            .overlay(Text(member.initials).font(.caption2.bold()).foregroundStyle(theme.primary))
                        VStack(alignment: .leading, spacing: 1) {
                            Text(member.name).font(.caption.bold())
                            if !member.role.isEmpty {
                                Text(member.role).font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                    }
                    .padding(.horizontal, 12).padding(.vertical, 7)
                }
                .buttonStyle(.plain)
                if member.id != mentionSuggestions.last?.id { Divider().padding(.leading, 46) }
            }
        }
        .background(Color.taskCardSurface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(theme.primary.opacity(0.2)))
        .padding(.horizontal)
        .padding(.top, 6)
    }

    /// Repère un "@..." en cours de frappe à la fin du brouillon (les messages
    /// de chat sont courts, la mention est quasi toujours en fin de texte).
    private func updateMentionQuery(_ text: String) {
        guard let range = text.range(of: "@[\\wÀ-ÿ]*$", options: .regularExpression) else {
            mentionQuery = nil
            return
        }
        mentionQuery = String(text[range].dropFirst())
    }

    private func insertMention(_ member: ChatMember) {
        if let range = draft.range(of: "@[\\wÀ-ÿ]*$", options: .regularExpression) {
            draft.replaceSubrange(range, with: "@\(member.name) ")
        } else {
            draft += "@\(member.name) "
        }
        mentionQuery = nil
    }

    // L'IA analyse le message du canal et en extrait une tâche bien formée
    // (titre court impératif, description, priorité).
    private func createTask(from message: ChatMsg) async {
        do {
            let task = try await APIClient.shared.extractTask(
                text: message.body, source: "channel:\(channel.name)", project: "#\(channel.name)"
            )
            withAnimation { taskToast = "Tâche créée : « \(task.title) »" }
        } catch {
            withAnimation { taskToast = error.localizedDescription }
        }
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        withAnimation { taskToast = nil }
    }

    /// Utilise directement l'action structurée détectée par Limule à l'envoi :
    /// @mention, priorité et échéance sont conservées par le backend.
    private func createDetectedTask(from message: ChatMsg) async {
        do {
            let task = try await APIClient.shared.quickTaskFromMessage(message.id)
            withAnimation { taskToast = "Tâche assignée : « \(task.title) »" }
        } catch {
            withAnimation { taskToast = error.localizedDescription }
        }
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        withAnimation { taskToast = nil }
    }
}

/// Palette de couleurs de mention — vives, distinctes, lisibles sur fond clair
/// ET sombre (contrairement à .primary/.secondary qui s'effacent selon le
/// thème). Une même personne @mentionnée garde toujours la même couleur,
/// dérivée d'un hash stable de son nom.
private let mentionPalette: [Color] = [
    .blue, .purple, .orange, .pink, .teal, .indigo, .red, .mint, .cyan, .brown,
]

private func mentionColor(for name: String) -> Color {
    let hash = name.lowercased().unicodeScalars.reduce(into: 0) { acc, scalar in acc = acc &+ Int(scalar.value) }
    return mentionPalette[hash % mentionPalette.count]
}

/// Reconstruit le texte du message en mettant en évidence chaque "@Nom" avec
/// la couleur propre à cette personne — même heuristique de détection que le
/// backend (chat_ai_action / extract_mentions) : le token juste après "@",
/// jusqu'au prochain espace.
private func styledMessageBody(_ body: String) -> Text {
    guard let regex = try? NSRegularExpression(pattern: "@[\\wÀ-ÿ]+") else { return Text(body) }
    let ns = body as NSString
    let matches = regex.matches(in: body, range: NSRange(location: 0, length: ns.length))
    guard !matches.isEmpty else { return Text(body) }

    var result = Text("")
    var cursor = 0
    for match in matches {
        let range = match.range
        if range.location > cursor {
            result = result + Text(ns.substring(with: NSRange(location: cursor, length: range.location - cursor)))
        }
        let mention = ns.substring(with: range)
        result = result + Text(mention).fontWeight(.bold).foregroundColor(mentionColor(for: mention))
        cursor = range.location + range.length
    }
    if cursor < ns.length {
        result = result + Text(ns.substring(from: cursor))
    }
    return result
}

private struct ChannelMessageRow: View {
    let msg: ChatMsg
    let isMine: Bool
    let onCreateDetectedTask: () -> Void
    @EnvironmentObject private var theme: CompanyTheme

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if isMine { Spacer(minLength: 40) }
            if !isMine { AvatarView(initials: initials, size: 30, color: theme.primary) }
            VStack(alignment: isMine ? .trailing : .leading, spacing: 2) {
                HStack(spacing: 6) {
                    if !isMine { Text(msg.author_name).font(.caption2.bold()).foregroundStyle(.secondary) }
                    Text(shortDate(msg.created_at)).font(.caption2).foregroundStyle(.tertiary)
                }
                styledMessageBody(msg.body).font(.subheadline)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(isMine ? theme.primary : Color.secondary.opacity(0.12),
                                in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .foregroundStyle(isMine ? .white : .primary)
                if let action = msg.ai_action, action.detected {
                    Button(action: onCreateDetectedTask) {
                        HStack(spacing: 7) {
                            LimuleMark(size: 20, showAura: false)
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Action détectée par Limule").font(.caption2.bold())
                                Text(action.title ?? msg.ai_suggestion ?? "Créer une tâche")
                                    .font(.caption).lineLimit(2)
                                if let assignee = action.assignee, !assignee.isEmpty {
                                    Text("Assignée à \(assignee)").font(.caption2).opacity(0.8)
                                }
                            }
                            Spacer(minLength: 4)
                            Image(systemName: "plus.circle.fill")
                        }
                        .padding(9)
                        .background(theme.primary.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                        .foregroundStyle(theme.primary)
                    }
                    .buttonStyle(.plain)
                }
            }
            if !isMine { Spacer(minLength: 40) }
        }
    }
    private var initials: String {
        msg.author_name.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined().uppercased()
    }
}

private struct ChannelMembersSheet: View {
    let detail: ChatChannelDetail?
    let channel: ChatChannel
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: CompanyTheme

    var body: some View {
        NavigationStack {
            List {
                if let members = detail?.members, !members.isEmpty {
                    Section("\(members.count) membre(s)") {
                        ForEach(members) { m in
                            HStack(spacing: 12) {
                                AvatarView(initials: m.initials, size: 36, color: theme.primary)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(m.name).font(.subheadline.bold())
                                    Text([m.role, m.department].filter { !$0.isEmpty }.joined(separator: " · "))
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Circle().fill(m.status == "active" ? .green : .gray).frame(width: 8, height: 8)
                            }
                        }
                    }
                } else {
                    ContentUnavailableView("Aucun membre", systemImage: "person.2.slash")
                }
            }
            .navigationTitle("Membres de #\(channel.name)")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { dismiss() } } }
        }
    }
}

// MARK: - Réunions

struct MeetingsView: View {
    @StateObject private var state = Loadable<[Meeting]>()
    @State private var showNew = false

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune réunion", emptyIcon: "calendar.badge.clock",
                  reload: load) { meetings in
            List {
                ForEach(meetings) { m in
                    NavigationLink { MeetingDetailView(meeting: m) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(m.title).font(.subheadline.bold())
                                Text(shortDate(m.start_at)).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            StatusPill(text: m.tag, colorName: m.tag_color)
                        }
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Réunions")
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { MeetingFormView { await load() } }
    }
    private func load() async { await state.load { try await APIClient.shared.meetings() } }
}

struct MeetingDetailView: View {
    let meeting: Meeting
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(meeting.title).font(.title3.bold())
                HStack {
                    Image(systemName: "clock"); Text("\(shortDate(meeting.start_at)) → \(shortDate(meeting.end_at))")
                }.font(.subheadline).foregroundStyle(.secondary)
                if !meeting.location.isEmpty {
                    HStack { Image(systemName: "mappin.and.ellipse"); Text(meeting.location) }
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                if !meeting.attendees.isEmpty {
                    GlassCard {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Participants").font(.caption.bold())
                            Text(meeting.attendees.joined(separator: ", ")).font(.caption)
                        }
                    }
                }
                if !meeting.agenda.isEmpty {
                    GlassCard {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Ordre du jour").font(.caption.bold())
                            Text(meeting.agenda).font(.callout)
                        }
                    }
                }
                if !meeting.ai_summary.isEmpty {
                    GlassCard {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 6) {
                                LimuleMark(size: 18, showAura: false)
                                Text("Résumé Limule").font(.caption.bold())
                            }
                            Text(meeting.ai_summary).font(.callout)
                        }
                    }
                }
            }.padding()
        }
        .navigationTitle("Réunion")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }
}

struct MeetingFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var location = ""
    @State private var agenda = ""
    @State private var start = Date()
    @State private var end = Date().addingTimeInterval(3600)
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Réunion") {
                    TextField("Titre *", text: $title)
                    DatePicker("Début", selection: $start)
                    DatePicker("Fin", selection: $end)
                    TextField("Lieu / lien", text: $location)
                }
                Section("Ordre du jour") {
                    TextField("Agenda", text: $agenda, axis: .vertical).lineLimit(3...6)
                }
            }
            .navigationTitle("Nouvelle réunion")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }.disabled(title.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        let f = ISO8601DateFormatter()
        let payload = MeetingPayload(title: title, start_at: f.string(from: start), end_at: f.string(from: end),
                                      location: location, agenda: agenda)
        do { _ = try await APIClient.shared.createMeeting(payload); await onSaved(); dismiss() }
        catch { }
        saving = false
    }
}

// MARK: - Notes

struct NotesView: View {
    @StateObject private var state = Loadable<[DailyNote]>()
    @State private var showNew = false
    @State private var generating = false
    @State private var selected: DailyNote?
    @State private var toast: String?

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune note", emptyIcon: "note.text",
                  reload: load) { notes in
            List {
                Section {
                    Button { Task { await generateJournal() } } label: {
                        HStack(spacing: 10) {
                            if generating { ProgressView().controlSize(.small) }
                            else { LimuleMark(size: 22, showAura: false) }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(generating ? "Limule rédige votre journal…" : "Générer le journal du jour")
                                    .font(.subheadline.bold())
                                Text("Synthèse Limule de vos tâches, réunions et activité")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            LimuleMark(size: 18, showAura: false)
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(generating)
                }
                let pinned = notes.filter { $0.pinned }
                if !pinned.isEmpty {
                    Section("Épinglées") { ForEach(pinned) { n in noteButton(n) } }
                }
                Section("Toutes les notes") {
                    ForEach(notes.filter { !$0.pinned }) { n in noteButton(n) }
                        .onDelete { idx in Task { await delete(notes.filter { !$0.pinned }, idx) } }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Notes")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { Task { await generateJournal() } } label: {
                    if generating { Image(systemName: "hourglass") }
                    else { LimuleMark(size: 22, showAura: false) }
                }
                .disabled(generating)
                .help("Générer le journal IA du jour")
            }
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) { NoteFormView { await load() } }
        .sheet(item: $selected) { NoteDetailView(note: $0) { await load() } }
        .overlay(alignment: .bottom) {
            if let toast {
                Text(toast).font(.caption.bold()).foregroundStyle(.white)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(.red, in: Capsule()).padding(.bottom, 12)
            }
        }
    }

    private func noteButton(_ n: DailyNote) -> some View {
        Button { selected = n } label: { NoteRow(note: n).contentShape(Rectangle()) }.buttonStyle(.plain)
    }

    private func load() async { await state.load { try await APIClient.shared.notes() } }
    private func delete(_ items: [DailyNote], _ idx: IndexSet) async {
        for i in idx { try? await APIClient.shared.deleteNote(items[i].id) }
        await load()
    }
    private func generateJournal() async {
        generating = true
        if let note = try? await APIClient.shared.generateDailyNote() {
            await load(); selected = note
        } else {
            toast = "Génération du journal indisponible."
            try? await Task.sleep(nanoseconds: 2_500_000_000); toast = nil
        }
        generating = false
    }
}

private struct NoteRow: View {
    let note: DailyNote
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                if note.pinned { Image(systemName: "pin.fill").font(.caption2).foregroundStyle(.orange) }
                Text(note.title.isEmpty ? shortDate(note.note_date) : note.title).font(.subheadline.bold())
                if note.ai_generated {
                    HStack(spacing: 3) { LimuleMark(size: 13, showAura: false); Text("Limule") }
                        .font(.caption2.bold())
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(KomptaBrand.limuleBlue.opacity(0.15), in: Capsule()).foregroundStyle(KomptaBrand.limuleBlue)
                }
                Spacer()
                Text(shortDate(note.note_date)).font(.caption2).foregroundStyle(.tertiary)
            }
            Text(note.body).font(.caption).foregroundStyle(.secondary).lineLimit(2)
        }
        .padding(.vertical, 3)
    }
}

// MARK: - Note detail (view full body, AI markdown, share)

private struct NoteDetailView: View {
    let note: DailyNote
    let onChanged: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: CompanyTheme

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text(note.title.isEmpty ? "Note du \(shortDate(note.note_date))" : note.title)
                            .font(.title3.bold())
                        Spacer()
                        if note.ai_generated {
                            HStack(spacing: 4) { LimuleMark(size: 16, showAura: false); Text("Limule") }
                                .font(.caption.bold())
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(KomptaBrand.limuleBlue.opacity(0.15), in: Capsule()).foregroundStyle(KomptaBrand.limuleBlue)
                        }
                    }
                    GlassCard {
                        if note.ai_generated {
                            AIMarkdownText(text: note.body, accent: theme.primary).textSelection(.enabled)
                        } else {
                            Text(note.body).font(.callout).textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    ShareLink(item: "\(note.title)\n\n\(note.body)") {
                        Label("Partager la note", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(theme.primary.opacity(0.12), in: RoundedRectangle(cornerRadius: theme.buttonRadius))
                            .foregroundStyle(theme.primary)
                    }
                    .buttonStyle(.plain)
                }
                .padding()
            }
            .navigationTitle("Note")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Fermer") { dismiss() } }
                ToolbarItem(placement: .destructiveAction) {
                    Button(role: .destructive) {
                        Task { try? await APIClient.shared.deleteNote(note.id); await onChanged(); dismiss() }
                    } label: { Image(systemName: "trash") }
                }
            }
        }
    }
}

struct NoteFormView: View {
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var body_ = ""
    @State private var pinned = false
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Note") {
                    TextField("Titre", text: $title)
                    TextField("Contenu *", text: $body_, axis: .vertical).lineLimit(4...10)
                    Toggle("Épingler", isOn: $pinned)
                }
            }
            .navigationTitle("Nouvelle note")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }.disabled(body_.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        let payload = DailyNotePayload(note_date: f.string(from: Date()), title: title, body: body_, pinned: pinned)
        do { _ = try await APIClient.shared.createNote(payload); await onSaved(); dismiss() }
        catch { }
        saving = false
    }
}

// MARK: - Documents

struct DocumentsView: View {
    @StateObject private var state = Loadable<[CompanyDocument]>()
    @State private var selected: CompanyDocument?
    @State private var showImporter = false
    @State private var uploading = false
    @State private var uploadError: String?

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucun document", emptyIcon: "doc.on.doc",
                  reload: load) { docs in
            List {
                ForEach(docs) { d in
                    Button { selected = d } label: {
                        HStack(spacing: 12) {
                            Image(systemName: iconFor(d.mime_type)).foregroundStyle(.blue).frame(width: 26)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(d.title.isEmpty ? d.filename : d.title).font(.subheadline.bold()).lineLimit(1)
                                Text("\(d.document_type) · \(shortDate(d.created_at))").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if !d.ai_summary.isEmpty {
                                LimuleMark(size: 16, showAura: false)
                            }
                            if !d.status.isEmpty { StatusPill(text: d.status, colorName: d.status == "processed" ? "green" : "orange") }
                        }
                        .padding(.vertical, 3)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
        .navigationTitle("Documents")
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
        .fileImporter(isPresented: $showImporter,
                      allowedContentTypes: [.pdf, .image, .plainText, .commaSeparatedText, .spreadsheet, .item],
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
        .sheet(item: $selected) { d in DocumentDetailView(document: d) { await load() } }
    }
    private func load() async { await state.load { try await APIClient.shared.documents() } }

    private func handleImport(_ result: Result<[URL], Error>) async {
        uploadError = nil
        guard case .success(let urls) = result, !urls.isEmpty else { return }
        uploading = true
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url) else { continue }
            let mime = mimeFor(url.pathExtension.lowercased())
            do {
                _ = try await APIClient.shared.uploadDocument(data, fileName: url.lastPathComponent,
                                                              mime: mime, title: url.deletingPathExtension().lastPathComponent)
            } catch {
                uploadError = (error as? LocalizedError)?.errorDescription ?? "Échec de l'envoi"
            }
        }
        uploading = false
        await load()
        if uploadError != nil { try? await Task.sleep(nanoseconds: 3_000_000_000); uploadError = nil }
    }

    private func mimeFor(_ ext: String) -> String {
        switch ext {
        case "pdf": return "application/pdf"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "csv": return "text/csv"
        case "txt": return "text/plain"
        case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        default: return "application/octet-stream"
        }
    }
    private func iconFor(_ mime: String) -> String {
        if mime.contains("pdf") { return "doc.text.fill" }
        if mime.contains("image") { return "photo.fill" }
        if mime.contains("sheet") || mime.contains("excel") { return "tablecells.fill" }
        return "doc.fill"
    }
}

/// Document detail with the reusable Limule analysis panel.
private struct DocumentDetailView: View {
    let document: CompanyDocument
    let onChanged: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: CompanyTheme

    @State private var summary: String
    @State private var analyzing = false

    init(document: CompanyDocument, onChanged: @escaping () async -> Void) {
        self.document = document; self.onChanged = onChanged
        _summary = State(initialValue: document.ai_summary)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    GlassCard(padding: 14, cornerRadius: theme.cardRadius) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(document.title.isEmpty ? document.filename : document.title)
                                .font(.headline)
                            Text("\(document.document_type) · \(document.source_module)")
                                .font(.caption).foregroundStyle(.secondary)
                            if document.confidence > 0 {
                                Text("Confiance IA : \(document.confidence)%").font(.caption2).foregroundStyle(.tertiary)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    AIAnalysisPanel(
                        title: "Analyse du document",
                        runLabel: summary.isEmpty ? "Analyser" : "Ré-analyser",
                        loadingLabel: "Limule lit le document…",
                        emptyLabel: "Lancez l'analyse pour résumer ce document.",
                        analysis: summary.isEmpty ? nil : summary, isLoading: analyzing,
                        onRun: { Task { await analyze() } }
                    )
                    NavigationLink {
                        LimuleDocumentChatView(documentId: document.id,
                                               documentTitle: document.title.isEmpty ? document.filename : document.title)
                    } label: {
                        Label("Discuter avec Limule", systemImage: "bubble.left.and.text.bubble.right")
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                            .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
                .padding()
            }
            .navigationTitle("Document")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } } }
        }
    }

    private func analyze() async {
        analyzing = true
        if let updated = try? await APIClient.shared.analyzeDocument(document.id) {
            summary = updated.ai_summary
            await onChanged()
        }
        analyzing = false
    }
}
