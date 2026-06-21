import SwiftUI
import UniformTypeIdentifiers

// ============================================================================
//  Wave 3 — Collaboration
//  Tâches / Kanban · Chat · Réunions · Notes · Documents
// ============================================================================

// MARK: - Tâches / Kanban

private let taskColumns: [(key: String, title: String)] = [
    ("todo", "À faire"), ("in_progress", "En cours"), ("done", "Terminé"),
]

struct TasksKanbanView: View {
    @EnvironmentObject private var theme: CompanyTheme
    @StateObject private var state = Loadable<[KTask]>()
    @State private var showNew = false

    var body: some View {
        AsyncList(state: state, emptyTitle: "Aucune tâche", emptyIcon: "checklist",
                  reload: load) { tasks in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 16) {
                    ForEach(taskColumns, id: \.key) { col in
                        KanbanColumn(title: col.title, tasks: tasks.filter { $0.status == col.key }.sorted { $0.order_index < $1.order_index },
                                     onAdvance: { task in Task { await advance(task) } },
                                     onDelete: { task in Task { await remove(task) } })
                    }
                }
                .padding()
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

    private func load() async { await state.load { try await APIClient.shared.tasks() } }

    private func advance(_ task: KTask) async {
        guard let idx = taskColumns.firstIndex(where: { $0.key == task.status }), idx < taskColumns.count - 1 else { return }
        let next = taskColumns[idx + 1].key
        let payload = TaskPayload(title: task.title, description: task.description, status: next,
                                   priority: task.priority, due_date: task.due_date, assignee_name: task.assignee_name, project: task.project)
        _ = try? await APIClient.shared.updateTask(task.id, payload)
        await load()
    }
    private func remove(_ task: KTask) async {
        try? await APIClient.shared.deleteTask(task.id)
        await load()
    }
}

private struct KanbanColumn: View {
    let title: String
    let tasks: [KTask]
    let onAdvance: (KTask) -> Void
    let onDelete: (KTask) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title).font(.subheadline.bold())
                Text("\(tasks.count)").font(.caption2.bold())
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Color.secondary.opacity(0.15)).clipShape(Capsule())
            }
            VStack(spacing: 10) {
                ForEach(tasks) { task in
                    GlassCard(padding: 12, cornerRadius: 14) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(task.title).font(.subheadline.bold()).lineLimit(2)
                            if !task.assignee_name.isEmpty {
                                Text(task.assignee_name).font(.caption).foregroundStyle(.secondary)
                            }
                            HStack {
                                StatusPill(text: task.priority, colorName: task.priorityColorName)
                                Spacer()
                                if task.status != "done" {
                                    Button { onAdvance(task) } label: { Image(systemName: "arrow.right.circle.fill") }
                                        .buttonStyle(.plain)
                                }
                                Button(role: .destructive) { onDelete(task) } label: { Image(systemName: "trash") }
                                    .buttonStyle(.plain)
                            }
                            .font(.caption)
                        }
                    }
                }
            }
        }
        .frame(width: 240)
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
            ToolbarItem(placement: .primaryAction) { Button { showNew = true } label: { Image(systemName: "plus") } }
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

    var body: some View {
        NavigationStack {
            Form {
                Section("Canal") {
                    TextField("Nom *", text: $name)
                    TextField("Sujet", text: $topic)
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
    }

    private func save() async {
        saving = true
        do { _ = try await APIClient.shared.createChannel(name: name, topic: topic); await onSaved(); dismiss() }
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

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            AsyncList(state: state, emptyTitle: "Aucun message", emptyIcon: "bubble.left", reload: load) { msgs in
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(msgs) { m in
                                ChannelMessageRow(msg: m, isMine: m.author_id == auth.currentUser?.id)
                                    .id(m.id)
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
            HStack(spacing: 10) {
                TextField("Message dans #\(channel.name)…", text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...4)
                    .onSubmit { Task { await send() } }
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
        sending = true; draft = ""
        do { _ = try await APIClient.shared.sendMessage(channel.id, body: text); await load() }
        catch { draft = text }
        sending = false
    }
}

private struct ChannelMessageRow: View {
    let msg: ChatMsg
    let isMine: Bool
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
                Text(msg.body).font(.subheadline)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(isMine ? theme.primary : Color.secondary.opacity(0.12),
                                in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .foregroundStyle(isMine ? .white : .primary)
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
