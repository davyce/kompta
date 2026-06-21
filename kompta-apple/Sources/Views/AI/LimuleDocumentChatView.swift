//
//  LimuleDocumentChatView.swift
//  Discuter avec Limule à propos d'un document existant (parité web).
//
import SwiftUI

struct LimuleDocumentChatView: View {
    let documentId: Int
    let documentTitle: String

    @State private var messages: [LimuleDocChatTurn] = []
    @State private var input = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        if messages.isEmpty {
                            Text("Posez une question sur « \(documentTitle) ».")
                                .foregroundStyle(.secondary).font(.footnote).padding(.top, 24)
                        }
                        ForEach(messages.indices, id: \.self) { i in
                            let m = messages[i]
                            Text(m.content)
                                .padding(10)
                                .background(m.role == "user" ? Color.accentColor.opacity(0.15) : Color.gray.opacity(0.12),
                                            in: RoundedRectangle(cornerRadius: 12))
                                .frame(maxWidth: .infinity, alignment: m.role == "user" ? .trailing : .leading)
                                .id(i)
                        }
                        if busy { ProgressView().padding(.top, 8) }
                    }
                    .padding()
                }
                .onChange(of: messages.count) { _, _ in
                    withAnimation { proxy.scrollTo(messages.count - 1, anchor: .bottom) }
                }
            }
            if let error { Text(error).foregroundStyle(.red).font(.caption).padding(.horizontal) }
            HStack(spacing: 8) {
                TextField("Votre question…", text: $input, axis: .vertical).lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
                Button { Task { await send() } } label: { Image(systemName: "paperplane.fill") }
                    .disabled(busy || input.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding()
        }
        .navigationTitle("Limule · Document")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private func send() async {
        let q = input.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        input = ""; error = nil
        let history = messages
        messages.append(LimuleDocChatTurn(role: "user", content: q))
        busy = true
        do {
            let r = try await APIClient.shared.limuleDocumentChat(documentId, prompt: q, history: history)
            messages.append(LimuleDocChatTurn(role: "assistant", content: r.response))
        } catch {
            self.error = "Échec : \((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)"
        }
        busy = false
    }
}
