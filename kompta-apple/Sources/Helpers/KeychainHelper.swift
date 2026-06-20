import Foundation

// Token storage via UserDefaults — no keychain prompt on macOS dev builds.
// JWT tokens expire server-side so UserDefaults security level is sufficient.
enum KeychainHelper {
    private static let defaults = UserDefaults.standard

    static func set(_ value: String, key: String) {
        defaults.set(value, forKey: "kompta_\(key)")
    }

    static func get(_ key: String) -> String? {
        defaults.string(forKey: "kompta_\(key)")
    }

    static func delete(_ key: String) {
        defaults.removeObject(forKey: "kompta_\(key)")
    }

    static func clearAll() {
        delete("auth_token")
    }
}
