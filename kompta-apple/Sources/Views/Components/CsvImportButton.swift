//
//  CsvImportButton.swift
//  Bouton réutilisable d'import CSV (sélecteur de fichier natif iOS/macOS).
//
import SwiftUI
import UniformTypeIdentifiers

struct CsvImportButton: View {
    let title: String
    let importer: (Data, String) async throws -> CsvImportResult
    var onDone: () async -> Void = {}

    @State private var picking = false
    @State private var busy = false
    @State private var resultMsg: String?

    var body: some View {
        Button { picking = true } label: {
            if busy { ProgressView() } else { Label(title, systemImage: "square.and.arrow.down.on.square") }
        }
        .disabled(busy)
        .fileImporter(isPresented: $picking,
                      allowedContentTypes: [.commaSeparatedText, .plainText],
                      allowsMultipleSelection: false) { result in
            if case let .success(urls) = result, let url = urls.first {
                Task { await handle(url) }
            }
        }
        .alert("Import CSV", isPresented: Binding(get: { resultMsg != nil }, set: { if !$0 { resultMsg = nil } })) {
            Button("OK", role: .cancel) { resultMsg = nil }
        } message: { Text(resultMsg ?? "") }
    }

    private func handle(_ url: URL) async {
        busy = true; defer { busy = false }
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            let r = try await importer(data, url.lastPathComponent)
            var msg = "\(r.importedCount) ligne(s) importée(s)."
            if let s = r.skipped, s > 0 { msg += " \(s) ignorée(s)." }
            resultMsg = msg
            await onDone()
        } catch {
            resultMsg = "Échec de l'import : \(error.localizedDescription)"
        }
    }
}
