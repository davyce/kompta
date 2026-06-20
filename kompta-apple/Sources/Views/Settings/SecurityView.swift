//
//  SecurityView.swift
//  Réglages → Sécurité : double authentification (TOTP), parité web.
//
import SwiftUI
import CoreImage.CIFilterBuiltins

struct SecurityView: View {
    @EnvironmentObject private var auth: AuthManager
    @State private var enabled = false
    @State private var setup: TotpSetup?
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                if enabled {
                    Label("Double authentification activée", systemImage: "checkmark.shield.fill")
                        .foregroundStyle(.green)
                    Button(role: .destructive) { Task { await disable() } } label: {
                        Text("Désactiver la 2FA")
                    }.disabled(busy)
                } else if let s = setup {
                    Text("1. Scannez ce QR code avec votre application d'authentification (Google Authenticator, Authy…).")
                        .font(.footnote)
                    if let qr = qrImage(from: s.qr_uri) {
                        qr.resizable().interpolation(.none)
                            .frame(width: 180, height: 180)
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                    LabeledContent("Clé manuelle") {
                        Text(s.secret).font(.caption.monospaced()).textSelection(.enabled)
                    }
                    Text("2. Entrez le code à 6 chiffres affiché par l'application :").font(.footnote)
                    TextField("Code à 6 chiffres", text: $code)
                        #if os(iOS)
                        .keyboardType(.numberPad)
                        #endif
                    Button { Task { await enable() } } label: {
                        if busy { ProgressView() } else { Text("Activer").bold() }
                    }.disabled(busy || code.count < 6)
                } else {
                    Text("Ajoutez une couche de sécurité : un code temporaire sera demandé à chaque connexion, en plus de votre mot de passe.")
                        .font(.footnote).foregroundStyle(.secondary)
                    Button { Task { await beginSetup() } } label: {
                        if busy { ProgressView() } else { Label("Activer la 2FA", systemImage: "lock.shield") }
                    }.disabled(busy)
                }
                if let error { Text(error).foregroundStyle(.red).font(.caption) }
            } header: {
                Text("Double authentification (2FA)")
            }
        }
        .navigationTitle("Sécurité")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .onAppear { enabled = auth.currentUser?.totp_enabled ?? false }
    }

    private func beginSetup() async {
        busy = true; error = nil
        do { setup = try await APIClient.shared.twoFaSetup() }
        catch { self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription }
        busy = false
    }

    private func enable() async {
        busy = true; error = nil
        do {
            let r = try await APIClient.shared.twoFaEnable(code.trimmingCharacters(in: .whitespaces))
            enabled = r.totp_enabled; setup = nil; code = ""
        } catch {
            self.error = "Code invalide. Réessayez."
        }
        busy = false
    }

    private func disable() async {
        busy = true; error = nil
        do { let r = try await APIClient.shared.twoFaDisable(); enabled = r.totp_enabled }
        catch { self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription }
        busy = false
    }

    private func qrImage(from string: String) -> Image? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)),
              let cg = context.createCGImage(output, from: output.extent) else { return nil }
        #if os(macOS)
        return Image(nsImage: NSImage(cgImage: cg, size: NSSize(width: output.extent.width, height: output.extent.height)))
        #else
        return Image(uiImage: UIImage(cgImage: cg))
        #endif
    }
}
