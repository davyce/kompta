# KOMPTA Client — plan de l'app native dédiée aux clients finaux

> Statut : **planification, aucun code écrit**. Ce document sert de référence pour démarrer le
> développement quand le moment sera venu. Décidé le 2026-07-12 : on construit une app native
> séparée plutôt qu'une PWA, malgré le coût plus élevé (cf. § Décision).

---

## 1. Pourquoi une app séparée (pas un mode dans l'app KOMPTA existante)

L'app `kompta-apple` actuelle (`Kompta` / `KomptaMac`) est conçue pour le **personnel** d'une
entreprise (admin, comptable, caissier…) : elle embarque POS, paie, comptabilité, RBAC par rôle,
`ModuleHub`, StoreKit pour les abonnements entreprise, etc. Ajouter un mode "client final" dedans :

- Confondrait deux publics totalement différents dans une seule UX (un client qui va acheter du
  pain n'a rien à faire dans un écran de configuration d'entreprise).
- Gonflerait inutilement la taille de l'app pour les 100 % d'utilisateurs professionnels qui
  n'ont jamais besoin du mode client.
- Compliquerait le RBAC existant (`RolePermissions`, `EntitlementsManager`) avec une branche
  d'identité complètement différente (`Client`, pas `User`).

**Décision : une app iOS/macOS indépendante, "KOMPTA Client"**, qui ne parle qu'aux endpoints
`/api/portal/*` déjà construits (voir [le module portail web](../frontend/src/pages/portal/)).

## 2. Ce qui existe déjà côté backend (rien à reconstruire)

Tous les endpoints nécessaires existent et sont testés (187/187 tests backend, voir
`backend/app/api/routes_portal.py`) :

| Endpoint | Usage dans l'app |
|---|---|
| `POST /portal/auth/login` | Connexion par email **ou téléphone** (`identifier` + `password`) |
| `POST /portal/auth/logout` | Déconnexion |
| `POST /portal/auth/change-password` | Écran "changer mon mot de passe" |
| `GET /portal/me` | Restaure la session (id + nom du client) |
| `GET /portal/me/company` | Branding de l'entreprise courante (nom, logo) |
| `GET /portal/me/loyalty-overview` | **Agrégation multi-entreprises** : points/tier/remise pour chaque commerce KOMPTA où le client a un compte (déjà l'agrégation qu'on veut dans l'app) |
| `GET /portal/me/invoices` | Liste des factures |
| `GET /portal/me/invoices/{id}` | Détail facture + lignes |
| `GET /portal/me/invoices/{id}/pdf` | Téléchargement PDF |
| `POST /portal/me/invoices/{id}/request-payment` | Instructions Mobile Money |

Point d'architecture important : l'auth web repose sur un **cookie HttpOnly** (`kompta_portal_session`,
anti-XSS). Une app native n'a pas de navigateur/cookie-jar partagé de la même façon — il faudra
soit consommer le `access_token` renvoyé dans le corps de la réponse JSON de login (déjà présent,
`PortalTokenResponse.access_token`) et l'envoyer en `Authorization: Bearer`, soit ajouter un
endpoint de refresh dédié pour les clients natifs. **Recommandation : utiliser le Bearer token
stocké dans le Keychain iOS** (comme le fait déjà `kompta-apple/Sources/Helpers/KeychainHelper.swift`
pour l'app principale) plutôt que le cookie — plus simple côté client natif, et le token a déjà
une expiration (`access_token_expire_minutes`).

## 3. Identité de l'app

| Champ | Valeur proposée |
|---|---|
| Nom affiché | KOMPTA Client (à valider — peut-être juste "KOMPTA" avec un icône différent) |
| Bundle ID iOS | `com.adansonia.kompta.client` |
| Bundle ID macOS | non prioritaire — un client final utilise surtout son téléphone. iOS d'abord, macOS optionnel plus tard |
| Cible | iOS 16+ (aligné sur l'app principale, cf. `project.yml`) |
| Projet | Nouveau dossier `kompta-client-apple/`, XcodeGen comme `kompta-apple/` (déjà validé dans ce repo) |
| Compte Apple Developer | Même compte que `com.adansonia.kompta` (même Team ID) — un nouvel Identifier à créer dans developer.apple.com |

## 4. Écrans (MVP, dans l'ordre de développement)

1. **Connexion** — email ou téléphone + mot de passe (miroir de `PortalLoginPage.tsx`). Badge
   "100 % gratuit". Lien "Pas encore de compte ? Contactez le commerce."
2. **Liste des commerces + fidélité** (`GET /portal/me/loyalty-overview`) — écran d'accueil,
   une carte par entreprise avec points/tier/barre de progression/remise (miroir de la section
   "Ma fidélité" qu'on vient de livrer côté web). C'est l'écran qui justifie une app dédiée
   (agrégation cross-entreprise, alors que le login web classique redirige vers UNE entreprise).
3. **Factures** par commerce sélectionné — liste, détail, téléchargement PDF, demande de paiement
   Mobile Money.
4. **Paramètres** — changer le mot de passe, se déconnecter.
5. *(Plus tard, hors MVP)* Notifications push : nouvelle facture émise, palier de fidélité atteint,
   promotion. Nécessite un service de push (APNs) + un endpoint backend pour enregistrer le device
   token — pas construit aujourd'hui, à scoper séparément.

## 5. Ce qu'il faudra construire côté backend (petit, mais pas encore fait)

- Un moyen d'enregistrer un **device token APNs** par client (nouvelle table + 1-2 endpoints) —
  uniquement nécessaire si on veut les notifications push (étape 5 ci-dessus, pas le MVP).
- Vérifier que `GET /portal/me/loyalty-overview` reste performant si un client a des dizaines de
  comptes (peu probable en pratique, mais pas d'index dédié aujourd'hui sur `Client.email`/`phone`
  pour cette requête cross-entreprise — à surveiller si lenteur constatée).

## 6. Étapes de mise en œuvre (quand on démarre)

1. `xcodegen` : nouveau projet `kompta-client-apple/` (copier la structure de `kompta-apple/project.yml`
   en l'adaptant : un seul target iOS, pas de macOS dans un premier temps).
2. Réutiliser tels quels les fichiers génériques qui ne dépendent pas du contexte "entreprise" :
   `KeychainHelper.swift`, patterns `Loadable`/`AsyncList` de `ModuleHub.swift` (copier le pattern,
   pas le fichier — celui-ci est plein de code entreprise).
3. `APIClient` minimal : uniquement les 9 endpoints du tableau § 2, contre les ~300 méthodes de
   l'app principale.
4. Écran 1 (connexion) → tester contre le backend réel avec le compte `qa@test.local` / entreprise
   "Test Native QA" déjà configuré pour les tests de cette session.
5. Écran 2 (fidélité) → réutiliser exactement la logique de progression de palier déjà validée côté
   web (`_next_tier_info` dans `routes_portal.py`, `_TIER_THRESHOLDS`).
6. Écrans 3-4.
7. Icône + identité visuelle distincte de l'app principale (pour que les utilisateurs ne confondent
   pas les deux apps sur leur téléphone).
8. Soumission App Store — suivre `docs/APP_STORE_SUBMISSION.md` en l'adaptant (nouveau Bundle ID,
   nouvelle fiche App Store Connect, captures d'écran spécifiques à refaire).

## 7. Décision explicitement écartée

**PWA (Progressive Web App)** a été proposée comme alternative plus rapide (pas de build natif, pas
de review App Store, "Ajouter à l'écran d'accueil"). Écartée pour l'instant au profit d'une app
native complète — décision du 2026-07-12. Si le calendrier presse, la PWA reste une option de repli
rapide utilisant exactement le même frontend web déjà construit (`frontend/src/pages/portal/`), sans
travail supplémentaire côté backend.
