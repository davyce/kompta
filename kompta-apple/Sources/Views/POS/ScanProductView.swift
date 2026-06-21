//
//  ScanProductView.swift
//  Scan d'un QR/code-barres produit (caméra) → recherche du produit.
//  iOS uniquement (VisionKit). macOS n'a pas de scanner caméra équivalent.
//
#if os(iOS)
import SwiftUI
import VisionKit

struct ScanProductView: View {
    @Environment(\.dismiss) private var dismiss
    var onFound: ((Product) -> Void)? = nil

    @State private var found: Product?
    @State private var error: String?
    @State private var looking = false
    @State private var lastCode = ""

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                    QRScannerView { code in
                        guard code != lastCode, !looking else { return }
                        lastCode = code
                        Task { await lookup(code) }
                    }
                    .ignoresSafeArea()
                } else {
                    ContentUnavailableView("Scanner indisponible",
                                           systemImage: "camera.fill",
                                           description: Text("La caméra n'est pas disponible sur cet appareil (ou simulateur)."))
                }

                VStack(spacing: 10) {
                    if looking { ProgressView("Recherche…").padding().background(.thinMaterial, in: Capsule()) }
                    if let p = found {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(p.name).font(.headline)
                            Text("\(Int(p.price)) · stock \(p.stock_quantity)\(p.sku.map { " · \($0)" } ?? "")")
                                .font(.caption).foregroundStyle(.secondary)
                            HStack {
                                if let onFound {
                                    Button("Ajouter") { onFound(p); dismiss() }.buttonStyle(.borderedProminent)
                                }
                                Button("Scanner à nouveau") { found = nil; lastCode = "" }
                            }
                        }
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                        .padding()
                    }
                    if let error {
                        Text(error).font(.footnote).foregroundStyle(.white)
                            .padding().background(Color.red.opacity(0.85), in: Capsule()).padding(.bottom)
                    }
                }
            }
            .navigationTitle("Scanner un produit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } } }
        }
    }

    private func lookup(_ code: String) async {
        looking = true; error = nil
        do { found = try await APIClient.shared.scanProductQr(code) }
        catch { self.error = "Produit introuvable pour ce code."; lastCode = "" }
        looking = false
    }
}

struct QRScannerView: UIViewControllerRepresentable {
    let onScan: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(recognizedDataTypes: [.barcode()],
                                          qualityLevel: .balanced,
                                          isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {
        try? vc.startScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onScan: onScan) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onScan: (String) -> Void
        init(onScan: @escaping (String) -> Void) { self.onScan = onScan }
        func dataScanner(_ dataScanner: DataScannerViewController,
                         didAdd addedItems: [RecognizedItem],
                         allItems: [RecognizedItem]) {
            for item in addedItems {
                if case let .barcode(barcode) = item, let s = barcode.payloadStringValue {
                    onScan(s); break
                }
            }
        }
    }
}
#endif
