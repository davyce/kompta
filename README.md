# KOMPTA — Gestion d'entreprise locale

> Application de gestion tout-en-un pour PME africaines (OHADA/SYSCOHADA).
> Stack : **FastAPI 0.111** + **SQLite** · **React 18** + **TypeScript** + **Vite** + **Tailwind CSS**.
> IA intégrée via **Limule** (DeepSeek `deepseek-chat`) avec streaming SSE.
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

---

## Fonctionnalités

| Domaine | Détail |
|---|---|
| **RH** | Fiches employés, contrats IA, organigramme, présences, congés |
| **Paie** | Bulletins de salaire, calcul net/brut, anomalies, export PDF |
| **Facturation** | Devis, factures, avoirs, suivi paiements, export PDF |
| **Inventaire** | Produits, stock temps réel, alertes seuil bas, mouvements |
| **POS** | Caisse enregistreuse, ventes, tickets, export CSV |
| **Documents** | Upload, classification IA, analyse, rattachement employé |
| **Agenda** | Réunions, ordre du jour, participants, liens visio |
| **Tâches** | Kanban board, priorités, affectation équipe |
| **Déclarations** | Assistance IA déclarations fiscales/sociales OHADA |
| **TERAS Connect** | Scoring conformité, alertes réglementaires, recommandations IA |
| **Limule (IA)** | Assistant conversationnel streaming, rédaction, analyse |
| **Paramètres** | Profil entreprise, utilisateurs, RBAC, journal d'audit |
| **Réinitialisation mdp** | Flux token en mode local (sans email) |
| **Tableau de bord** | KPIs temps réel, rafraîchissement auto 30 s |

---

## Architecture

```
kompta/
├── backend/                    # API FastAPI
│   ├── app/
│   │   ├── main.py             # Point d'entrée, CORS, routers
│   │   ├── config.py           # Settings (pydantic-settings)
│   │   ├── models/
│   │   │   └── domain.py       # Tous les modèles SQLAlchemy
│   │   ├── schemas/
│   │   │   └── domain.py       # Schémas Pydantic (Read/Create/Update)
│   │   ├── db/
│   │   │   ├── session.py      # Engine SQLite + SessionLocal
│   │   │   └── init_db.py      # Seed + migrations SQLite
│   │   ├── api/
│   │   │   ├── routes_auth.py      # /auth/*
│   │   │   ├── routes_company.py   # /company/*
│   │   │   ├── routes_employees.py # /employees/*
│   │   │   ├── routes_payroll.py   # /payroll/*
│   │   │   ├── routes_invoices.py  # /invoices/*
│   │   │   ├── routes_inventory.py # /inventory/*
│   │   │   ├── routes_pos.py       # /pos/*
│   │   │   ├── routes_documents.py # /documents/*
│   │   │   ├── routes_extra.py     # meetings, tasks, declarations, teras, chat
│   │   │   └── routes_features.py  # reset mdp, ai health, export PDF/CSV, audit
│   │   └── core/
│   │       ├── security.py     # JWT, hash, RBAC
│   │       └── limule.py       # Streaming DeepSeek + fallback mock
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/                   # SPA React 18
    ├── src/
    │   ├── app/
    │   │   ├── Shell.tsx        # Layout principal + LimuleStatus
    │   │   └── routes.tsx       # React Router v6
    │   ├── components/
    │   │   ├── OnboardingWizard.tsx  # 8 étapes tutoriel novice
    │   │   ├── Charts.tsx       # LineAreaChart, ScoreRing, BarChart
    │   │   ├── Panel.tsx        # Carte avec titre/action
    │   │   └── StatusBadge.tsx  # Badge coloré
    │   ├── pages/
    │   │   ├── DashboardPage.tsx
    │   │   ├── EmployeesPage.tsx
    │   │   ├── EmployeeProfilePage.tsx  # Fiche détaillée
    │   │   ├── PayrollPage.tsx
    │   │   ├── InvoicesPage.tsx
    │   │   ├── InventoryPage.tsx
    │   │   ├── PosPage.tsx
    │   │   ├── DocumentsPage.tsx
    │   │   ├── CalendarPage.tsx
    │   │   ├── TasksPage.tsx
    │   │   ├── DeclarationsPage.tsx
    │   │   ├── ReportsTerasPage.tsx
    │   │   ├── SettingsPage.tsx  # + Journal d'audit
    │   │   ├── LimulePage.tsx
    │   │   └── LoginPage.tsx    # + Reset mot de passe
    │   ├── services/
    │   │   └── api.ts           # Client HTTP centralisé (fetch)
    │   └── utils/
    │       └── format.ts        # money, shortDate, percent…
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

> Aucune base de données externe requise — SQLite est embarqué.

---

## Installation rapide

### 1. Cloner le dépôt

```bash
git clone https://github.com/<votre-org>/kompta.git
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
SECRET_KEY=changeme_32_chars_min          # clé HMAC-SHA256 (générer avec openssl rand -hex 32)
ACCESS_TOKEN_EXPIRE_MINUTES=1440          # 24 h

# ── IA / Limule ──────────────────────────────────────────────
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx      # https://platform.deepseek.com
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# ── TERAS (optionnel — mock si absent) ───────────────────────
TERAS_API_KEY=

# ── Autres intégrations (optionnels) ─────────────────────────
OPENAI_API_KEY=
ZOLA_API_KEY=
SMS_PROVIDER_API_KEY=

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

### Tests backend

```bash
cd backend
pytest
```

### Build de production frontend

```bash
cd frontend
npm run build          # → frontend/dist/
npm run preview        # serveur preview local
```

---

## Modules applicatifs

### Tableau de bord

- KPIs consolidés : chiffre d'affaires, masse salariale, stock, trésorerie
- Graphiques évolution (3/6/12 mois)
- **Rafraîchissement automatique toutes les 30 secondes**
- Horodatage de la dernière mise à jour

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
- Historique complet

### Facturation

- Devis → Facture → Avoir
- Suivi statuts : brouillon / envoyé / payé / en retard
- Export PDF, envoi simulé

### POS — Point de vente

- Interface caisse avec recherche produit
- Tickets de caisse
- **Export CSV des ventes** avec filtres date et produit

### Inventaire

- Stock en temps réel
- **Alertes produits sous seuil** (niveau de réapprovisionnement)
- Mouvements d'entrée/sortie

### Documents

- Upload avec classification automatique par IA
- **Animation feedback** pendant l'analyse IA (barre de progression)
- Rattachement à un employé ou à l'entreprise
- Téléchargement et suppression

### Agenda

- Création de réunions avec **ordre du jour** (champ `agenda`)
- Gestion des participants
- Lien de visioconférence

### Tâches

- Kanban : À faire / En cours / Terminé
- Priorités, affectation, dates limites
- Conversion d'alerte TERAS en tâche en un clic

### Déclarations

- Modèles assistés OHADA/SYSCOHADA
- Rédaction IA avec exemples pré-remplis
- Calcul automatique des montants

### Limule — IA

- Chat conversationnel avec **streaming SSE temps réel**
- Prompts contextuels : rédaction, analyse, conseils RH/fiscal
- Indicateur de statut IA en temps réel dans le header (`deepseek · XX ms`)
- Fallback mock si l'API DeepSeek est indisponible

### Paramètres

- Profil entreprise (nom, RCCM, NIF, adresse)
- Gestion utilisateurs + RBAC
- **Journal d'audit** : toutes les actions traçées par utilisateur/IP/module
- Changement de mot de passe

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
| POST | `/api/chat/stream` | Chat SSE streaming |
| GET | `/api/ai/health` | Statut + latence LLM |

### Divers

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/audit-logs` | Journal d'audit |
| PATCH | `/api/meetings/{id}/agenda` | Mettre à jour ordre du jour |
| GET | `/api/overview` | KPIs consolidés dashboard |

---

## RBAC — Rôles et accès

| Rôle | Accès |
|---|---|
| `superadmin` | Accès total toutes sociétés |
| `admin` | Accès total sa société |
| `comptable` | Facturation, paie, déclarations, rapports |
| `rh` | RH, paie, documents RH |
| `manager` | Lecture + tâches + réunions |
| `employe` | Bulletin de salaire, profil, documents propres |
| `caissier` | POS uniquement |

> Les routes API vérifient le rôle via le token JWT à chaque requête.

---

## TERAS Connect

TERAS est le moteur de conformité réglementaire intégré à KOMPTA.

### Comment ça marche

1. **Analyse** : Cliquer "Lancer une analyse" — TERAS examine RH, paie, déclarations et documents
2. **Score** : Un score global 0-100 est calculé par domaine (poids configurables)
3. **Alertes** : Les non-conformités génèrent des alertes classées `critical` / `medium` / `info`
4. **Recommandations** : L'IA produit des actions concrètes priorisées par impact
5. **Suivi** : Chaque alerte peut être convertie en tâche assignable à un collaborateur

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

- **Rédaction** : Emails professionnels, courriers RH, clauses contractuelles
- **Analyse** : Lecture de documents, extraction d'informations clés
- **Conseil** : Aide aux déclarations OHADA, règles sociales locales
- **Contextualisation** : Accès aux données live (nom entreprise, score TERAS, effectif…)

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

### v1.1.0 — Améliorations majeures (2025)

- ✅ **Onboarding novice** 8 étapes avec démo typewriter Limule
- ✅ **Reset mot de passe** flux token local (sans email)
- ✅ **Statut IA temps réel** dans le header (latence + couleur)
- ✅ **Rafraîchissement auto** dashboard toutes les 30 s
- ✅ **Fiche employé** page détaillée avec actions rapides
- ✅ **Export PDF bulletin** de salaire par employé
- ✅ **Export PDF rapport** TERAS avec scores + alertes
- ✅ **Export CSV ventes** POS avec filtres date/produit
- ✅ **Journal d'audit** dans Paramètres (toutes actions tracées)
- ✅ **Ordre du jour** réunions (champ `agenda`)
- ✅ **Alertes stock bas** inventaire avec seuil configurable
- ✅ **Feedback upload** Documents (barre de progression IA)
- ✅ **Analyse domaine** TERAS par catégorie (RH/Paie/Déclaration/Documents)
- ✅ **Conversion alerte → tâche** TERAS en un clic
- ✅ **Navigation profil** depuis la liste employés
- ✅ **Migration SQLite** automatique (nouvelles colonnes sans perte)
- ✅ **Multi-tenant** isolation complète par `company_id`

### v1.0.0 — Version initiale

- Backend FastAPI complet (auth JWT, 10 modules, SSE streaming)
- Frontend React 18 (17 pages, Tailwind CSS, TanStack Query)
- TERAS Connect moteur local
- Limule IA avec fallback mock
- Seed automatique base de données

---

## Licence

Logiciel propriétaire — usage interne uniquement.
© 2025 KOMPTA. Tous droits réservés.
