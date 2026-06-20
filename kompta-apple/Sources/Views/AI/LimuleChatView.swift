import SwiftUI

struct LimuleChatView: View {
    @EnvironmentObject private var theme: CompanyTheme

    @State private var messages: [ChatMessage] = [
        ChatMessage(role: "assistant", content: "Bonjour ! Je suis Limule, votre Grand Sage KOMPTA. Posez-moi vos questions sur vos ventes, stocks, employés ou finances.")
    ]
    @State private var input     = ""
    @State private var isWaiting = false
    @State private var isLoadingHistory = false
    @State private var toast: String?
    @FocusState private var focused: Bool
    @Namespace private var scroll

    private var welcome: ChatMessage {
        ChatMessage(role: "assistant", content: "Bonjour ! Je suis Limule, votre Grand Sage KOMPTA. Posez-moi vos questions sur vos ventes, stocks, employés ou finances.")
    }

    var body: some View {
        VStack(spacing: 0) {
            // Messages scroll
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(messages) { msg in
                            VStack(alignment: msg.isUser ? .trailing : .leading, spacing: 6) {
                                MessageBubble(message: msg)
                                if !msg.isUser && msg.content != welcome.content {
                                    MessageActions(
                                        message: msg,
                                        onCreateTask: { Task { await createTask(from: msg) } }
                                    )
                                }
                            }
                            .id(msg.id.uuidString)
                        }
                        if isWaiting { TypingBubble().id("typing") }
                    }
                    .padding()
                }
                .onChange(of: messages.count) { _, _ in
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(messages.last?.id.uuidString ?? "typing", anchor: .bottom)
                    }
                }
                .onChange(of: isWaiting) { _, v in
                    if v { withAnimation { proxy.scrollTo("typing", anchor: .bottom) } }
                }
            }

            Divider()

            if let toast {
                Text(toast)
                    .font(.caption.bold())
                    .foregroundStyle(theme.primary)
                    .padding(.horizontal)
                    .transition(.opacity)
            }

            // Input bar
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Demander à Limule…", text: $input, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...5)
                    .focused($focused)
                    .onSubmit { Task { await send() } }

                Button { Task { await send() } } label: {
                    Image(systemName: isWaiting ? "ellipsis.circle" : "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWaiting
                            ? .secondary : theme.primary)
                        .animation(.easeInOut(duration: 0.2), value: isWaiting)
                }
                .disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWaiting)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background {
                if #available(iOS 26.0, macOS 26.0, *), theme.useLiquidGlass {
                    Color.clear.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 22))
                } else {
                    RoundedRectangle(cornerRadius: 22).fill(.regularMaterial)
                }
            }
            .padding(12)
        }
        .navigationTitle("Limule")
        .task { await loadHistory() }
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button { Task { await loadHistory(force: true) } } label: {
                    Label("Historique", systemImage: isLoadingHistory ? "hourglass" : "clock.arrow.circlepath")
                }
                .disabled(isLoadingHistory)
                .help("Recharger l'historique des conversations")
                Button { withAnimation { messages = [welcome]; input = "" } } label: {
                    Label("Nouvelle conversation", systemImage: "square.and.pencil")
                }
                .help("Démarrer une nouvelle conversation")
            }
        }
    }

    private func loadHistory(force: Bool = false) async {
        guard force || messages.count == 1 else { return }
        isLoadingHistory = true
        defer { isLoadingHistory = false }
        do {
            let history = try await APIClient.shared.limuleHistory(limit: 12)
            guard !history.isEmpty else { return }
            var rebuilt: [ChatMessage] = [welcome]
            for item in history {
                rebuilt.append(ChatMessage(role: "user", content: item.prompt))
                rebuilt.append(ChatMessage(
                    role: "assistant",
                    content: item.response,
                    apiId: item.id,
                    module: item.module,
                    intent: item.intent,
                    sources: item.sources,
                    signals: item.signals
                ))
            }
            messages = rebuilt
        } catch {
            if force { toast = error.localizedDescription }
        }
    }

    private func send() async {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        input = ""
        messages.append(ChatMessage(role: "user", content: text))
        isWaiting = true
        do {
            let reply = try await APIClient.shared.chatRich(messages: messages)
            messages.append(ChatMessage(
                role: "assistant",
                content: reply.answer,
                apiId: reply.interaction_id,
                module: reply.module,
                intent: reply.intent,
                sources: reply.sources ?? [],
                signals: reply.signals ?? [],
                confidence: reply.confidence
            ))
        } catch {
            messages.append(ChatMessage(role: "assistant", content: "Erreur : \(error.localizedDescription)"))
        }
        isWaiting = false
        focused = true
    }

    private func createTask(from message: ChatMessage) async {
        let title = message.content
            .split(separator: "\n")
            .first
            .map { String($0.prefix(72)) } ?? "Action Limule"
        do {
            _ = try await APIClient.shared.createTask(TaskPayload(
                title: title,
                description: message.content,
                priority: message.signals.contains { ["high", "critical"].contains($0.severity) } ? "high" : "normal",
                project: "Limule"
            ))
            toast = "Tâche créée dans le projet Limule."
        } catch {
            toast = error.localizedDescription
        }
    }
}

// MARK: - Message bubble

struct MessageBubble: View {
    let message: ChatMessage
    @EnvironmentObject private var theme: CompanyTheme

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if message.isUser { Spacer(minLength: 60) }

            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 4) {
                if !message.isUser {
                    HStack(spacing: 5) {
                        LimuleMark(size: 18, showAura: false)
                        Text("Limule").font(.caption2.bold()).foregroundStyle(.secondary)
                    }
                }

                Group {
                    if message.isUser {
                        Text(message.content).font(.body)
                    } else {
                        // Limule answers are markdown-ish — render bold/headings/bullets.
                        AIMarkdownText(text: message.content, accent: theme.primary)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .background {
                    if message.isUser {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(LinearGradient(colors: [theme.primary, theme.secondary],
                                                 startPoint: .topLeading, endPoint: .bottomTrailing))
                    } else if #available(iOS 26.0, macOS 26.0, *), theme.useLiquidGlass {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(.clear)
                            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    } else {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(.ultraThinMaterial)
                            .overlay(
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .strokeBorder(theme.primary.opacity(0.12), lineWidth: 1)
                            )
                    }
                }
                .foregroundStyle(message.isUser ? .white : .primary)

                if !message.isUser && (!message.sources.isEmpty || !message.signals.isEmpty || message.confidence != nil) {
                    HStack(spacing: 6) {
                        if let module = message.module {
                            metaChip(module, icon: "square.grid.2x2", tint: theme.primary)
                        }
                        if let confidence = message.confidence {
                            metaChip("\(confidence)%", icon: "gauge.medium",
                                     tint: confidence >= 70 ? .green : .orange)
                        }
                        if !message.sources.isEmpty {
                            metaChip("\(message.sources.count) source(s)", icon: "doc.text", tint: .secondary)
                        }
                    }
                    .padding(.top, 1)
                }
            }

            if !message.isUser { Spacer(minLength: 60) }
        }
    }

    @ViewBuilder
    private func metaChip(_ text: String, icon: String, tint: Color) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon).font(.system(size: 9))
            Text(text).font(.caption2.bold())
        }
        .padding(.horizontal, 7).padding(.vertical, 3)
        .background(tint.opacity(0.12), in: Capsule())
        .foregroundStyle(tint == .secondary ? Color.secondary : tint)
    }
}

private struct MessageActions: View {
    let message: ChatMessage
    let onCreateTask: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onCreateTask) {
                Label("Créer tâche", systemImage: "checklist")
            }
            .buttonStyle(.borderless)
            .font(.caption.bold())

            if let intent = message.intent {
                Label(intent, systemImage: "tag")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.leading, 32)
    }
}

// MARK: - Typing indicator

struct TypingBubble: View {
    @State private var beat = false
    @EnvironmentObject private var theme: CompanyTheme

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            LimuleMark(size: 26, showAura: false)
            HStack(spacing: 5) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(theme.primary)
                        .frame(width: 7, height: 7)
                        .offset(y: beat ? (i == 1 ? -5 : -2) : 0)
                        .animation(.easeInOut(duration: 0.5).repeatForever().delay(Double(i) * 0.15), value: beat)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(.quaternary)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            Spacer()
        }
        .onAppear { beat = true }
    }
}
