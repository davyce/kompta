# KOMPTA — Plateforme de gestion d'entreprise intelligente

> ERP IA tout-en-un pour PME, ONG, tontines, mutuelles et collectifs de la zone CEMAC.
> **Comptabilité partie double SYSCOHADA** · **POS** · **Facturation TVA** · **Paie CNSS + IRPP** ·
> **Module Groupes & Organisations** · **Assistant IA Limule** · **Mode offline-first léger**.
>
> Stack : **FastAPI 0.115** + **SQLAlchemy 2** + **SQLite/Postgres** · **React 18** + **TS** + **Vite 8** + **Tailwind** ·
> **iOS + macOS natifs** (SwiftUI, `kompta-apple/`).
> Argent en **centimes entiers** (BigInt) · **paiements réels** Stripe (carte) + MTN Mobile Money.
> Déploiement production **gratuit** via **Cloudflare Tunnel** (domaine `kompta0.com`, un seul hostname).
> 187 tests backend + tests unit frontend · CI/CD GitHub Actions.

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Architecture](#architecture)
3. [Prérequis](#prérequis)
4. [Installation rapide](#installation-rapide)
5. [Variables d'environnement](#variables-denvironnement)
6. [Lancement en développement](#lancement-en-développement)
7. [Test à distance / iPhone — tunnel Cloudflare](#test-à-distance--iphone--tunnel-cloudflare)
8. [Production zéro-démo](#production-zéro-démo)
9. [Modules applicatifs](#modules-applicatifs)
10. [Module Groupes & Organisations](#module-groupes--organisations)
11. [Moteur comptable SYSCOHADA partie double](#moteur-comptable-syscohada-partie-double)
12. [API — Endpoints clés](#api--endpoints-clés)
13. [RBAC — Rôles et accès](#rbac--rôles-et-accès)
14. [Sécurité](#sécurité)
15. [TERAS Connect](#teras-connect)
16. [Limule — IA intégrée](#limule--ia-intégrée)
17. [Tests & CI/CD](#tests--cicd)
18. [Déploiement](#déploiement)
19. [Comptes de test](#comptes-de-test)
20. [Changelog](#changelog)
21. [Licence](#licence)

---

## Fonctionnalités

| Domaine | Détail |
|---|---|
| **🏠 Tableau de bord** | KPIs temps réel, graphiques, rafraîchissement auto 30 s, résumé IA |
| **👥 RH & Employés** | Fiches, contrats IA, organigramme, présences, congés, profil détaillé |
| **💰 Paie** | Bulletins, **CNSS 4 % salarié + 8 % patronal**, **IRPP progressif**, idempotence période, export PDF |
| **🧾 Facturation** | Factures **HT/TVA/TTC**, **numérotation atomique anti-collision**, immutabilité facture payée, avoirs, export PDF |
| **📦 Inventaire** | Produits, stock temps réel, **décrément atomique anti-TOCTOU**, alertes seuil bas, mouvements |
| **🚚 Achats & Fournisseurs** | Fournisseurs, bons de commande (cycle draft → approuvé → commandé → reçu → payé), **stock valorisé au CMP** (coût moyen pondéré), écritures comptables auto à la réception (Dr 31 Stocks / Dr 60 Achats / Cr 401 Fournisseurs) |
| **🎯 CRM léger** | Pipeline d'opportunités (nouveau → qualifié → proposition → négociation → gagné/perdu), résumé par étape, conversion en facture — **web + iOS/macOS natifs** |
| **🛒 POS / Caisse** | Caisse enregistreuse, reçu détaillé, écriture comptable auto Dr Trésorerie / Cr 70, export CSV |
| **🏛️ Comptabilité partie double** | **SYSCOHADA-lite** (18 comptes), `JournalEntry` équilibrées garanties (Σdébit=Σcrédit), grand livre, balance, contre-passation immuable |
| **💳 Transactions** | Relevé comptable unifié (factures + POS + imports), filtres, analyse Limule |
| **🏦 Rapprochement bancaire** | Import relevé CSV, matching automatique (rapproché/suggéré/non-rapproché), confirmation/création/ignore ligne par ligne — **web + iOS/macOS natifs** |
| **🎁 Portail client** | Espace 100 % gratuit pour les clients (`/portal`), connexion par **email ou téléphone**, factures + PDF + demande de paiement Mobile Money, **fidélité agrégée en temps réel sur toutes les entreprises KOMPTA fréquentées** (points, palier, remise) |
| **🏢 Groupes & Organisations** | Tontines, mutuelles, ONG, clubs, asso : membres, **bureau & mandats**, cotisations, caisse, **chat temps réel WS**, calendrier, anniversaires, votes, IA dédiée |
| **📄 Documents** | Upload, classification IA, analyse, rattachement employé/groupe |
| **📅 Agenda** | Réunions, ordre du jour, participants, liens visio, intégration Journal |
| **✅ Tâches** | Kanban board, filtres, recherche, upload de preuves (image/vidéo/PDF) |
| **🇨🇲 Déclarations fiscales** | Génération complète Limule (TVA, IS, CNPS, fiscal), PDF, checklist conformité |
| **📔 Journal** | Notes quotidiennes IA connectées aux réunions et tâches du jour |
| **🛡️ TERAS Connect** | Scoring conformité, alertes réglementaires, recommandations IA, module activable |
| **🤖 Limule (IA)** | Assistant streaming, garde-fous anti-injection, **lecture seule**, citations sources, analyses narratives + Regard CEMAC |
| **✍️ Rédaction IA** | Emails, courriers, contrats, clauses assistés par Limule |
| **📊 Rapports** | Hub analytique, KPI Encaissé/Facturé/En attente, export PDF/CSV/Excel |
| **⚙️ Paramètres** | Profil entreprise, devise multi-devises, utilisateurs, RBAC, modules, journal d'audit |

---

## Architecture

```
kompta/
├── backend/                        # API FastAPI
│   ├── app/
│   │   ├── main.py                 # Point d'entrée, CORS, routers
│   │   ├── config.py               # Settings (pydantic-settings)
│   │   ├── models/
│   │   │   └── domain.py           # Tous les modèles SQLAlchemy
│   │   ├── schemas/
│   │   │   └── domain.py           # Schémas Pydantic (Read/Create/Update)
│   │   ├── db/
│   │   │   ├── session.py          # Engine SQLite + SessionLocal
│   │   │   └── init_db.py          # Seed + migrations SQLite automatiques
│   │   ├── api/
│   │   │   ├── routes.py           # Routes principales (auth, RH, paie, etc.)
│   │   │   └── routes_extra.py     # Tâches, Limule, TERAS, chat, réunions
│   │   └── services/
│   │       ├── deepseek.py         # Streaming LLM (DeepSeek)
│   │       ├── teras.py            # Moteur conformité TERAS
│   │       └── documents.py        # Upload & analyse documents IA
│   ├── storage/                    # Fichiers uploadés (gitignored)
│   │   ├── task_proofs/            # Preuves de tâches (image/vidéo/PDF)
│   │   └── products/               # Images produits
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/                       # SPA React 18
    ├── src/
    │   ├── app/
    │   │   ├── Shell.tsx            # Layout principal + navigation + LimuleStatus
    │   │   ├── AuthContext.tsx       # Contexte auth JWT
    │   │   └── routes.tsx           # React Router v6
    │   ├── components/
    │   │   ├── Copilot.tsx          # Limule — assistant IA flottant (12 fonctionnalités)
    │   │   ├── LimuleAvatar.tsx     # Avatar animé Limule
    │   │   ├── OnboardingWizard.tsx # 8 étapes tutoriel novice
    │   │   ├── Charts.tsx           # LineAreaChart, ScoreRing, BarChart
    │   │   ├── Panel.tsx            # Carte avec titre/action
    │   │   ├── FormField.tsx        # Inputs, Select, TextArea
    │   │   └── StatusBadge.tsx      # Badge coloré
    │   ├── pages/
    │   │   ├── DashboardPage.tsx    # KPIs, graphiques, résumé IA
    │   │   ├── EmployeesPage.tsx
    │   │   ├── EmployeeProfilePage.tsx
    │   │   ├── PayrollPage.tsx
    │   │   ├── InvoicesPage.tsx
    │   │   ├── InventoryPage.tsx
    │   │   ├── PosPage.tsx
    │   │   ├── DocumentsPage.tsx
    │   │   ├── CalendarPage.tsx
    │   │   ├── WorkPage.tsx         # Tâches Kanban + upload preuves
    │   │   ├── DeclarationsPage.tsx
    │   │   ├── AccountingFinancePage.tsx
    │   │   ├── ReportsHubPage.tsx   # Hub d'analyses
    │   │   ├── ReportsTerasPage.tsx # TERAS Connect
    │   │   ├── AssistantsPage.tsx   # Rédaction IA
    │   │   ├── SettingsPage.tsx     # Paramètres + modules + audit
    │   │   └── LoginPage.tsx
    │   ├── services/
    │   │   └── api.ts               # Client HTTP centralisé (fetch + FormData)
    │   └── utils/
    │       └── format.ts            # money, shortDate, percent…
    ├── package.json
    └── .env.example
│
└── kompta-apple/                   # Apps natives iOS + macOS (SwiftUI, projet XcodeGen)
    ├── project.yml                  # Génère Kompta.xcodeproj (`xcodegen generate`)
    └── Sources/
        ├── Models/DomainModels.swift    # Modèles Codable (miroir des schémas backend)
        ├── Services/APIClient.swift     # Client HTTP partagé iOS + macOS
        └── Views/
            ├── Shell/                   # Navigation, hub de modules
            └── Modules/                 # Un fichier par domaine (BusinessViews, FinanceViews,
                                          # PurchasesViews, InventoryView, GroupsViews, …)
```

---

## Prérequis

| Outil | Version minimale |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |
| Git | 2.x |

> Aucune base de données externe requise — SQLite est embarqué et migre automatiquement.

---

## Installation rapide

### 1. Cloner le dépôt

```bash
git clone https://github.com/davyce/kompta.git
cd kompta
```

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows : .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # puis éditer .env avec vos clés
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
```

---

## Variables d'environnement

### `backend/.env`

```dotenv
# ── JWT ─────────────────────────────────────────────────────
SECRET_KEY=changeme_32_chars_min          # clé HMAC-SHA256 (openssl rand -hex 32)
ACCESS_TOKEN_EXPIRE_MINUTES=1440          # 24 h

# ── IA / Limule ──────────────────────────────────────────────
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx      # https://platform.deepseek.com
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# ── TERAS (optionnel — moteur local si absent) ────────────────
TERAS_API_KEY=

# ── App ──────────────────────────────────────────────────────
APP_ENV=development                       # development | production
API_PREFIX=/api
ALLOWED_ORIGINS=http://127.0.0.1:3001,http://localhost:3001
```

> ⚠️ Ne jamais committer `backend/.env`. Il est exclu par `.gitignore`.

### `frontend/.env`

```dotenv
VITE_API_URL=http://127.0.0.1:8010/api
```

---

## Lancement en développement

### Terminal 1 — Backend

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

La base `kompta.db` est créée et seedée automatiquement au premier lancement.

### Terminal 2 — Frontend

```bash
cd frontend
npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://127.0.0.1:3001 |
| API REST | http://127.0.0.1:8010/api |
| Swagger UI | http://127.0.0.1:8010/docs |
| Health check | http://127.0.0.1:8010/api/health |

### Build de production frontend

```bash
cd frontend
npm run build          # → frontend/dist/
npm run preview        # serveur preview local
```

---

## Test à distance / iPhone — tunnel Cloudflare

Pour tester l'app depuis un iPhone, une démo client ou n'importe quel appareil distant,
sans déploiement, lance le tunnel inclus :

```bash
# Pré-requis (Mac/Linux) :
brew install cloudflared

# Terminal 3 — un SEUL tunnel : le frontend appelle /api en relatif,
# proxifié par Vite vers le backend local. Pas besoin de 2e tunnel.
./tunnel.sh
```

Le script affiche une URL `https://*.trycloudflare.com` à ouvrir dans Safari iOS.
Créez ou utilisez une vraie entreprise depuis l'écran de connexion. Le tunnel ne
crée plus de société ou d'identifiants démo automatiquement.

Le tunnel utilise `--http-host-header localhost` pour contourner le contrôle
`allowedHosts` de Vite 8 (sinon Vite renvoie 403 sur les hôtes externes).

---

## Production zéro-démo

Pour un déploiement **sans aucune donnée fictive** (zéro simulacre) :

```bash
SECRET_KEY="<clé-forte-aléatoire>" \
SUPER_ADMIN_PASSWORD="<mot-de-passe-fort>" \
SUPER_ADMIN_EMAIL="admin@masociete.com" \
DATABASE_URL="postgresql://user:pwd@host/db" \
./start-production.sh
```

Le démarrage en mode production :

- **N'exécute PAS** `seed_demo_data` (pas de société/employé/facture fictifs)
- **Garantit** la création d'un super-admin plateforme (configurable via env)
- **Active HSTS** (`Strict-Transport-Security`) et les en-têtes CSP/XFO/XCTO/Referrer-Policy
- **Refuse de démarrer** si `SECRET_KEY=dev-kompta-secret` (clé par défaut bloquée)

Le super-admin se connecte ensuite via `/admin` et enregistre les vraies entreprises
via `POST /api/auth/register-company` — aucune donnée fictive n'est insérée.

---

## Modules applicatifs

### Tableau de bord

- KPIs consolidés : **Encaissé** (montant réellement perçu), Total facturé, En attente, Trésorerie réelle
- Graphiques évolution par période (Mois / Trimestre / Année)
- Donut Canaux de vente et Structure des dépenses
- **Rafraîchissement automatique toutes les 30 secondes**
- Bouton **Résumé IA** (Limule) — analyse directionnelle en un clic
- Impact immédiat des paiements factures et ventes POS sur tous les KPIs

### RH & Employés

- Création rapide avec génération automatique du compte employé
- Mot de passe temporaire affiché **une seule fois** (force changement au 1er login)
- Fiche détaillée : identité, contrat, rémunération, accès, actions rapides
- Génération de contrat via IA (DeepSeek) + stockage Documents
- Export de la fiche employé

### Paie

- Calcul net/brut avec déductions configurables
- Détection d'anomalies (heures, primes, absences)
- **Téléchargement PDF bulletin de salaire** par employé

### Facturation

- Devis → Facture → Avoir
- Suivi statuts : brouillon / envoyé / payé / en retard
- **Paiement multi-modes** : espèces, carte, mobile money, virement, PayPal, Zola QR
- **BankTransaction automatique** à chaque encaissement → impact immédiat sur trésorerie et Dashboard
- Export PDF, envoi simulé

### POS — Point de vente

- Interface caisse avec recherche produit
- **Reçu détaillé** : liste articles + quantités + prix + mode de paiement
- **BankTransaction automatique** à chaque vente → trésorerie et transactions mises à jour en temps réel
- **Export CSV des ventes** avec filtres date et produit

### Transactions

- Relevé comptable unifié : toutes les entrées/sorties (factures, POS, imports, manuelles)
- **Labels de source** : Facturation, Caisse POS, Relevé bancaire, CSV, Manuel
- Filtres par source, catégorie, date
- Import de relevés bancaires avec analyse IA (Limule)

### Inventaire

- Stock en temps réel
- **Alertes produits sous seuil** (niveau de réapprovisionnement)
- Mouvements d'entrée/sortie

### Documents

- Upload avec classification automatique par IA
- Animation feedback pendant l'analyse IA
- Rattachement à un employé ou à l'entreprise
- Téléchargement et suppression

### Tâches (WorkPage)

- Kanban : À faire / En cours / Terminé
- **Recherche texte** et **filtres** (priorité, responsable)
- Colonne "Terminé" paginée (chargement par tranches pour des centaines de tâches)
- **Détail tâche** avec consignes/description formatées
- **Upload de preuve** : image, vidéo (MP4/MOV/WebM) ou PDF — max 50 Mo
- Prévisualisation avant envoi + lecteur intégré dans le modal
- Badge "Justificatif requis" sur les cartes concernées
- Indicateur "En retard" si échéance dépassée

### Déclarations

- **6 types** : Fiscale, Sociale CNPS, TVA, IS, Bailleur, Statistique
- **Préparer** : audit rapide — checklist de conformité + pièces manquantes
- **Générer** : Limule produit un document déclaratif complet (4 000 tokens) :
  - En-tête officiel, tableaux de montants calculés, détail ligne par ligne
  - Pièces justificatives à joindre, risques et points d'attention
  - Instructions de dépôt et recommandations d'optimisation
- **Téléchargement PDF** de chaque déclaration générée
- Scores TERAS par domaine avec barres de progression
- Icône Limule native sur le bouton de génération

### Journal (Notes)

- Notes quotidiennes générées automatiquement par Limule
- **Connectées aux réunions du jour** (réunions filtrées par date et affichées)
- Vue 7 jours glissants avec tâches et réunions

### TERAS Connect

- Analyse conformité réglementaire multi-domaines (RH, Paie, Déclarations, Documents)
- Score global 0-100 avec historique sur 12 mois
- Alertes classées `critique` / `attention` / `info`
- Recommandations IA priorisées par impact
- Conversion alerte → tâche en un clic
- Export PDF rapport TERAS
- **Module activable/désactivable** depuis Paramètres → Modules

### Limule — IA intégrée

- **Assistant flottant** disponible sur toutes les pages
- Chat avec **streaming SSE temps réel**
- Suggestions contextuelles selon la page courante
- **Création de tâche 1-clic** : si Limule est confiant sur l'intention, création directe sans modal
- **Analyses narratives approfondies** : structure obligatoire en 5 parties (état des lieux → causes → impacts → recommandations → actions), minimum 400 mots, chiffres et benchmarks cités
- **Bloc "Regard CEMAC"** : avis systématique sur la conjoncture zone CEMAC à la fin de chaque analyse
- Budget de tokens adaptatif : 3 500 tokens pour analyses lourdes, 2 200 pour réponses standard
- **Historique multi-tour** : recherche, suppression unitaire, sélection multiple, effacement global
- Mode rapport plein écran + épinglage de messages
- Quick replies contextuels par intention
- Branchement de conversation (reprendre à un point précis)
- Mémoire de la semaine (résumé automatique des échanges récents)
- Mode IA fail-closed hors environnement local : si le fournisseur IA est absent
  ou indisponible, les réponses sensibles ne sont pas simulées.

### Paramètres

- Profil entreprise (nom, RCCM, NIF, adresse)
- Gestion utilisateurs + RBAC
- **Activation/désactivation des modules** (TERAS, etc.)
- **Journal d'audit** : toutes les actions tracées par utilisateur/IP/module
- Changement de mot de passe
- Accès direct depuis les bannières de désactivation de module

---

## Module Groupes & Organisations

Ce module dédié couvre les **tontines**, **mutuelles**, **ONG**, **associations**,
**églises**, **clubs sportifs**, **coopératives**, **groupes d'épargne** et tout
collectif gérant cotisations, paiements et activités. Il réutilise l'authentification,
le multi-tenant, et le moteur comptable de KOMPTA.

**6 phases livrées (G1 → G6, 17 pages React, 36 endpoints backend) :**

| Phase | Contenu |
|---|---|
| **G1 — Fondation** | Modèles `OrganizationGroup`, `GroupMember`, `GroupRole`, **historique des mandats** (`GroupLeadershipHistory`), permissions internes (Président, Trésorier, Secrétaire…), audit log dédié |
| **G2 — Finance** | Plans de cotisation, paiements complets/partiels/en retard, validation trésorier, dépenses approuvées, dashboard caisse. **Chaque validation génère automatiquement une écriture comptable équilibrée** (Dr Trésorerie / Cr 75 ou Dr 62 / Cr Trésorerie) |
| **G3 — Activités** | Réunions avec PV, activités, **calendrier agrégé** (réunions + activités + anniversaires + votes + échéances), détection auto des anniversaires, rappels multi-canaux, votes avec dépouillement |
| **G4 — Chat & médias** | Salons général/bureau/finance/événement (visibilité par rôle), messages text/image/vidéo/audio/document/GIF, réactions emoji, soft-delete, upload sécurisé (50 Mo max, MIME validé), WebSocket temps réel |
| **G5 — IA & rapports** | Assistant IA par groupe (Limule scopé), **permissions financières par rôle** (un membre simple ne peut pas demander le solde), résumés de chat, génération de rapports texte/PDF, analyse de paiements |
| **G6 — Frontend** | 17 pages React (`/groups`, dashboard, membres, leadership, cotisations, transactions, dépenses, calendrier, réunions, anniversaires, chat, documents, votes, rapports, IA, paramètres) |

Les comptes par défaut générés à la création d'un groupe :
- 11 rôles internes (Président, Vice-président, Secrétaire, Trésorier, Commissaire,
  Administrateur, Modérateur, Membre simple, Auditeur, Responsable événement,
  Responsable communication)
- Le créateur du groupe devient automatiquement **membre + Président**
- Un mandat initial est ouvert dans `GroupLeadershipHistory`

---

## Moteur comptable SYSCOHADA partie double

KOMPTA inclut un vrai moteur comptable en **partie double** avec un plan SYSCOHADA-lite
(18 comptes des classes 1 à 7). **Montants en centimes entiers** (BigInteger) — pas
de Float, pas de dérive d'arrondi.

### Garanties

- **Σdébit = Σcrédit** vérifié à chaque écriture (rejet HTTP 400 sinon, testé)
- **Immutabilité** : aucune écriture posted ne peut être modifiée → correction par
  **contre-passation** (`POST /accounting/entries/{id}/reverse`)
- **Numérotation séquentielle atomique** (compteur persistant sur `Company`, pas
  dérivée de `COUNT(*)`) → ni collision concurrente, ni réutilisation après suppression
- **Auto-posting** : chaque vente POS, règlement de facture, cotisation de groupe et
  dépense de groupe génère son écriture équilibrée automatiquement
- **2 modes par société** : `simple` (petit commerce, écritures cachées) ou `full`
  (journal + balance SYSCOHADA visibles, écritures manuelles autorisées)

### Plan SYSCOHADA-lite (extrait)

| Classe | Compte | Libellé |
|---|---|---|
| 1 | 101 | Capital |
| 1 | 12 | Résultat de l'exercice |
| 4 | 411 | Clients |
| 4 | 443 | État — TVA collectée |
| 4 | 445 | État — TVA déductible |
| 5 | 521 | Banque |
| 5 | 531 | Mobile Money |
| 5 | 571 | Caisse espèces |
| 6 | 60 / 62 / 64 / 66 | Achats / Services / Impôts / Charges personnel |
| 7 | 70 / 75 | Ventes / Autres produits (cotisations, dons) |

### Endpoints

| Méthode | Endpoint | Rôle |
|---|---|---|
| GET | `/accounting/mode` | mode comptable (simple/full) |
| PATCH | `/accounting/mode` | bascule simple ⇄ full |
| GET | `/accounting/accounts` | plan comptable de la société |
| GET | `/accounting/journal` | journal (en-têtes + lignes) |
| GET | `/accounting/balance` | balance générale équilibrée |
| POST | `/accounting/entries` | écriture manuelle (équilibre exigé) |
| POST | `/accounting/entries/{id}/reverse` | contre-passation |

---

## API — Endpoints clés

### Auth

| Méthode | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Connexion → JWT |
| POST | `/api/auth/register` | Création compte (admin) |
| POST | `/api/auth/request-reset` | Demande reset mot de passe |
| POST | `/api/auth/reset-password` | Confirme reset avec token |

### Employés

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/employees` | Liste des employés |
| POST | `/api/employees` | Créer un employé |
| GET | `/api/employees/{id}` | Détails employé |
| PATCH | `/api/employees/{id}` | Modifier |
| GET | `/api/employees/{id}/contract` | Télécharger contrat |

### Tâches

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/tasks` | Liste des tâches |
| POST | `/api/tasks` | Créer une tâche |
| PATCH | `/api/tasks/{id}` | Modifier (statut, priorité…) |
| DELETE | `/api/tasks/{id}` | Supprimer |
| POST | `/api/tasks/{id}/proof` | Uploader une preuve (image/vidéo/PDF) |

### Paie

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/payroll/payslips` | Liste des bulletins |
| GET | `/api/payroll/payslips/{id}/download` | Export PDF bulletin |
| GET | `/api/payroll/anomalies` | Anomalies détectées |

### POS & Inventaire

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/pos/sales` | Liste des ventes |
| GET | `/api/pos/sales/export-csv` | Export CSV ventes |
| GET | `/api/inventory/products` | Liste produits |
| GET | `/api/inventory/low-stock` | Produits sous seuil |

### TERAS

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/teras/alerts` | Alertes de conformité |
| GET | `/api/teras/scores` | Historique scores |
| GET | `/api/teras/recommendations` | Recommandations IA |
| POST | `/api/teras/analyze/company` | Lancer analyse globale |
| POST | `/api/teras/analyze/rh` | Analyse domaine RH |
| POST | `/api/teras/analyze/payroll` | Analyse domaine Paie |
| GET | `/api/teras/export-report` | Export PDF rapport TERAS |

### IA / Limule

| Méthode | Endpoint | Description |
|---|---|---|
| POST | `/api/limule/chat/stream` | Chat SSE streaming |
| GET | `/api/limule/chat/history` | Historique conversations |
| DELETE | `/api/limule/interactions/{id}` | Supprimer un échange |
| DELETE | `/api/limule/chat/history` | Effacer tout l'historique |
| GET | `/api/ai/health` | Statut + latence LLM |

### Modules

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/modules` | Liste des modules |
| POST | `/api/modules/{key}/toggle` | Activer/désactiver un module |

---

## RBAC — Rôles et accès

| Rôle | Accès |
|---|---|
| `superadmin` | Accès total toutes sociétés |
| `admin` | Accès total sa société |
| `comptable` | Facturation, paie, déclarations, rapports |
| `rh` | RH, paie, documents RH |
| `manager` | Lecture + tâches + réunions |
| `employe` | Bulletin de salaire, profil, tâches assignées, preuve |
| `caissier` | POS uniquement |

> Les routes API vérifient le rôle via le token JWT à chaque requête.

---

## Sécurité

| Couche | Mesure |
|---|---|
| **Mots de passe** | PBKDF2-HMAC-SHA256, **200 000 itérations**, sel unique, comparaison à temps constant (`hmac.compare_digest`) |
| **2FA** | TOTP (pyotp) **réellement appliqué au login** (pas seulement décoratif) |
| **Anti-brute-force** | Rate-limit login : **429 après 5 échecs** dans une fenêtre de 5 min, lockout 15 min |
| **Tokens** | HMAC-SHA256 avec expiration 8 h + **`token_version`** sur User → logout/changement de mot de passe invalide tous les tokens existants |
| **Multi-tenancy** | **71 contrôles `company_id`** dans routes.py, isolation vérifiée (404 inter-entreprise) y compris pour les groupes et le contexte IA |
| **Upload** | Validation MIME (10 types), taille max 50 Mo, stockage par groupe |
| **En-têtes HTTP** | CSP, X-Frame-Options=DENY, X-Content-Type-Options=nosniff, Referrer-Policy, Permissions-Policy, **HSTS en prod** |
| **Audit** | `AuditLog` + `AccessAuditLog` unifiés dans `GET /audit-logs` (paginé, filtrable) |
| **Garde-fous IA** | Limule en **lecture seule**, anti-prompt-injection, citations sources obligatoires, scoping `company_id`, permissions financières par rôle |
| **Secrets** | `.env` gitignoré et non suivi par git, `SECRET_KEY=dev-kompta-secret` refuse de démarrer en production |

---

## Tests & CI/CD

```bash
# Backend (pytest)
cd backend && .venv/bin/python -m pytest -q
# → 106 passed

# Frontend (Vitest)
cd frontend && npm run test
# → 21 tests passed

# E2E smoke (Playwright) — nécessite backend+frontend lancés
cd frontend && BASE_URL=http://127.0.0.1:3000 npx playwright test
# → 6 passed (desktop + mobile : login, dashboard, pas d'overflow, 0 erreur console)
```

> Le **smoke E2E** (Playwright, Chromium desktop + viewport mobile) tourne en CI
> contre une **base éphémère jetable** (`SEED_DEMO=true`, `e2e.db`) — il ne touche
> jamais de données réelles. Volontairement minimal (login + routes clés + détection
> d'erreurs console) pour rester rapide et non-flaky.

### Couverture des tests backend (42 tests)

- `test_api.py` — flux historiques (produits, factures, RH, contrats…)
- `test_audit_fixes.py` — numérotation factures, TVA, immutabilité, avoirs, stock atomique POS, IRPP, idempotence paie, anti-brute-force login, révocation tokens, garde-fous IA
- `test_accounting.py` — équilibre Σdébit=Σcrédit, exactitude centimes, plan SYSCOHADA, écritures POS/factures, rejet écritures déséquilibrées
- `test_groups.py` — création groupe, membres, rôles, **changement de bureau avec historique**, isolation inter-entreprise
- `test_groups_g2_g5.py` — cotisations + validation comptable auto, dépenses + écriture auto, calendrier, anniversaires, votes, chat, IA permissions

### Tests E2E mobile (Playwright viewport iPhone 14)

- `smoke.spec.ts` — login admin, accès Groupes, accès non authentifié, super-admin → `/admin`, 404
- `mobile.spec.ts` — bottom-nav visible + FAB ne la cache pas, AdminShell avec hamburger, **pas de scroll horizontal sur `/groups`**

### CI/CD GitHub Actions

`.github/workflows/ci.yml` à 3 jobs déclenchés sur push + PR :

- **backend** : pytest sur SQLite frais (106 tests)
- **frontend** : `tsc --noEmit` + Vitest + build production
- **e2e** : Playwright smoke (Chromium) contre une base éphémère seedée — login, routes clés, erreurs console

---

## TERAS Connect

TERAS est le moteur de conformité réglementaire intégré à KOMPTA.

### Comment ça marche

1. **Analyse** — Cliquer "Lancer une analyse" : TERAS examine RH, paie, déclarations et documents
2. **Score** — Un score global 0-100 est calculé par domaine (poids configurables)
3. **Alertes** — Les non-conformités génèrent des alertes classées `critique` / `attention` / `info`
4. **Recommandations** — L'IA produit des actions concrètes priorisées par impact
5. **Suivi** — Chaque alerte peut être convertie en tâche assignable à un collaborateur

### Seuils de score

| Score | Niveau | Signification |
|---|---|---|
| 85 – 100 | 🟢 Élevé | Conformité maîtrisée |
| 65 – 84 | 🟡 Moyen | Points d'attention |
| 0 – 64 | 🔴 Critique | Action urgente requise |

### Mode local vs API TERAS réelle

En local, TERAS utilise son moteur embarqué (heuristiques + DeepSeek).
Pour brancher l'API TERAS officielle, renseigner `TERAS_API_KEY` dans `backend/.env`.

---

## Limule — IA intégrée

Limule est l'assistant IA de KOMPTA, propulsé par **DeepSeek** (`deepseek-chat`).

### Capacités

- **Prédictions économiques** — prévisions CA, trésorerie, tendances 30/60/90 jours
- **Conseils d'investissement** — embauche, stock, expansion : impact chiffré et retour
- **Analyse sectorielle** — benchmarks PME, conjoncture CEMAC, risques de marché
- **Risques & conformité TERAS** — alertes, score, actions correctives
- **RH & masse salariale** — coûts, conformité CNPS, prévisions de paie
- **Rédaction professionnelle** — emails, notes, clauses, courriers

### Variables contextuelles disponibles dans les prompts

```
{entreprise}      Nom de la société
{teras_score}     Score TERAS courant
{effectif}        Nombre d'employés actifs
{mois}            Mois courant en français
{user}            Prénom de l'utilisateur connecté
```

### Streaming SSE

Le backend utilise `StreamingResponse` (FastAPI) + `text/event-stream`.
Le frontend lit le flux via `ReadableStream` et affiche les tokens en temps réel.

### Garde-fou IA

Si `DEEPSEEK_API_KEY` est absent ou l'API indisponible, Limule échoue de façon
explicite hors environnement local. Les réponses sensibles ne sont pas remplacées
par du faux conseil généré.

---

## Onboarding

L'assistant d'onboarding se lance automatiquement au premier login.
Il guide l'utilisateur en **8 étapes interactives** :

| # | Étape | Contenu |
|---|---|---|
| 1 | **Bienvenue** | Présentation KOMPTA + points forts |
| 2 | **Visite guidée** | Tour des modules clés avec exemples |
| 3 | **Entreprise** | Saisie nom société, secteur, effectif |
| 4 | **Équipe** | Inviter les premiers collaborateurs |
| 5 | **Modules** | Activer les modules utiles |
| 6 | **Limule démo** | Démo typewriter interactive (3 prompts) |
| 7 | **TERAS** | Explication scoring conformité |
| 8 | **Prêt !** | Récapitulatif + raccourcis |

> L'onboarding peut être relancé depuis Paramètres → Compte.

---

## Déploiement

### Option 0 — Production gratuite via Cloudflare Tunnel (`kompta0.com`)

Déploiement réel **sans serveur ni port ouvert** : un tunnel Cloudflare nommé expose
le Mac local sur le domaine `kompta0.com`. Tout est scripté dans `infra/`.

```bash
# Lance backend (:8010) + frontend build (:3000) + tunnel Cloudflare, d'un coup
bash infra/start-kompta.sh
# Pour tourner en fond (terminal fermable) :
nohup bash infra/start-kompta.sh > infra/logs/launch.out 2>&1 &
```

**Principe clé — un seul hostname** : le frontend appelle l'API en **URL relative
`/api`**, proxifiée par `vite preview` vers le backend `:8010`. Inutile de configurer
un sous-domaine `api.` séparé — tout passe par `www.kompta0.com`.

| Élément | Détail |
|---|---|
| **Tunnel** | Cloudflare Tunnel nommé `kompta` (token Zero Trust dans `infra/.tunnel-token`, gitignored) |
| **Frontend** | `vite preview` du build `dist/` sur `:3000`, `allowedHosts` = `.kompta0.com` |
| **Backend** | `uvicorn --env-file backend/.env` sur `:8010` (le `--env-file` est **obligatoire**) |
| **API** | `https://www.kompta0.com/api` (proxy `/api` → `:8010`, WebSockets inclus) |
| **Auto-restart** | optionnel : `infra/com.kompta.app.plist` (launchd `KeepAlive`) |

Détails complets, dépannage et configuration Cloudflare/Stripe/MoMo : **`infra/README.md`**.

> ⚠️ Le backend en mode `production` **refuse de démarrer** si `SECRET_KEY` ou
> `SUPER_ADMIN_PASSWORD` sont laissés à leur valeur par défaut.

### Option 1 — Serveur Linux simple

```bash
# Backend (systemd ou screen)
cd /opt/kompta/backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8010 --workers 2

# Frontend — build statique servi par nginx
cd /opt/kompta/frontend
npm run build
# Configurer nginx pour servir dist/ et proxy /api → :8010
```

### Option 2 — Docker (à venir)

```bash
docker compose up -d
```

### Variables de production importantes

```dotenv
APP_ENV=production
SECRET_KEY=<clé 64 chars min — openssl rand -hex 32>
ALLOWED_ORIGINS=https://votre-domaine.com
```

---

## Comptes et données

KOMPTA ne crée plus de société démo par défaut. Le super-admin plateforme est
créé via `SUPER_ADMIN_EMAIL` et `SUPER_ADMIN_PASSWORD`; les entreprises réelles
sont ensuite enregistrées depuis l'application ou via `POST /api/auth/register-company`.

Les données fictives ne doivent être utilisées que dans une base locale isolée
pour les tests automatisés, avec activation explicite (`SEED_DEMO=true` ou
`backend/scripts/seed.py --yes-demo`).

---

## Changelog

### v1.13.0 — Juillet 2026 (PostgreSQL en production, parité super-admin iOS/Mac, conformité App Store)

- ✅ **Migration production SQLite → PostgreSQL** : base de données de production entièrement migrée et vérifiée (83 tables, 1933 lignes, comptages source/destination identiques) — voir `docs/POSTGRES_MIGRATION.md` pour la procédure complète. Outillage ajouté : `backend/scripts/migrate_sqlite_to_postgres.py`, `backend/scripts/check_orphaned_fks.py` (détecte les références orphelines que SQLite n'empêche pas, contrairement à PostgreSQL), `scripts/backup-postgres.sh` / `scripts/restore-postgres.sh` (sauvegardes quotidiennes automatiques, cron en place). Un bug critique de restauration silencieuse (données perdues sans erreur signalée) a été trouvé et corrigé en testant le cycle complet avant la bascule réelle
- ✅ **Console super-admin iOS/Mac mise au niveau du web** (et au-delà sur plusieurs écrans) : création d'entreprise depuis l'app (formulaire avec consentement légal, jusqu'ici web uniquement), message ciblé par entreprise, filtres/tri/export CSV (Entreprises, Utilisateurs), assignation de tickets + édition priorité/catégorie, édition complète des drapeaux fonctionnels, KPIs et rappel ciblé sur l'onboarding, filtres niveau/date/acteur + export JSON + auto-refresh sur le journal d'audit
- ✅ **Conformité App Store (Guidelines 3.1.1 et 2.1(b))** : retrait de la création d'entreprise dans l'app iOS (reste disponible sur macOS et le web), retrait de l'entitlement Tap to Pay non autorisé par Apple, compte de démonstration dédié pour la review avec abonnement forcé en post-essai
- ✅ **Tour guidé refait** (web et iOS/Mac) : abandon du diaporama statique au profit d'une conversation animée avec Limule (bulle de dialogue, indicateur « en train d'écrire »). Corrige au passage un bug réel du tour web : la plupart des étapes sans élément précis à surligner assombrissaient tout l'écran sans rien montrer de la page présentée — particulièrement génant sur mobile
- ✅ **Landing page et page de connexion** : landing étoffée (comment ça marche, tarifs réels, sécurité, FAQ) et forcées en mode clair en permanence, indépendamment du thème système — elles n'avaient jamais géré le mode sombre et se faisaient assombrir par erreur par le pont dark-mode global de l'application
- ✅ Fix formulaire admin « Créer une entreprise » (web) : le consentement légal (RGPD/CGU/décharge) n'était jamais collecté, ce qui faisait échouer systématiquement toute création d'entreprise depuis la console admin

### v1.12.0 — Juillet 2026 (correctifs audit qualité, faux incidents uptime)

- ✅ **`/health` accepte HEAD** : UptimeRobot (et les moniteurs d'uptime en général) sondent en HEAD par défaut ; FastAPI n'ajoute pas HEAD automatiquement à une route `@router.get()`, ce qui renvoyait 405 et déclenchait de faux incidents "down" alors que le service tournait normalement
- ✅ **MoMo/Stripe : 5xx fournisseur → 502** au lieu d'être transmis tel quel (un 500 brut laissait croire que l'API KOMPTA elle-même avait planté) ; corrige le seul test backend en échec
- ✅ **`/workspace` protégé** : la route affichait le shell applicatif (déconnexion, création d'entreprise) à un visiteur non authentifié — les API restaient protégées côté backend, mais l'UX était trompeuse ; ajout de la même garde d'authentification que les autres routes internes
- ✅ **Débordement mobile Groupes** : la page débordait de ~32px sur iPhone (bouton "Créer" et 3ᵉ statistique coupés) — item flex racine sans largeur contrainte, corrigé et vérifié en direct (375px)
- ✅ **404 logo évité** : le frontend n'appelle plus `/company/logo` quand l'entreprise n'a pas de logo (`has_logo`, déjà exposé par le backend, jamais branché côté client)
- ✅ Nettoyage : import `AuditLog` dupliqué, fichiers Xcode dupliqués (`Kompta 2.xcodeproj`, `KomptaMac 2.entitlements`)
- ✅ 187/187 tests backend, CI verte (build, typecheck, E2E)

### v1.11.0 — Juillet 2026 (observabilité prod, super-admin renforcé, Application Metrics)

- ✅ **Observabilité production activée** : Sentry (capture d'erreurs backend, correctif d'ordre d'initialisation qui faisait disparaître son propre log de démarrage) et UptimeRobot (`UPTIME_MONITOR_URL`, corrige un oubli de passthrough dans `docker-compose.yml` — la variable était lue par le code mais jamais transmise au conteneur)
- ✅ **Journal d'audit super-admin unifié** : `/audit-logs` (web) gagne un filtre cross-entreprise (`company_id`/`all_companies`) ; `/admin/audit-logs` (iOS/Mac) fusionne désormais les actions métier (`AuditLog`) et les actions d'accès/RH (`AccessAuditLog`) — l'app native n'affichait jusqu'ici que la moitié du journal
- ✅ **Application Metrics** : nouvelle table `PlatformMetricSnapshot` (capture quotidienne idempotente), endpoint `GET /admin/analytics/trends` — vraies séries temporelles journalières (MRR, entreprises actives) au lieu d'un recalcul approximatif à la volée
- ✅ **MRR réel** : calculé à partir des abonnements actifs/en essai (prix du plan × nombre d'abonnés, normalisé au mois), remplace l'ancienne carte qui affichait en réalité le total des ventes plateforme sous l'étiquette « MRR »
- ✅ **Répartition par plan d'abonnement** dans Analytics (web + iOS/Mac)
- ✅ Correctif du bug calendaire de « Croissance mensuelle » (`timedelta(days=i*30)` dérivait au fil des mois — remplacé par une vraie arithmétique de calendrier)
- ✅ En-tête des emails transactionnels : icône Limule ajoutée à côté du logo KOMPTA
- ✅ 186/186 tests backend (1 test réseau MoMo pré-existant exclu, flaky indépendamment de ce lot), build + typecheck frontend propres, build macOS vérifié

### v1.10.0 — Juillet 2026 (portail client : fidélité multi-entreprises, connexion par téléphone)

- ✅ **Fidélité agrégée en temps réel** : nouvel endpoint `/portal/me/loyalty-overview` — un client qui fréquente plusieurs commerces KOMPTA voit, depuis un seul espace, ses points/palier/remise **pour chaque entreprise**, avec la progression vers le palier suivant
- ✅ **Connexion portail par email OU téléphone** (`identifier`), même discrimination stricte qu'`/auth/login` (évite les collisions entre un email et un téléphone partagés) ; activation de l'accès portail depuis la fiche client ne requiert plus un email
- ✅ **Recherche client par téléphone** sur la page Clients (absente jusqu'ici — seuls nom/email/ville étaient cherchés)
- ✅ **Landing page** : nouvelle section dédiée au portail client (badge « 100 % gratuit », aperçu fidélité, lien direct), en plus de la carte déjà existante
- ✅ **Plan de mise en œuvre documenté** pour une app native dédiée « KOMPTA Client » (iOS/macOS, cible clients finaux) — voir `docs/KOMPTA_CLIENT_APP_PLAN.md` ; non démarré, backend déjà prêt (9 endpoints `/portal/*` réutilisables tels quels)
- ✅ 187/187 tests backend, build + typecheck frontend propres

### v1.9.0 — Juillet 2026 (parité CRM & rapprochement bancaire iOS/macOS, corrections UX)

- ✅ **CRM léger porté sur iOS/macOS** : pipeline d'opportunités par étape, résumé du pipeline, changement d'étape, conversion en facture — jusqu'ici disponible web uniquement, testé de bout en bout sur simulateur iOS avec un compte réel
- ✅ **Rapprochement bancaire porté sur iOS/macOS** : import de relevé CSV, matching automatique, confirmation/création/ignore ligne par ligne — même parité web/natif
- ✅ **Simplification de la connexion à une entreprise fournisseur** : recherche + création + connexion en un clic (bouton « Connecter une entreprise »)
- ✅ **Corrections UX** : boutons de paiement POS plus grands avec statut Stripe visible, `window.alert` remplacés par des toasts (CrmPage, Copilot), style de tableau partagé (Transactions, Inventaire, Employés)
- ✅ **Proxy Vite paramétrable** (`VITE_PROXY_TARGET`) pour l'E2E multi-session, dépendances dev à jour (0 vulnérabilité npm audit)

### v1.8.0 — Juillet 2026 (réseau fournisseurs, landing page, portail client)

- ✅ **Réseau fournisseurs inter-entreprises** : recherche d'entreprises par nom/email, invitation à devenir fournisseur connecté, acceptation/refus, bons de commande transmis directement dans l'app du fournisseur (nouvel onglet « Reçues » du module Achats) — disponible sur **web, iOS et macOS**
- ✅ **Landing page publique** (`/`) : présentation grand public de KOMPTA (modules, spotlight Limule, apps natives) affichée aux visiteurs non connectés, avant l'écran de connexion
- ✅ **Création de compte portail client simplifiée** : case à cocher directement dans « Nouveau client » pour générer l'accès au portail (web, avec parité iOS/macOS), lien direct vers l'espace client depuis l'écran de connexion

### v1.7.0 — Juillet 2026 (Achats, apps natives, audit qualité)

- ✅ **Module Achats & Fournisseurs (Phase B)** : fournisseurs, bons de commande avec cycle de vie complet (draft → approuvé → commandé → reçu → payé), **stock valorisé au coût moyen pondéré (CMP)**, écritures comptables automatiques à la réception et au règlement, COGS posté à la vente — disponible sur **web, iOS et macOS**
- ✅ **Comptabilité étendue** : classes SYSCOHADA 2 (immobilisations) et 3 (stocks), backfill automatique du plan comptable, `FiscalYear` (clôture d'exercice, verrouillage des écritures)
- ✅ **Audit sécurité complet** : 5 failles corrigées — Safe Mode export/restore sans contrôle de rôle, 3 IDOR (changement de bureau de groupe, suppression de message inter-groupes, création de rôle hors tenant), logs d'audit super-admin mal attribués (impersonation, reset mot de passe, suspension d'entreprise invisibles pour l'entreprise ciblée)
- ✅ **Audit fonctionnel page par page** (7 bugs corrigés) : suivi budgétaire qui comparait des revenus au lieu des dépenses, risque de double paie entre iOS/Mac et web (formats de période incompatibles), statuts de tâche désynchronisés entre plateformes, factures liées aux clients par nom plutôt que par ID, KPI et prompts IA basés sur des clés backend inexistantes, données fictives codées en dur sur le tableau TERAS
- ✅ **187 tests backend** (106 → 187)

### v1.6.0 — Juin 2026 (abonnements & facturation plateforme)

- ✅ **Système d'abonnement complet** : plans tarifaires (Starter/Pro/Business), période mensuelle/annuelle
- ✅ **Paiement abonnement** : carte (Stripe), Mobile Money (MoMo), Zola (QR) — branché sur l'infra paiement existante
- ✅ **Codes promo** : réduction %, ciblage par plan, limite d'utilisation, validité — gérés par le super-admin
- ✅ **Suspension des non-payeurs** : middleware backend → routes métier bloquées en **402** ; barrière UX plein écran avec paiement pour réactiver
- ✅ **Console super-admin /admin/subscriptions** : gérer plans & prix EN DIRECT, promotions, et statut de chaque entreprise (suspendre / réactiver / offrir une période)
- ✅ **Onglet Paramètres → Abonnement** côté entreprise (plans, promo, paiement)
- ✅ **5 tests** dédiés (plans, promo, checkout gratuit, suspension 402 + réactivation, grant) — 106 tests backend au total

### v1.5.2 — Juin 2026 (zéro-simulacre strict)

- ✅ **Devises** : en production, plus aucun taux estimé — source temps réel KO → `unavailable` (au lieu du fallback figé)
- ✅ **Extraction documents** : texte trop court → `insufficient_text` explicite (fini « Document analysé localement »)
- ✅ **Contrats** : suppression du libellé « mock » dans le PDF légal → « modèle standard KOMPTA (sans IA) » / « assistant IA Limule »
- ✅ **Rappels de cotisation (groupes)** : champ `source` (`ai`/`template`) — l'origine du message est explicite
- ✅ **Copilot export** : échec PDF rendu explicite (extension `.txt` correcte + alerte, plus de `.pdf` trompeur)
- ✅ **Script de nettoyage audit** : `backend/scripts/cleanup_audit_data.py` (dry-run + `--apply`, backup auto)
- ✅ **101 tests backend** (+ test « pas de taux estimé en production »)

### v1.5.1 — Juin 2026 (remédiation audit zéro-simulacre)

- ✅ **Cookie de session par environnement** : host-only + non-secure hors production (QA navigateur local fiable), `.kompta0.com` + Secure conservés en prod
- ✅ **Zéro-simulacre IA renforcé** : `limule_generate` fail-close 503 en prod ; `limule_stream` émet un état d'indisponibilité explicite ; IA groupes (4 endpoints) laissent remonter le 503 ; extraction documentaire → `provider='unavailable'` (plus de faux résumé) ; **2 tests** de non-régression
- ✅ **Taux de change** : flag `certified` + badge UI « ⚠ taux estimé » quand le taux vient du fallback hors-ligne
- ✅ **Doublon API supprimé** : `GET /audit-logs` n'est plus déclaré qu'une fois (version canonique agrégée)
- ✅ **Pages orphelines retirées** : `InventoryPosPage`, `ModuleBoardPage`
- ✅ **Tokens Admin Limule** : étiquetés « estimation » (non mesurés)
- ✅ **Warnings Python 3.16** : `datetime.utcnow()` → `datetime.now(timezone.utc)`
- ✅ **100 tests backend** (98 → 100)

### v1.5.0 — Juin 2026

- ✅ **Déploiement production `kompta0.com`** : Cloudflare Tunnel nommé, scripts `infra/` (`start-kompta.sh`, plist launchd, README dédié)
- ✅ **Architecture mono-domaine** : API en URL relative `/api` proxifiée par `vite preview` → plus besoin de sous-domaine `api.` séparé (HTTP + WebSockets)
- ✅ **Paiements réels** : Stripe (carte, webhook signé HMAC) + MTN Mobile Money (request-to-pay + polling de statut), idempotence et anti-double-paiement
- ✅ **POS — encaissement carte/MoMo** : modals Stripe/MoMo branchés sur la caisse, confirmation serveur avant enregistrement de la vente
- ✅ **Seuil d'alerte trésorerie configurable** : par entreprise via Paramètres → Général (`cash_low_threshold_cents`, 0 = désactivé)
- ✅ **Onboarding — icône Limule** : la mascotte + thème bleu Limule remplacent l'icône étoiles à l'étape IA
- ✅ **Header — badge de synchro cliquable** : le nuage de statut ouvre la caisse (déclenche la synchro hors-ligne)
- ✅ **Sécurité `.gitignore`** : exclusion des backups de base (`*.db.bak*`, `*.db.backup*`) et de `backend/.env.production`
- ✅ **Tests E2E Playwright retirés** : CI réduite à backend (98 tests) + frontend (type-check, Vitest, build)

### v1.4.0 — Mai 2026

- ✅ **Facturation — Paiement espèces** : mode cash désormais sélectionnable, BankTransaction créée automatiquement
- ✅ **Facturation — Impact comptable** : paiement facture → transaction visible immédiatement + Dashboard mis à jour
- ✅ **POS/Caisse — Reçu complet** : liste articles, quantités, prix, mode de paiement, confirmation comptable
- ✅ **POS/Caisse — BankTransaction automatique** : chaque vente crée une transaction (`source_type=pos`)
- ✅ **Dashboard — KPI "Encaissé"** : affiche le montant réellement perçu (vs. total facturé)
- ✅ **Transactions — Sources** : labels "Facturation" et "Caisse POS" ajoutés au filtre source
- ✅ **Déclarations — Refonte complète** : 6 types, génération Limule 4 000 tokens, PDF téléchargeable, icône Limule native
- ✅ **Limule — Analyses approfondies** : structure 5 parties obligatoire, min 400 mots, benchmark CEMAC
- ✅ **Limule — Bloc "Regard CEMAC"** : avis conjoncture zone CEMAC systématique en fin d'analyse
- ✅ **Limule — Budget tokens adaptatif** : 3 500 (analyses) / 2 200 (réponses standard)
- ✅ **Limule — Création tâche 1-clic** : création directe si confiance suffisante sur l'intention
- ✅ **PDF — Rendu Markdown** : `###` et `####` remplacés par du texte en gras (fin des titres brisés)
- ✅ **Journal — Réunions connectées** : notes quotidiennes intègrent les réunions du jour
- ✅ **Multi-devises** : devise utilisateur respectée dans toutes les analyses Limule
- ✅ **Audit qualité complet** : 0 erreur TypeScript, 11 modules backend vérifiés, DB intègre

### v1.3.0 — Mai 2026

- ✅ **Tâches — Upload de preuve** : image, vidéo (MP4/MOV/WebM), PDF — max 50 Mo
- ✅ **Tâches — Détail enrichi** : consignes formatées, méta-infos, badge preuve, badge retard
- ✅ **Tâches — Kanban amélioré** : recherche, filtres priorité/responsable, pagination "Terminé"
- ✅ **Limule — Création de tâche inline** : titre intelligent, description bullet points, pré-remplie
- ✅ **Limule — Historique** : suppression unitaire, sélection multiple, effacement global
- ✅ **Limule — Description tâche** : vue lecture structurée + mode édition
- ✅ **TERAS — Module toggle** : activation/désactivation depuis Paramètres avec deep-link
- ✅ **Dashboard — Résumé IA** : icône Limule remplace les étoiles
- ✅ **Alertes TERAS** : suppression de l'injection automatique dans Limule
- ✅ **Canaux de vente** : palette de couleurs diversifiée sur le donut
- ✅ **Navigation** : icône Limule dans le menu Rédaction IA

### v1.2.0 — 2025

- ✅ **Limule** : streaming SSE, multi-tour, branchement, épinglage, quick replies
- ✅ **TERAS Connect** : scoring, alertes, recommandations IA, export PDF
- ✅ **Hub d'analyses** : page centralisée des rapports
- ✅ **Rédaction IA** : assistants thématiques
- ✅ **Statut IA temps réel** dans le header (latence + indicateur couleur)

### v1.1.0 — 2025

- ✅ **Onboarding novice** 8 étapes avec démo typewriter Limule
- ✅ **Reset mot de passe** flux token local (sans email)
- ✅ **Rafraîchissement auto** dashboard toutes les 30 s
- ✅ **Fiche employé** page détaillée avec actions rapides
- ✅ **Export PDF** bulletin de salaire, rapport TERAS
- ✅ **Export CSV** ventes POS avec filtres
- ✅ **Journal d'audit** dans Paramètres
- ✅ **Alertes stock bas** inventaire avec seuil configurable
- ✅ **Conversion alerte TERAS → tâche** en un clic
- ✅ **Migration SQLite** automatique sans perte de données
- ✅ **Multi-tenant** isolation complète par `company_id`

### v1.0.0 — Version initiale

- Backend FastAPI complet (auth JWT, 10 modules, SSE streaming)
- Frontend React 18 (17 pages, Tailwind CSS, TanStack Query)
- TERAS Connect moteur local
- Limule IA avec garde-fou fail-closed hors local
- Seed de test explicite, désactivé par défaut

---

## Licence

Logiciel propriétaire — tous droits réservés.

© 2026 DAVY OKEMBA. All rights reserved.
