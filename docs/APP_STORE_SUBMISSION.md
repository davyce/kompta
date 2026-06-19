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

## 3. Conformité confidentialité ✅ (côté code) + 🔑 questionnaire

- ✅ `PrivacyInfo.xcprivacy` embarqué (NSPrivacyTracking=false, UserDefaults/CA92.1)
- ✅ Aucune permission inutile (FaceID/Camera retirées)
- ✅ Pages publiques : `https://VOTRE_DOMAINE/privacy` et `/terms`
- 🔑 ☐ **App Privacy** (questionnaire App Store Connect) — réponses recommandées pour KOMPTA :

| Type de donnée | Collectée ? | Liée à l'utilisateur ? | Tracking ? | Finalité |
|---|---|---|---|---|
| Coordonnées (nom, e-mail, téléphone) | Oui | Oui | Non | Fonctionnement de l'app |
| Identifiants (compte) | Oui | Oui | Non | Authentification |
| Données financières (compta, factures) | Oui | Oui | Non | Fonctionnement de l'app |
| Données d'usage / diagnostics | Si Sentry activé | Oui | Non | Analytics / stabilité |
| Localisation précise (GPS) | **Non** (géoloc serveur IP, pas GPS device) | — | — | — |
| Identifiants publicitaires (IDFA) | **Non** | — | — | — |

- 🔑 ☐ Renseigner l'**URL de politique de confidentialité** : `https://VOTRE_DOMAINE/privacy`
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
- ☐ **Notes pour la review** : ⚠️ **fournir un compte de test** (e-mail + mot de passe d'une entreprise de démo en prod) — sinon rejet immédiat car l'app exige une connexion
- ☐ **Âge** : 17+ probable (contenu financier) — répondre au questionnaire de classification

## 6. Abonnements / paiements (si applicable)

- ☐ KOMPTA encaisse via **Stripe / MTN MoMo** pour des **services B2B** (gestion d'entreprise). Apple **n'exige pas l'In-App Purchase** pour des biens/services consommés hors de l'app (B2B SaaS). Confirmer la qualification ; sinon, prévoir l'IAP.
- ☐ Si abonnement via IAP requis : créer les produits dans App Store Connect + intégrer StoreKit (non implémenté actuellement)
- 🔑 ☐ Renseigner Stripe **live** + `STRIPE_WEBHOOK_SECRET` + MoMo prod côté backend (`.env.production`) avant la review

## 7. Backend prêt pour la review

- 🔑 ☐ Instance AWS provisionnée et **accessible en HTTPS public** (voir `infra/aws/README.md`)
- ☐ App native pointée sur `https://VOTRE_DOMAINE/api` (Réglages → URL du serveur, ou valeur par défaut prod)
- ☐ Compte de démo créé et fonctionnel sur la prod (pour les notes de review)
- ☐ `/privacy` et `/terms` accessibles publiquement sur le domaine prod
- ☐ Backend `health` 200, login OK depuis l'app buildée en Release

## 8. Avant de cliquer "Submit for Review"

- ☐ Build uploadé visible dans App Store Connect (statut "Ready to Submit")
- ☐ Toutes captures + métadonnées + URL privacy remplies
- ☐ Questionnaire App Privacy complété
- ☐ Export Compliance : KOMPTA utilise **HTTPS standard** → "Uses encryption" = Oui, mais **exempt** (chiffrement standard) → pas de doc ERN requise dans la majorité des cas
- ☐ Compte de test renseigné dans les notes
- ☐ Soumettre. Délai review : ~24–48 h en général.

---

## Causes de rejet fréquentes — déjà couvertes ✅
- Icône avec alpha/transparence → **OK, vérifié sans alpha**
- Tailles d'icônes manquantes → **OK, 20 tailles présentes**
- Privacy manifest absent → **OK, embarqué**
- Permissions déclarées sans usage → **OK, nettoyées**

## Causes de rejet à surveiller ⚠️
- **Pas de compte de test** fourni → bloquant (app à connexion obligatoire)
- **Backend injoignable** pendant la review → app non testable = rejet
- App qui **plante** sur le device du reviewer → tester sur appareil réel en Release
- **Mentions de plateformes tierces** ou liens de paiement externes contournant Apple (si IAP requis)
- Politique de confidentialité **inaccessible** ou générique
