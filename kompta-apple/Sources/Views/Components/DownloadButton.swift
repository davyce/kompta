//
//  DownloadButton.swift
//  Bouton réutilisable : récupère un fichier (PDF/CSV) depuis le serveur et le
//  partage via ShareLink (parité avec les téléchargements de la webapp).
//
import SwiftUI

struct DownloadButton: View {
    let title: String
    let fileName: String
    let fetch: () async throws -> Data

    @State private var url: URL?
    @State private var busy = false
    @State private var err: String?

    var body: some View {
        Group {
            if let url {
                ShareLink(item: url) { Label(title, systemImage: "square.and.arrow.up") }
            } else {
                Button { Task { await run() } } label: {
                    if busy { ProgressView() } else { Label(title, systemImage: "square.and.arrow.down") }
                }
                .disabled(busy)
            }
        }
        .alert("Téléchargement", isPresented: Binding(get: { err != nil }, set: { if !$0 { err = nil } })) {
            Button("OK", role: .cancel) { err = nil }
        } message: { Text(err ?? "") }
    }

    private func run() async {
        busy = true; defer { busy = false }
        do {
            let data = try await fetch()
            let u = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
            try data.write(to: u)
            url = u
        } catch {
            err = "Échec : \((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)"
        }
    }
}
