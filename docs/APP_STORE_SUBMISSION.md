# Checklist de soumission App Store Connect — KOMPTA

Document de référence pour soumettre **KOMPTA iOS** et **KOMPTA macOS** (cibles `Kompta` / `KomptaMac`, projet `kompta-apple`).

Légende : ☐ à faire · ✅ déjà prêt côté code · 🔑 nécessite vos identifiants/compte (je ne peux pas le faire à votre place).

---

## 0. Pré-requis compte

- 🔑 ☐ Compte **Apple Developer Program** actif (99 $/an) — https://developer.apple.com
- 🔑 ☐ Rôle Admin/Account Holder sur **App Store Connect** — https://appstoreconnect.apple.com
- 🔑 ☐ Identité vérifiée (entité juridique ou personne) + coordonnées fiscales/bancaires si app payante ou abonnements
- 🔑 ☐ Récupérer le **Team ID** (Developer → Membership) → le mettre dans `kompta-apple/project.yml` (`DEVELOPMENT_TEAM`) puis `xcodegen generate`

## 1. Identité de l'app

| Champ | Valeur KOMPTA |
|---|---|
| Bundle ID iOS | `com.adansonia.kompta` ✅ |
| Bundle ID macOS | `com.adansonia.kompta.mac` ✅ |
| Nom affiché | KOMPTA ✅ |
| Version | `1.0` ✅ |
| Build | `1` ✅ |
| Catégorie principale | Business (Économie/Entreprise) |
| Catégorie secondaire | Finance |

- 🔑 ☐ Créer 2 **App Records** dans App Store Connect (un par plateforme, ou une fiche universelle si build unique). Enregistrer les Bundle IDs dans Developer → Identifiers d'abord.

## 2. Signing & build (Xcode)

- 🔑 ☐ Xcode → cible → Signing & Capabilities → **Team** sélectionnée, "Automatically manage signing" coché
- ☐ Retirer `ENABLE_DEBUG_DYLIB=NO` n'est PAS nécessaire pour l'archive (c'est un réglage dev simulateur uniquement)
- 🔑 ☐ Sélectionner destination **Any iOS Device (arm64)** → Product → **Archive**
- 🔑 ☐ Idem pour macOS (destination My Mac) → Archive
- 🔑 ☐ Organizer → **Distribute App** → App Store Connect → Upload
- ☐ Vérifier qu'aucune capability non utilisée n'est déclarée (Push, iCloud, etc. — KOMPTA n'en a pas besoin pour la v1)

> ⚠️ macOS : si distribution App Store, l'app doit être **sandboxée** (App Sandbox capability). Vérifier que les accès réseau sortants et la lecture de fichiers choisis par l'utilisateur (document picker) suffisent — c'est le cas, KOMPTA n'a pas besoin d'accès disque large.

> ⚠️ Guideline 3.1.1 résiduel : `AdminCreateCompanySheet` (création d'entreprise depuis la console super-admin) reste compilée dans la cible iOS, accessible uniquement aux comptes `super_admin`. Le compte de review (`admin_entreprise`, §7) n'y a pas accès — s'assurer qu'il ne soit **jamais** promu super_admin avant/pendant la review.

## 3. Conformité confidentialité ✅ (côté code) + 🔑 questionnaire

- ✅ `PrivacyInfo.xcprivacy` embarqué (NSPrivacyTracking=false, UserDefaults/CA92.1)
- ✅ Aucune permission inutile (FaceID/Camera retirées)
- ✅ Pages publiques : `https://kompta0.com/privacy` et `/terms`
- 🔑 ☐ **App Privacy** (questionnaire App Store Connect) — réponses recommandées pour KOMPTA :

| Type de donnée | Collectée ? | Liée à l'utilisateur ? | Tracking ? | Finalité |
|---|---|---|---|---|
| Coordonnées (nom, e-mail, téléphone) | Oui | Oui | Non | Fonctionnement de l'app |
| Identifiants (compte) | Oui | Oui | Non | Authentification |
| Données financières (compta, factures) | Oui | Oui | Non | Fonctionnement de l'app |
| Données d'usage / diagnostics | Si Sentry activé | Oui | Non | Analytics / stabilité |
| Localisation précise (GPS) | **Non** (géoloc serveur IP, pas GPS device) | — | — | — |
| Identifiants publicitaires (IDFA) | **Non** | — | — | — |

- 🔑 ☐ Renseigner l'**URL de politique de confidentialité** : `https://kompta0.com/privacy`
- ☐ Compléter les coordonnées légales dans `frontend/src/pages/LegalPages.tsx` (bloc `LEGAL`) + relecture juriste

## 4. Captures d'écran (obligatoires)

Formats requis par Apple (PNG/JPEG, RGB, sans transparence, sans coins arrondis simulés) :

| Appareil | Résolution | Obligatoire ? |
|---|---|---|
| iPhone 6.9" (15 Pro Max / 16 Pro Max) | 1290 × 2796 | ✅ oui |
| iPhone 6.5" (11 Pro Max / XS Max) | 1242 × 2688 | recommandé |
| iPad Pro 12.9" (3e–6e gén) | 2048 × 2732 | ✅ oui si app iPad |
| Mac | 1280×800, 1440×900, 2560×1600 ou 2880×1800 | ✅ oui (app macOS) |

- ☐ 3 à 10 captures par appareil. Écrans conseillés : **Tableau de bord, Facturation, Caisse/POS, Limule (IA), Groupes/Tontines**
- 💡 Générables au simulateur : `xcrun simctl io booted screenshot ecran.png` (iPhone 16 Pro Max = 6.9"), puis recadrer si besoin
- ☐ Pas de mockups avec barre d'état fausse ; utiliser de vraies captures

## 5. Métadonnées de la fiche

- ☐ **Nom** (30 car. max) : `KOMPTA`
- ☐ **Sous-titre** (30 car.) : ex. `Gestion d'entreprise & IA`
- ☐ **Description** (4000 car.) : pitch + liste des modules (compta, factures, paie, stocks, POS, groupes/tontines, assistant Limule)
- ☐ **Mots-clés** (100 car.) : ex. `comptabilité,facture,paie,POS,tontine,SYSCOHADA,entreprise,IA`
- ☐ **URL de support** : page d'aide ou e-mail
- ☐ **URL marketing** (optionnel)
- ☐ **Texte promotionnel** (170 car., modifiable sans review)
- ☐ **Coordonnées de contact review** (nom, téléphone, e-mail)
- 🔑 ☐ **Notes pour la review** : coller le compte de test ci-dessous (voir §7) dans le champ « Notes pour la review » d'App Store Connect — **ne jamais committer le mot de passe dans le dépôt git**, il va uniquement dans App Store Connect
- ☐ **Âge** : 17+ probable (contenu financier) — répondre au questionnaire de classification

## 6. Abonnements / paiements (si applicable)

- ✅ **StoreKit 2 implémenté** pour l'abonnement iOS (`Sources/Services/StoreKitManager.swift`, achat + `Transaction.updates` + reçu JWS envoyé au backend). Vérification côté serveur réelle : `POST /payments/apple/verify` (`backend/app/api/routes_payments.py`, `verify_apple_jws` dans `backend/app/services/payments.py`), testée dans `backend/app/tests/test_apple_iap.py`
- ✅ Les produits d'abonnement doivent exister côté **App Store Connect → Fonctionnalités de l'app → Achats intégrés/Abonnements** avec les mêmes identifiants que ceux référencés dans `StoreKitManager.swift` — 🔑 à créer/vérifier manuellement si pas déjà fait
- ☐ KOMPTA encaisse aussi via **Stripe / MTN MoMo** pour les paiements B2B hors abonnement plateforme (factures clients, POS) — ceci reste légitime hors périmètre IAP (ce ne sont pas des achats numériques consommés dans l'app)
- 🔑 ☐ Renseigner Stripe **live** + `STRIPE_WEBHOOK_SECRET` + MoMo prod côté backend (`.env.production`) avant la review

## 7. Backend prêt pour la review

- 🔑 ☐ Instance AWS provisionnée et **accessible en HTTPS public** (voir `infra/aws/README.md`)
- ✅ App native pointée sur `https://kompta0.com/api` par défaut (`APIClient.swift`)
- ✅ **Compte de démo créé et fonctionnel sur la prod** : `appreview@kompta0.com`, rôle `admin_entreprise` (pas super_admin — pas d'accès aux écrans d'administration plateforme), entreprise « Société Démo KOMPTA », abonnement forcé en illimité via la console super-admin (jamais de paywall). Mot de passe à saisir uniquement dans le champ « Notes pour la review » d'App Store Connect (§5), jamais dans ce dépôt.
- 🔑 ☐ `/privacy` et `/terms` accessibles publiquement sur `kompta0.com` — à vérifier après déploiement
- 🔑 ☐ Backend `health` 200, login OK depuis l'app buildée en Release — à vérifier après déploiement

## 8. Avant de cliquer "Submit for Review"

- ☐ Build uploadé visible dans App Store Connect (statut "Ready to Submit")
- ☐ Toutes captures + métadonnées + URL privacy remplies
- ☐ Questionnaire App Privacy complété
- ☐ Export Compliance : KOMPTA utilise **HTTPS standard** → "Uses encryption" = Oui, mais **exempt** (chiffrement standard) → pas de doc ERN requise dans la majorité des cas
- 🔑 ☐ Compte de test (`appreview@kompta0.com` + mot de passe) renseigné dans les notes de review
- ☐ Soumettre. Délai review : ~24–48 h en général.

---

## Causes de rejet fréquentes — déjà couvertes ✅
- Icône avec alpha/transparence → **OK, vérifié sans alpha**
- Tailles d'icônes manquantes → **OK, 20 tailles présentes**
- Privacy manifest absent → **OK, embarqué**
- Permissions déclarées sans usage → **OK, nettoyées**

## Causes de rejet à surveiller ⚠️
- **Pas de compte de test** fourni → ✅ compte `appreview@kompta0.com` créé en prod (voir §7) ; reste à coller mot de passe + email dans les notes de review avant soumission
- **Backend injoignable** pendant la review → app non testable = rejet
- App qui **plante** sur le device du reviewer → tester sur appareil réel en Release
- **Mentions de plateformes tierces** ou liens de paiement externes contournant Apple (si IAP requis)
- Politique de confidentialité **inaccessible** ou générique
