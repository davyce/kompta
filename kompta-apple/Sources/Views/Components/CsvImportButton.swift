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
    /// Types de fichiers acceptés (par défaut CSV/texte ; on peut élargir à
    /// PDF/Excel/image pour la transcription IA des transactions).
    var allowedTypes: [UTType] = [.commaSeparatedText, .plainText]
    var icon: String = "square.and.arrow.down.on.square"

    @State private var picking = false
    @State private var busy = false
    @State private var resultMsg: String?

    var body: some View {
        Button { picking = true } label: {
            if busy { ProgressView() } else { Label(title, systemImage: icon) }
        }
        .disabled(busy)
        .fileImporter(isPresented: $picking,
                      allowedContentTypes: allowedTypes,
                      allowsMultipleSelection: false) { result in
            if case let .success(urls) = result, let url = urls.first {
                Task { await handle(url) }
            }
        }
        .alert("Import", isPresented: Binding(get: { resultMsg != nil }, set: { if !$0 { resultMsg = nil } })) {
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
