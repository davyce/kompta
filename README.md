# KOMPTA — Plateforme de gestion d'entreprise intelligente

> Solution de gestion tout-en-un pour PME de la zone CEMAC (XAF) avec référentiel SYSCEMAC.
> Stack : **FastAPI** + **SQLite** · **React 18** + **TypeScript** + **Vite** + **Tailwind CSS**.
> IA intégrée via **Limule** (DeepSeek `deepseek-chat`) avec streaming SSE temps réel.
> Conformité réglementaire via **TERAS Connect** (moteur local + connecteur API).

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Architecture](#architecture)
3. [Prérequis](#prérequis)
4. [Installation rapide](#installation-rapide)
5. [Variables d'environnement](#variables-denvironnement)
6. [Lancement en développement](#lancement-en-développement)
7. [Modules applicatifs](#modules-applicatifs)
8. [API — Endpoints clés](#api--endpoints-clés)
9. [RBAC — Rôles et accès](#rbac--rôles-et-accès)
10. [TERAS Connect](#teras-connect)
11. [Limule — IA intégrée](#limule--ia-intégrée)
12. [Onboarding](#onboarding)
13. [Déploiement](#déploiement)
14. [Comptes de test](#comptes-de-test)
15. [Changelog](#changelog)
16. [Licence](#licence)

---

## Fonctionnalités

| Domaine | Détail |
|---|---|
| **Tableau de bord** | KPIs temps réel, graphiques, rafraîchissement auto 30 s, résumé IA |
| **RH & Employés** | Fiches, contrats IA, organigramme, présences, congés, profil détaillé |
| **Paie** | Bulletins de salaire, calcul net/brut, anomalies, export PDF |
| **Facturation** | Devis, factures, avoirs, paiement espèces/mobile/virement, BankTransaction automatique, export PDF |
| **Inventaire** | Produits, stock temps réel, alertes seuil bas, mouvements |
| **POS / Caisse** | Caisse enregistreuse, reçu détaillé par article, BankTransaction automatique, export CSV |
| **Transactions** | Relevé comptable unifié (factures + POS + imports), filtres par source, Limule analyse |
| **Documents** | Upload, classification IA, analyse, rattachement employé |
| **Agenda** | Réunions, ordre du jour, participants, liens visio, intégration Journal |
| **Tâches** | Kanban board, filtres, recherche, upload de preuves (image/vidéo/PDF) |
| **Déclarations** | Génération complète par Limule (TVA, IS, CNPS, fiscal…), PDF téléchargeable, checklist conformité |
| **Journal** | Notes quotidiennes IA connectées aux réunions et tâches du jour |
| **TERAS Connect** | Scoring conformité, alertes réglementaires, recommandations IA, module activable |
| **Limule (IA)** | Assistant conversationnel streaming, analyses narratives 5 parties + Regard CEMAC, création de tâches, historique multi-tour |
| **Rédaction IA** | Emails, courriers, contrats, clauses assistés par Limule |
| **Rapports** | Hub analytique centralisé, KPI Encaissé/Facturé/En attente, export PDF/CSV |
| **Paramètres** | Profil entreprise, devise multi-devises, utilisateurs, RBAC, modules, journal d'audit |

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
- Fallback mock si DeepSeek est indisponible

### Paramètres

- Profil entreprise (nom, RCCM, NIF, adresse)
- Gestion utilisateurs + RBAC
- **Activation/désactivation des modules** (TERAS, etc.)
- **Journal d'audit** : toutes les actions tracées par utilisateur/IP/module
- Changement de mot de passe
- Accès direct depuis les bannières de désactivation de module

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

### Fallback

Si `DEEPSEEK_API_KEY` est absent ou l'API indisponible, Limule répond avec des
messages mock cohérents — l'application reste pleinement fonctionnelle.

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

## Comptes de test

| Rôle | Email | Mot de passe |
|---|---|---|
| Admin | `admin@kompta.local` | `kompta123` |
| RH | `rh@kompta.local` | `kompta123` |
| Comptable | `compta@kompta.local` | `kompta123` |
| Employé | `employe@kompta.local` | `kompta123` |

> ⚠️ Changer tous les mots de passe avant toute mise en production.

---

## Changelog

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
- Limule IA avec fallback mock
- Seed automatique base de données

---

## Licence

Logiciel propriétaire — tous droits réservés.

© 2026 DAVY OKEMBA. All rights reserved.
