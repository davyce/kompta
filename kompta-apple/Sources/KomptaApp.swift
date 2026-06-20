import SwiftUI

@main
struct KomptaApp: App {
    @StateObject private var auth  = AuthManager()
    @StateObject private var theme = CompanyTheme()
    @StateObject private var currency = CurrencyManager.shared
    @StateObject private var entitlements = EntitlementsManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(auth)
                .environmentObject(theme)
                .environmentObject(currency)
                .environmentObject(entitlements)
                .task { await currency.refreshRate() }
                .task(id: auth.currentUser?.id) {
                    if auth.currentUser != nil { await entitlements.load() } else { entitlements.clear() }
                }
        }
        #if os(macOS)
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1280, height: 800)
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("À propos de KOMPTA") { }
            }
            CommandGroup(after: .windowArrangement) {
                Button("Nouvelle vente") { }
                    .keyboardShortcut("n", modifiers: [.command, .shift])
            }
        }
        #endif
    }
}
