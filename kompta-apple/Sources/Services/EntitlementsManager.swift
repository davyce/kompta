//
//  EntitlementsManager.swift
//  Droits d'accès de l'entreprise (essai / plan) — verrouille les modules
//  premium hors offre, en cohérence avec la webapp.
//
import Foundation
import SwiftUI

@MainActor
final class EntitlementsManager: ObservableObject {
    static let shared = EntitlementsManager()

    @Published var entitlements: Entitlements?

    private let api = APIClient.shared

    /// Mappe l'id de module natif → clé d'entitlement backend.
    /// Les modules absents de cette table sont « cœur » (jamais verrouillés).
    static let premiumMap: [String: String] = [
        "hr": "employees",
        "payroll": "payroll",
        "accounting": "accounting",
        "declarations": "declarations",
        "fiscal": "fiscal",
        "ai_writing": "assistants",
        "limule": "limule",
        "projects": "projects",
        "tasks": "kanban",
        "meetings": "meetings",
        "chat": "chat",
        "reports": "reports",
        "reports_teras": "reports-teras",
        "teras": "teras",
        "investments": "investments",
        "groups": "groups",
    ]

    func load() async {
        entitlements = try? await api.myEntitlements()
    }

    func clear() { entitlements = nil }

    /// True si le module est verrouillé pour l'offre courante.
    func isLocked(moduleId: String) -> Bool {
        guard let ent = entitlements else { return false }          // pas chargé → ne bloque pas
        guard let allowed = ent.allowed_modules else { return false } // nil = essai = tout permis
        guard let key = Self.premiumMap[moduleId] else { return false } // module cœur
        return !allowed.contains(key)
    }

    /// Bandeau d'essai (souple le dernier mois) ou état « essai terminé ».
    var showTrialBanner: Bool {
        guard let e = entitlements else { return false }
        return e.soft_warning || (e.locked && !e.trialing)
    }

    var trialBannerText: String {
        guard let e = entitlements else { return "" }
        if e.trialing {
            return "Votre essai Mokonzi offert se termine dans \(e.trial_days_left) jour(s) — passez en Musala ou Mokonzi pour garder tous les modules, sinon vous repasserez automatiquement en Standard (gratuit)."
        }
        return "Votre compte est suspendu. Contactez le support ou passez à une offre pour retrouver l'accès."
    }

    var trialBannerIsCritical: Bool { entitlements?.locked == true }
}
