import SwiftUI

#if os(iOS)
import UIKit

/// Installe un geste de tap au niveau de la fenêtre qui ferme le clavier
/// dès qu'on tape en dehors d'un champ. `cancelsTouchesInView = false` +
/// reconnaissance simultanée garantissent que les boutons et les champs
/// continuent de fonctionner normalement (le tap ferme juste le clavier en plus).
@MainActor
final class KeyboardDismissInstaller: NSObject, UIGestureRecognizerDelegate {
    static let shared = KeyboardDismissInstaller()
    private var installed = false

    func install() {
        guard !installed else { return }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let windows = scenes.flatMap { $0.windows }
        guard let window = windows.first(where: { $0.isKeyWindow }) ?? windows.first else { return }

        let tap = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        tap.cancelsTouchesInView = false   // ne vole pas le tap aux boutons/champs
        tap.delegate = self
        window.addGestureRecognizer(tap)
        installed = true
    }

    @objc private func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    // Le geste cohabite avec les gestes natifs (scroll, tap des contrôles…).
    nonisolated func gestureRecognizer(_ g: UIGestureRecognizer,
                                       shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
}
#endif

extension View {
    /// À placer une fois sur la vue racine : active la fermeture du clavier au tap partout.
    func installKeyboardDismiss() -> some View {
        #if os(iOS)
        return self.onAppear {
            DispatchQueue.main.async { KeyboardDismissInstaller.shared.install() }
        }
        #else
        return self
        #endif
    }
}
