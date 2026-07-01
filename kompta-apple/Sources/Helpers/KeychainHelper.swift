import Foundation
import Security

/// Stockage sécurisé via le vrai Trousseau iOS/macOS (Security framework).
///
/// Contrairement à UserDefaults, le Trousseau : survit à la désinstallation de
/// l'app (kSecAttrAccessibleAfterFirstUnlock), n'est pas lisible par d'autres
/// apps, et permet à iOS de proposer la sauvegarde/le remplissage automatique
/// des identifiants dans le porte-clés système (associé aux TextField marqués
/// .textContentType(.username)/.password sur l'écran de connexion).
enum KeychainHelper {
    private static let service = "com.adansonia.kompta.auth"

    private static func query(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    static func set(_ value: String, key: String) {
        guard let data = value.data(using: .utf8) else { return }
        var attrs = query(key)
        attrs[kSecValueData as String] = data
        attrs[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

        let status = SecItemAdd(attrs as CFDictionary, nil)
        if status == errSecDuplicateItem {
            SecItemUpdate(query(key) as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        }
    }

    static func get(_ key: String) -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: String) {
        SecItemDelete(query(key) as CFDictionary)
    }

    static func clearAll() {
        delete("auth_token")
    }
}
