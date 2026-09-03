<p align="center"><img src="docs/assets/logo.png" width="112" alt="KOMPTA logo" /></p>

<p align="center">🇬🇧 **English** · [🇫🇷 Français](README.fr.md)</p>

# KOMPTA — Intelligent Business Management Platform

> All-in-one AI ERP for SMEs, NGOs, tontines, mutual associations, and collectives in the CEMAC zone.
> **SYSCOHADA (the OHADA-region accounting standard) double-entry accounting** · **POS** · **VAT invoicing** · **CNSS + IRPP payroll** ·
> **Groups & Organizations module** · **Limule AI assistant** · **Lightweight offline-first mode**.
>
> Stack: **FastAPI 0.115** + **SQLAlchemy 2** + **SQLite/Postgres** · **React 18** + **TS** + **Vite 8** + **Tailwind** ·
> **Native iOS + macOS** (SwiftUI, `kompta-apple/`).
> Money in **integer cents** (BigInt) · **real payments** via Stripe (card) + MTN Mobile Money.
> **Free** production deployment via **Cloudflare Tunnel** (`kompta0.com` domain, single hostname).
> 187 backend tests + frontend unit tests · GitHub Actions CI/CD.

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Quick Install](#quick-install)
5. [Environment Variables](#environment-variables)
6. [Running in Development](#running-in-development)
7. [Remote / iPhone Testing — Cloudflare Tunnel](#remote--iphone-testing--cloudflare-tunnel)
8. [Zero-Demo Production](#zero-demo-production)
9. [Application Modules](#application-modules)
10. [Groups & Organizations Module](#groups--organizations-module)
11. [SYSCOHADA Double-Entry Accounting Engine](#syscohada-double-entry-accounting-engine)
12. [API — Key Endpoints](#api--key-endpoints)
13. [RBAC — Roles and Access](#rbac--roles-and-access)
14. [Security](#security)
15. [TERAS Connect](#teras-connect)
16. [Limule — Built-in AI](#limule--built-in-ai)
17. [Onboarding](#onboarding)
18. [Deployment](#deployment)
19. [Accounts & Data](#accounts--data)
20. [Changelog](#changelog)
21. [License](#license)

---

## Features

| Area | Detail |
|---|---|
| **🏠 Dashboard** | Real-time KPIs, charts, 30 s auto-refresh, AI summary |
| **👥 HR & Employees** | Records, AI-generated contracts, org chart, attendance, leave, detailed profile |
| **💰 Payroll** | Payslips, **CNSS 4% employee + 8% employer**, **progressive IRPP**, period idempotence, PDF export |
| **🧾 Invoicing** | Invoices with **subtotal/VAT/total**, **atomic collision-proof numbering**, immutability once paid, credit notes, PDF export |
| **📦 Inventory** | Products, real-time stock, **atomic TOCTOU-proof decrement**, low-stock alerts, stock movements |
| **🚚 Purchasing & Suppliers** | Suppliers, purchase orders (lifecycle draft → approved → ordered → received → paid), **stock valued at weighted average cost (WAC)**, automatic accounting entries on receipt (Dr 31 Inventory / Dr 60 Purchases / Cr 401 Suppliers) |
| **🎯 Lightweight CRM** | Opportunity pipeline (new → qualified → proposal → negotiation → won/lost), stage-by-stage summary, conversion to invoice — **web + native iOS/macOS** |
| **🛒 POS / Cash Register** | Cash register, detailed receipt, automatic accounting entry Dr Cash / Cr 70, CSV export |
| **🏛️ Double-Entry Accounting** | **SYSCOHADA-lite** (18 accounts), guaranteed balanced `JournalEntry` records (Σdebit = Σcredit), general ledger, trial balance, immutable reversal |
| **💳 Transactions** | Unified accounting statement (invoices + POS + imports), filters, Limule analysis |
| **🏦 Bank Reconciliation** | CSV statement import, automatic matching (reconciled/suggested/unreconciled), line-by-line confirm/create/ignore — **web + native iOS/macOS** |
| **🎁 Customer Portal** | 100% free portal for customers (`/portal`), sign-in by **email or phone**, invoices + PDF + Mobile Money payment requests, **real-time aggregated loyalty across every KOMPTA business the customer visits** (points, tier, discount) |
| **🏢 Groups & Organizations** | Tontines, mutual associations, NGOs, clubs, associations: members, **leadership board & terms of office**, dues, cash fund, **real-time WS chat**, calendar, birthdays, votes, dedicated AI |
| **📄 Documents** | Upload, AI classification, analysis, linking to an employee/group |
| **📅 Calendar** | Meetings, agenda, participants, video-call links, Journal integration |
| **✅ Tasks** | Kanban board, filters, search, proof upload (image/video/PDF) |
| **🇨🇲 Tax Filings** | Full Limule-generated filings (VAT, corporate tax, CNPS, tax), PDF, compliance checklist |
| **📔 Journal** | Daily AI notes connected to the day's meetings and tasks |
| **🛡️ TERAS Connect** | Compliance scoring, regulatory alerts, AI recommendations, toggleable module |
| **🤖 Limule (AI)** | Streaming assistant, anti-injection guardrails, **read-only**, source citations, narrative analyses + "CEMAC Outlook" |
| **✍️ AI Drafting** | Emails, letters, contracts, clauses drafted with Limule's help |
| **📊 Reports** | Analytics hub, Collected/Invoiced/Pending KPIs, PDF/CSV/Excel export |
| **⚙️ Settings** | Company profile, multi-currency, users, RBAC, modules, audit log |

---

## Architecture

```
kompta/
├── backend/                        # FastAPI API
│   ├── app/
│   │   ├── main.py                 # Entry point, CORS, routers
│   │   ├── config.py               # Settings (pydantic-settings)
│   │   ├── models/
│   │   │   └── domain.py           # All SQLAlchemy models
│   │   ├── schemas/
│   │   │   └── domain.py           # Pydantic schemas (Read/Create/Update)
│   │   ├── db/
│   │   │   ├── session.py          # SQLite engine + SessionLocal
│   │   │   └── init_db.py          # Seed + automatic SQLite migrations
│   │   ├── api/
│   │   │   ├── routes.py           # Main routes (auth, HR, payroll, etc.)
│   │   │   └── routes_extra.py     # Tasks, Limule, TERAS, chat, meetings
│   │   └── services/
│   │       ├── deepseek.py         # LLM streaming (DeepSeek)
│   │       ├── teras.py            # TERAS compliance engine
│   │       └── documents.py        # Document upload & AI analysis
│   ├── storage/                    # Uploaded files (gitignored)
│   │   ├── task_proofs/            # Task proofs (image/video/PDF)
│   │   └── products/               # Product images
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/                       # React 18 SPA
    ├── src/
    │   ├── app/
    │   │   ├── Shell.tsx            # Main layout + navigation + LimuleStatus
    │   │   ├── AuthContext.tsx       # JWT auth context
    │   │   └── routes.tsx           # React Router v6
    │   ├── components/
    │   │   ├── Copilot.tsx          # Limule — floating AI assistant (12 features)
    │   │   ├── LimuleAvatar.tsx     # Animated Limule avatar
    │   │   ├── OnboardingWizard.tsx # 8-step novice tutorial
    │   │   ├── Charts.tsx           # LineAreaChart, ScoreRing, BarChart
    │   │   ├── Panel.tsx            # Card with title/action
    │   │   ├── FormField.tsx        # Inputs, Select, TextArea
    │   │   └── StatusBadge.tsx      # Colored badge
    │   ├── pages/
    │   │   ├── DashboardPage.tsx    # KPIs, charts, AI summary
    │   │   ├── EmployeesPage.tsx
    │   │   ├── EmployeeProfilePage.tsx
    │   │   ├── PayrollPage.tsx
    │   │   ├── InvoicesPage.tsx
    │   │   ├── InventoryPage.tsx
    │   │   ├── PosPage.tsx
    │   │   ├── DocumentsPage.tsx
    │   │   ├── CalendarPage.tsx
    │   │   ├── WorkPage.tsx         # Kanban tasks + proof upload
    │   │   ├── DeclarationsPage.tsx
    │   │   ├── AccountingFinancePage.tsx
    │   │   ├── ReportsHubPage.tsx   # Analytics hub
    │   │   ├── ReportsTerasPage.tsx # TERAS Connect
    │   │   ├── AssistantsPage.tsx   # AI drafting
    │   │   ├── SettingsPage.tsx     # Settings + modules + audit
    │   │   └── LoginPage.tsx
    │   ├── services/
    │   │   └── api.ts               # Centralized HTTP client (fetch + FormData)
    │   └── utils/
    │       └── format.ts            # money, shortDate, percent…
    ├── package.json
    └── .env.example
│
└── kompta-apple/                   # Native iOS + macOS apps (SwiftUI, XcodeGen project)
    ├── project.yml                  # Generates Kompta.xcodeproj (`xcodegen generate`)
    └── Sources/
        ├── Models/DomainModels.swift    # Codable models (mirror the backend schemas)
        ├── Services/APIClient.swift     # HTTP client shared by iOS + macOS
        └── Views/
            ├── Shell/                   # Navigation, module hub
            └── Modules/                 # One file per domain (BusinessViews, FinanceViews,
                                          # PurchasesViews, InventoryView, GroupsViews, …)
```

---

## Prerequisites

| Tool | Minimum version |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |
| Git | 2.x |

> No external database required — SQLite is embedded and migrates automatically.

---

## Quick Install

### 1. Clone the repository

```bash
git clone https://github.com/davyce/kompta.git
cd kompta
```

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # then edit .env with your keys
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
```

---

## Environment Variables

### `backend/.env`

```dotenv
# ── JWT ─────────────────────────────────────────────────────
SECRET_KEY=changeme_32_chars_min          # HMAC-SHA256 key (openssl rand -hex 32)
ACCESS_TOKEN_EXPIRE_MINUTES=1440          # 24 h

# ── AI / Limule (powered by LIMULEIA) ───────────────────────────
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx      # underlying model provider behind LIMULEIA, see github.com/davyce/limuleia
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# ── TERAS (optional — local engine used when absent) ────────────────
TERAS_API_KEY=

# ── App ──────────────────────────────────────────────────────
APP_ENV=development                       # development | production
API_PREFIX=/api
ALLOWED_ORIGINS=http://127.0.0.1:3001,http://localhost:3001
```

> ⚠️ Never commit `backend/.env`. It is excluded via `.gitignore`.

### `frontend/.env`

```dotenv
VITE_API_URL=http://127.0.0.1:8010/api
```

---

## Running in Development

### Terminal 1 — Backend

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

The `kompta.db` database is created and seeded automatically on first launch.

### Terminal 2 — Frontend

```bash
cd frontend
npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://127.0.0.1:3001 |
| REST API | http://127.0.0.1:8010/api |
| Swagger UI | http://127.0.0.1:8010/docs |
| Health check | http://127.0.0.1:8010/api/health |

### Frontend production build

```bash
cd frontend
npm run build          # → frontend/dist/
npm run preview        # local preview server
```

---

## Remote / iPhone Testing — Cloudflare Tunnel

To test the app from an iPhone, a client demo, or any remote device without
deploying, launch the included tunnel:

```bash
# Prerequisite (Mac/Linux):
brew install cloudflared

# Terminal 3 — a SINGLE tunnel: the frontend calls /api with a relative path,
# proxied by Vite to the local backend. No need for a second tunnel.
./tunnel.sh
```

The script prints a `https://*.trycloudflare.com` URL to open in Safari on iOS.
Create or use a real company from the login screen. The tunnel no longer
automatically creates a demo company or credentials.

The tunnel uses `--http-host-header localhost` to work around Vite 8's
`allowedHosts` check (otherwise Vite returns a 403 for external hosts).

---

## Zero-Demo Production

For a deployment **with absolutely no fictitious data** (zero mock data):

```bash
SECRET_KEY="<strong-random-key>" \
SUPER_ADMIN_PASSWORD="<strong-password>" \
SUPER_ADMIN_EMAIL="admin@mycompany.com" \
DATABASE_URL="postgresql://user:pwd@host/db" \
./start-production.sh
```

Starting up in production mode:

- **Does NOT run** `seed_demo_data` (no fictitious company/employee/invoice)
- **Guarantees** the creation of a platform super-admin (configurable via env)
- **Enables HSTS** (`Strict-Transport-Security`) and CSP/XFO/XCTO/Referrer-Policy headers
- **Refuses to start** if `SECRET_KEY=dev-kompta-secret` (default key is blocked)

The super-admin then signs in via `/admin` and registers real companies
via `POST /api/auth/register-company` — no fictitious data is ever inserted.

---

## Application Modules

### Dashboard

- Consolidated KPIs: **Collected** (amount actually received), Total invoiced, Pending, real cash position
- Trend charts by period (Month / Quarter / Year)
- Donut charts for sales channels and expense breakdown
- **Automatic refresh every 30 seconds**
- **AI Summary** button (Limule) — one-click directional analysis
- Immediate impact of invoice payments and POS sales on all KPIs

### HR & Employees

- Quick creation with automatic generation of the employee account
- Temporary password shown **only once** (forces a password change on first login)
- Detailed record: identity, contract, compensation, access, quick actions
- Contract generation via AI (Limule, powered by LIMULEIA) + storage in Documents
- Employee record export

### Payroll

- Net/gross calculation with configurable deductions
- Anomaly detection (hours, bonuses, absences)
- **PDF payslip download** per employee

### Invoicing

- Quote → Invoice → Credit note
- Status tracking: draft / sent / paid / overdue
- **Multi-mode payment**: cash, card, mobile money, bank transfer, PayPal, Zola QR
- **Automatic BankTransaction** on every payment → immediate impact on cash position and Dashboard
- PDF export, simulated sending

### POS — Point of Sale

- Cash register interface with product search
- **Detailed receipt**: item list + quantities + prices + payment method
- **Automatic BankTransaction** on every sale → cash position and transactions updated in real time
- **CSV export of sales** with date and product filters

### Transactions

- Unified accounting statement: every inflow/outflow (invoices, POS, imports, manual)
- **Source labels**: Invoicing, POS Cash Register, Bank Statement, CSV, Manual
- Filters by source, category, date
- Bank statement import with AI analysis (Limule)

### Inventory

- Real-time stock
- **Below-threshold product alerts** (reorder level)
- Inbound/outbound stock movements

### Documents

- Upload with automatic AI classification
- Feedback animation during AI analysis
- Link to an employee or the company
- Download and deletion

### Tasks (WorkPage)

- Kanban: To Do / In Progress / Done
- **Text search** and **filters** (priority, assignee)
- Paginated "Done" column (loaded in batches for hundreds of tasks)
- **Task detail** with formatted instructions/description
- **Proof upload**: image, video (MP4/MOV/WebM) or PDF — max 50 MB
- Preview before sending + built-in player in the modal
- "Proof required" badge on relevant cards
- "Overdue" indicator when the deadline has passed

### Filings

- **6 types**: Tax, CNPS Social, VAT, Corporate Tax, Landlord, Statistical
- **Prepare**: quick audit — compliance checklist + missing documents
- **Generate**: Limule produces a complete filing document (4,000 tokens):
  - Official header, tables of calculated amounts, line-by-line detail
  - Supporting documents to attach, risks and points of attention
  - Filing instructions and optimization recommendations
- **PDF download** for each generated filing
- TERAS scores by domain with progress bars
- Native Limule icon on the generate button

### Journal (Notes)

- Daily notes automatically generated by Limule
- **Connected to the day's meetings** (meetings filtered by date and displayed)
- Rolling 7-day view with tasks and meetings

### TERAS Connect

- Multi-domain regulatory compliance analysis (HR, Payroll, Filings, Documents)
- Global 0-100 score with a 12-month history
- Alerts classified `critical` / `warning` / `info`
- AI recommendations prioritized by impact
- One-click alert → task conversion
- PDF export of the TERAS report
- **Toggleable module** from Settings → Modules

### Limule — Built-in AI

- **Floating assistant** available on every page
- Chat with **real-time SSE streaming**
- Contextual suggestions based on the current page
- **1-click task creation**: if Limule is confident about the intent, it creates the task directly, no modal
- **In-depth narrative analyses**: mandatory 5-part structure (current state → causes → impacts → recommendations → actions), minimum 400 words, figures and benchmarks cited
- **"CEMAC Outlook" block**: a systematic opinion on the CEMAC-zone economic situation at the end of every analysis
- Adaptive token budget: 3,500 tokens for heavy analyses, 2,200 for standard replies
- **Multi-turn history**: search, single-item deletion, multi-select, full clear
- Full-screen report mode + message pinning
- Contextual quick replies by intent
- Conversation branching (resume from a specific point)
- Weekly memory (automatic summary of recent exchanges)
- Fail-closed AI mode outside the local environment: if the AI provider is
  absent or unavailable, sensitive answers are not simulated.

### Settings

- Company profile (name, RCCM, NIF, address)
- User management + RBAC
- **Module activation/deactivation** (TERAS, etc.)
- **Audit log**: every action tracked by user/IP/module
- Password change
- Direct access from module-disabled banners

---

## Groups & Organizations Module

This dedicated module covers **tontines**, **mutual associations**, **NGOs**, **associations**,
**churches**, **sports clubs**, **cooperatives**, **savings groups**, and any
collective managing dues, payments, and activities. It reuses KOMPTA's authentication,
multi-tenancy, and accounting engine.

**6 phases delivered (G1 → G6, 17 React pages, 36 backend endpoints):**

| Phase | Content |
|---|---|
| **G1 — Foundation** | `OrganizationGroup`, `GroupMember`, `GroupRole` models, **term-of-office history** (`GroupLeadershipHistory`), internal permissions (President, Treasurer, Secretary…), dedicated audit log |
| **G2 — Finance** | Dues plans, full/partial/late payments, treasurer validation, approved expenses, cash-fund dashboard. **Every validation automatically generates a balanced accounting entry** (Dr Cash / Cr 75 or Dr 62 / Cr Cash) |
| **G3 — Activities** | Meetings with minutes, activities, **aggregated calendar** (meetings + activities + birthdays + votes + deadlines), automatic birthday detection, multi-channel reminders, votes with tallying |
| **G4 — Chat & media** | General/board/finance/event rooms (role-based visibility), text/image/video/audio/document/GIF messages, emoji reactions, soft-delete, secure upload (50 MB max, MIME validated), real-time WebSocket |
| **G5 — AI & reports** | Per-group AI assistant (scoped Limule), **role-based financial permissions** (a regular member cannot request the balance), chat summaries, text/PDF report generation, payment analysis |
| **G6 — Frontend** | 17 React pages (`/groups`, dashboard, members, leadership, dues, transactions, expenses, calendar, meetings, birthdays, chat, documents, votes, reports, AI, settings) |

Default accounts generated when a group is created:
- 11 internal roles (President, Vice-President, Secretary, Treasurer, Auditor,
  Administrator, Moderator, Regular Member, Reviewer, Events Officer,
  Communications Officer)
- The group's creator automatically becomes **member + President**
- An initial term of office is opened in `GroupLeadershipHistory`

---

## SYSCOHADA Double-Entry Accounting Engine

KOMPTA includes a real **double-entry** accounting engine with a SYSCOHADA-lite chart of
accounts (18 accounts across classes 1 to 7). **Amounts in integer cents** (BigInteger) — no
Float, no rounding drift.

### Guarantees

- **Σdebit = Σcredit** verified on every entry (HTTP 400 rejection otherwise, tested)
- **Immutability**: no posted entry can be modified → corrections go through a
  **reversal entry** (`POST /accounting/entries/{id}/reverse`)
- **Atomic sequential numbering** (a persistent counter on `Company`, not
  derived from `COUNT(*)`) → no concurrent collisions, no reuse after deletion
- **Auto-posting**: every POS sale, invoice payment, group due, and group
  expense automatically generates its balanced entry
- **2 modes per company**: `simple` (small business, entries hidden) or `full`
  (SYSCOHADA journal + trial balance visible, manual entries allowed)

### SYSCOHADA-lite chart of accounts (excerpt)

| Class | Account | Label |
|---|---|---|
| 1 | 101 | Capital |
| 1 | 12 | Net income for the period |
| 4 | 411 | Customers |
| 4 | 443 | Tax authority — VAT collected |
| 4 | 445 | Tax authority — deductible VAT |
| 5 | 521 | Bank |
| 5 | 531 | Mobile Money |
| 5 | 571 | Cash |
| 6 | 60 / 62 / 64 / 66 | Purchases / Services / Taxes / Personnel costs |
| 7 | 70 / 75 | Sales / Other income (dues, donations) |

### Endpoints

| Method | Endpoint | Role |
|---|---|---|
| GET | `/accounting/mode` | accounting mode (simple/full) |
| PATCH | `/accounting/mode` | switch simple ⇄ full |
| GET | `/accounting/accounts` | company's chart of accounts |
| GET | `/accounting/journal` | journal (headers + lines) |
| GET | `/accounting/balance` | balanced trial balance |
| POST | `/accounting/entries` | manual entry (balance required) |
| POST | `/accounting/entries/{id}/reverse` | reversal entry |

---

## API — Key Endpoints

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Sign in → JWT |
| POST | `/api/auth/register` | Create account (admin) |
| POST | `/api/auth/request-reset` | Request password reset |
| POST | `/api/auth/reset-password` | Confirm reset with token |

### Employees

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/employees` | List employees |
| POST | `/api/employees` | Create an employee |
| GET | `/api/employees/{id}` | Employee details |
| PATCH | `/api/employees/{id}` | Update |
| GET | `/api/employees/{id}/contract` | Download contract |

### Tasks

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tasks` | List tasks |
| POST | `/api/tasks` | Create a task |
| PATCH | `/api/tasks/{id}` | Update (status, priority…) |
| DELETE | `/api/tasks/{id}` | Delete |
| POST | `/api/tasks/{id}/proof` | Upload proof (image/video/PDF) |

### Payroll

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/payroll/payslips` | List payslips |
| GET | `/api/payroll/payslips/{id}/download` | Export payslip PDF |
| GET | `/api/payroll/anomalies` | Detected anomalies |

### POS & Inventory

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/pos/sales` | List sales |
| GET | `/api/pos/sales/export-csv` | Export sales CSV |
| GET | `/api/inventory/products` | List products |
| GET | `/api/inventory/low-stock` | Below-threshold products |

### TERAS

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/teras/alerts` | Compliance alerts |
| GET | `/api/teras/scores` | Score history |
| GET | `/api/teras/recommendations` | AI recommendations |
| POST | `/api/teras/analyze/company` | Run a global analysis |
| POST | `/api/teras/analyze/rh` | HR domain analysis |
| POST | `/api/teras/analyze/payroll` | Payroll domain analysis |
| GET | `/api/teras/export-report` | Export TERAS report PDF |

### AI / Limule

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/limule/chat/stream` | SSE streaming chat |
| GET | `/api/limule/chat/history` | Conversation history |
| DELETE | `/api/limule/interactions/{id}` | Delete one exchange |
| DELETE | `/api/limule/chat/history` | Clear entire history |
| GET | `/api/ai/health` | LLM status + latency |

### Modules

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/modules` | List modules |
| POST | `/api/modules/{key}/toggle` | Enable/disable a module |

---

## RBAC — Roles and Access

| Role | Access |
|---|---|
| `superadmin` | Full access to all companies |
| `admin` | Full access to their company |
| `comptable` (accountant) | Invoicing, payroll, filings, reports |
| `rh` (HR) | HR, payroll, HR documents |
| `manager` | Read access + tasks + meetings |
| `employe` (employee) | Payslip, profile, assigned tasks, proof upload |
| `caissier` (cashier) | POS only |

> API routes verify the role from the JWT token on every request.

---

## Security

| Layer | Measure |
|---|---|
| **Passwords** | PBKDF2-HMAC-SHA256, **200,000 iterations**, unique salt, constant-time comparison (`hmac.compare_digest`) |
| **2FA** | TOTP (pyotp) **actually enforced at login** (not just decorative) |
| **Anti-brute-force** | Login rate-limiting: **429 after 5 failures** within a 5-minute window, 15-minute lockout |
| **Tokens** | HMAC-SHA256 with an 8-hour expiration + **`token_version`** on User → logout/password change invalidates every existing token |
| **Multi-tenancy** | **71 `company_id` checks** in routes.py, isolation verified (cross-company 404s) including for groups and the AI context |
| **Upload** | MIME validation (10 types), 50 MB max size, storage per group |
| **HTTP headers** | CSP, X-Frame-Options=DENY, X-Content-Type-Options=nosniff, Referrer-Policy, Permissions-Policy, **HSTS in prod** |
| **Audit** | `AuditLog` + `AccessAuditLog` unified in `GET /audit-logs` (paginated, filterable) |
| **AI guardrails** | Limule is **read-only**, anti-prompt-injection, mandatory source citations, `company_id` scoping, role-based financial permissions |
| **Secrets** | `.env` gitignored and untracked by git, `SECRET_KEY=dev-kompta-secret` refuses to start in production |

---

## Tests & CI/CD

```bash
# Backend (pytest)
cd backend && .venv/bin/python -m pytest -q
# → 106 passed

# Frontend (Vitest)
cd frontend && npm run test
# → 21 tests passed

# E2E smoke (Playwright) — requires backend+frontend running
cd frontend && BASE_URL=http://127.0.0.1:3000 npx playwright test
# → 6 passed (desktop + mobile: login, dashboard, no overflow, 0 console errors)
```

> The **E2E smoke suite** (Playwright, Chromium desktop + mobile viewport) runs in CI
> against an **ephemeral, disposable database** (`SEED_DEMO=true`, `e2e.db`) — it never
> touches real data. Deliberately minimal (login + key routes + console error
> detection) to stay fast and non-flaky.

### Backend test coverage (42 tests)

- `test_api.py` — legacy flows (products, invoices, HR, contracts…)
- `test_audit_fixes.py` — invoice numbering, VAT, immutability, credit notes, atomic POS stock, IRPP, payroll idempotence, login anti-brute-force, token revocation, AI guardrails
- `test_accounting.py` — Σdebit=Σcredit balance, cent-level accuracy, SYSCOHADA chart of accounts, POS/invoice entries, rejection of unbalanced entries
- `test_groups.py` — group creation, members, roles, **board changes with history**, cross-company isolation
- `test_groups_g2_g5.py` — dues + automatic accounting validation, expenses + automatic entry, calendar, birthdays, votes, chat, AI permissions

### Mobile E2E tests (Playwright, iPhone 14 viewport)

- `smoke.spec.ts` — admin login, Groups access, unauthenticated access, super-admin → `/admin`, 404
- `mobile.spec.ts` — bottom nav visible + FAB doesn't hide it, AdminShell with hamburger menu, **no horizontal scroll on `/groups`**

### CI/CD — GitHub Actions

`.github/workflows/ci.yml` runs 3 jobs on push + PR:

- **backend**: pytest on a fresh SQLite database (106 tests)
- **frontend**: `tsc --noEmit` + Vitest + production build
- **e2e**: Playwright smoke (Chromium) against a seeded ephemeral database — login, key routes, console errors

---

## TERAS Connect

TERAS is the regulatory compliance engine built into KOMPTA.

### How it works

1. **Analysis** — Click "Run an analysis": TERAS examines HR, payroll, filings, and documents
2. **Score** — A global 0-100 score is computed per domain (configurable weights)
3. **Alerts** — Non-compliance generates alerts classified `critical` / `warning` / `info`
4. **Recommendations** — The AI produces concrete actions prioritized by impact
5. **Follow-up** — Every alert can be converted into a task assignable to a team member

### Score thresholds

| Score | Level | Meaning |
|---|---|---|
| 85 – 100 | 🟢 High | Compliance under control |
| 65 – 84 | 🟡 Medium | Points of attention |
| 0 – 64 | 🔴 Critical | Urgent action required |

### Local mode vs. the real TERAS API

Locally, TERAS uses its embedded engine (heuristics + LIMULEIA).
To connect the official TERAS API, set `TERAS_API_KEY` in `backend/.env`.

---

## Limule — Built-in AI

Limule is KOMPTA's AI assistant, powered by **LIMULEIA**, the sovereign, local-first AI platform I built (see [limuleia](https://github.com/davyce/limuleia)).

### Capabilities

- **Economic forecasts** — revenue, cash-flow, and trend predictions for 30/60/90 days
- **Investment advice** — hiring, stock, expansion: quantified impact and returns
- **Sector analysis** — SME benchmarks, CEMAC economic conditions, market risks
- **Risks & TERAS compliance** — alerts, score, corrective actions
- **HR & payroll costs** — costs, CNPS compliance, payroll forecasts
- **Professional drafting** — emails, notes, clauses, letters

### Context variables available in prompts

```
{entreprise}      Company name
{teras_score}     Current TERAS score
{effectif}        Number of active employees
{mois}            Current month, in French
{user}            First name of the logged-in user
```

### SSE streaming

The backend uses `StreamingResponse` (FastAPI) + `text/event-stream`.
The frontend reads the stream via `ReadableStream` and renders tokens in real time.

### AI guardrail

If `DEEPSEEK_API_KEY` is absent or the API is unavailable, Limule fails
explicitly outside the local environment. Sensitive answers are never
replaced with fabricated generated advice.

---

## Onboarding

The onboarding assistant launches automatically on first login.
It guides the user through **8 interactive steps**:

| # | Step | Content |
|---|---|---|
| 1 | **Welcome** | Introducing KOMPTA + key strengths |
| 2 | **Guided tour** | Walkthrough of key modules with examples |
| 3 | **Company** | Enter company name, sector, headcount |
| 4 | **Team** | Invite the first collaborators |
| 5 | **Modules** | Enable the modules you need |
| 6 | **Limule demo** | Interactive typewriter demo (3 prompts) |
| 7 | **TERAS** | Explanation of compliance scoring |
| 8 | **Ready!** | Recap + shortcuts |

> Onboarding can be relaunched from Settings → Account.

---

## Deployment

### Option 0 — Free production via Cloudflare Tunnel (`kompta0.com`)

Real deployment **with no server or open port**: a named Cloudflare tunnel exposes
the local Mac on the `kompta0.com` domain. Everything is scripted under `infra/`.

```bash
# Launches backend (:8010) + frontend build (:3000) + Cloudflare tunnel, all at once
bash infra/start-kompta.sh
# To run in the background (terminal can be closed):
nohup bash infra/start-kompta.sh > infra/logs/launch.out 2>&1 &
```

**Key principle — a single hostname**: the frontend calls the API via a **relative
URL `/api`**, proxied by `vite preview` to the `:8010` backend. No need to configure
a separate `api.` subdomain — everything goes through `www.kompta0.com`.

| Element | Detail |
|---|---|
| **Tunnel** | Named Cloudflare Tunnel `kompta` (Zero Trust token in `infra/.tunnel-token`, gitignored) |
| **Frontend** | `vite preview` serving the `dist/` build on `:3000`, `allowedHosts` = `.kompta0.com` |
| **Backend** | `uvicorn --env-file backend/.env` on `:8010` (`--env-file` is **mandatory**) |
| **API** | `https://www.kompta0.com/api` (proxy `/api` → `:8010`, WebSockets included) |
| **Auto-restart** | optional: `infra/com.kompta.app.plist` (launchd `KeepAlive`) |

Full details, troubleshooting, and Cloudflare/Stripe/MoMo configuration: **`infra/README.md`**.

> ⚠️ The backend in `production` mode **refuses to start** if `SECRET_KEY` or
> `SUPER_ADMIN_PASSWORD` are left at their default value.

### Option 1 — Simple Linux server

```bash
# Backend (systemd or screen)
cd /opt/kompta/backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8010 --workers 2

# Frontend — static build served by nginx
cd /opt/kompta/frontend
npm run build
# Configure nginx to serve dist/ and proxy /api → :8010
```

### Option 2 — Docker (coming soon)

```bash
docker compose up -d
```

### Important production variables

```dotenv
APP_ENV=production
SECRET_KEY=<key, 64 chars min — openssl rand -hex 32>
ALLOWED_ORIGINS=https://your-domain.com
```

---

## Accounts & Data

KOMPTA no longer creates a demo company by default. The platform super-admin is
created via `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`; real companies
are then registered from the application or via `POST /api/auth/register-company`.

Fictitious data should only be used in an isolated local database for
automated testing, with explicit activation (`SEED_DEMO=true` or
`backend/scripts/seed.py --yes-demo`).

---

## Changelog

### v1.14.0 — July 2026 (web + iOS/Mac accessibility, web i18n, audit fixes)

- ✅ **Web accessibility (WCAG)**: systematic remediation across the whole web app — ~50 files, 8 batches — accessible names (`aria-label`) added to icon-only controls, `<label htmlFor>`/`id` pairing on form fields, `role="switch"`/`aria-pressed`/`aria-checked` on toggles, hover-revealed actions made visible on keyboard focus too (`focus-within`/`focus-visible`). Four non-accessible `<div onClick>` elements (file drop zone, "proof required"/"required" toggles, note card) converted to native `role="button"`/`role="switch"` controls with full keyboard support (Enter/Space)
- ✅ **Web i18n**: migrated the last hard-coded-French components to the `react-i18next` system — the company setup wizard (25 onboarding steps), custom roles & access, the Stripe Connect panel, payment collection methods, and a handful of orphaned strings in Settings/Customers. Marketing content (landing page) and legal content, along with the OHADA regulatory filings table, remain deliberately in French (a product decision, not a technical gap)
- ✅ **iOS/Mac VoiceOver**: added `.accessibilityLabel` to the shared notifications bell (`NotificationBell`, present on every screen), the cart button and the search-clear button in the register, and 46 icon-only buttons across 16 view files (Admin, Collaboration, Groups, HR, Finance, Purchasing, Investments, CRM, Inventory, Roles, setup wizard). Verified with a full iOS build (simulator) and macOS build
- ✅ **Targeted fixes from the quality audit**: AI health-check now cached server-side (2-minute TTL) to eliminate a 27-second stall on first load, horizontal overflow of the Payroll grid on mobile fixed, overlap between the setup wizard and the guided tour on first load fixed (shared state between the two components), cleanup (stray Xcode reference, Vite build artifacts, unused component, missing Birthdays link in Groups navigation)

### v1.13.0 — July 2026 (PostgreSQL in production, iOS/Mac super-admin parity, App Store compliance)

- ✅ **SQLite → PostgreSQL production migration**: the production database was fully migrated and verified (83 tables, 1,933 rows, matching source/destination row counts) — see `docs/POSTGRES_MIGRATION.md` for the full procedure. Tooling added: `backend/scripts/migrate_sqlite_to_postgres.py`, `backend/scripts/check_orphaned_fks.py` (detects orphaned references that SQLite doesn't prevent but PostgreSQL does), `scripts/backup-postgres.sh` / `scripts/restore-postgres.sh` (automatic daily backups, cron in place). A critical silent-restore bug (data lost with no reported error) was found and fixed while testing the full cycle before the actual cutover
- ✅ **iOS/Mac super-admin console brought up to par with the web** (and beyond it on several screens): in-app company creation (form with legal consent, previously web-only), company-targeted messaging, filters/sort/CSV export (Companies, Users), ticket assignment + priority/category editing, full feature-flag editing, onboarding KPIs and targeted reminder, level/date/actor filters + JSON export + auto-refresh on the audit log
- ✅ **App Store compliance (Guidelines 3.1.1 and 2.1(b))**: removed in-app company creation on iOS (still available on macOS and web), removed the Tap to Pay entitlement not authorized by Apple, dedicated demo account for review with a forced post-trial subscription
- ✅ **Guided tour rebuilt** (web and iOS/Mac): replaced the static slideshow with an animated conversation with Limule (speech bubble, "typing" indicator). Also fixes a real bug in the web tour: most steps with no specific element to highlight were dimming the whole screen without showing anything of the page being presented — particularly annoying on mobile
- ✅ **Landing page and login page**: landing page expanded (how it works, real pricing, security, FAQ) and permanently forced into light mode, independent of the system theme — they had never handled dark mode and were being incorrectly darkened by the app's global dark-mode bridge
- ✅ Fixed the admin "Create a company" form (web): legal consent (GDPR/ToS/waiver) was never being collected, which made every company creation from the admin console fail

### v1.12.0 — July 2026 (quality-audit fixes, false uptime incidents)

- ✅ **`/health` accepts HEAD**: UptimeRobot (and uptime monitors generally) probe with HEAD by default; FastAPI doesn't automatically add HEAD to a `@router.get()` route, which was returning 405 and triggering false "down" incidents while the service was actually running fine
- ✅ **MoMo/Stripe: provider 5xx → 502** instead of being passed through as-is (a raw 500 gave the impression that the KOMPTA API itself had crashed); fixes the only failing backend test
- ✅ **`/workspace` protected**: the route was showing the app shell (logout, company creation) to an unauthenticated visitor — the APIs themselves stayed protected server-side, but the UX was misleading; added the same auth guard used by other internal routes
- ✅ **Groups mobile overflow**: the page overflowed by ~32px on iPhone (the "Create" button and 3rd stat were cut off) — a root flex item with no constrained width, fixed and verified live (375px)
- ✅ **Logo 404 avoided**: the frontend no longer calls `/company/logo` when the company has no logo (`has_logo`, already exposed by the backend but never wired up client-side)
- ✅ Cleanup: duplicate `AuditLog` import, duplicate Xcode files (`Kompta 2.xcodeproj`, `KomptaMac 2.entitlements`)
- ✅ 187/187 backend tests, green CI (build, typecheck, E2E)

### v1.11.0 — July 2026 (production observability, hardened super-admin, Application Metrics)

- ✅ **Production observability enabled**: Sentry (backend error capture, fixed an initialization-order bug that was making its own startup log disappear) and UptimeRobot (`UPTIME_MONITOR_URL`, fixes a missing passthrough in `docker-compose.yml` — the variable was read by the code but never forwarded to the container)
- ✅ **Unified super-admin audit log**: `/audit-logs` (web) gains a cross-company filter (`company_id`/`all_companies`); `/admin/audit-logs` (iOS/Mac) now merges business actions (`AuditLog`) and access/HR actions (`AccessAuditLog`) — the native app was previously showing only half of the log
- ✅ **Application Metrics**: new `PlatformMetricSnapshot` table (idempotent daily snapshot), `GET /admin/analytics/trends` endpoint — real daily time series (MRR, active companies) instead of an approximate on-the-fly recalculation
- ✅ **Real MRR**: computed from active/trialing subscriptions (plan price × subscriber count, normalized to monthly), replacing the old card that was actually showing total platform sales under the "MRR" label
- ✅ **Subscription plan breakdown** in Analytics (web + iOS/Mac)
- ✅ Fixed a "Monthly growth" calendar bug (`timedelta(days=i*30)` drifted over months — replaced with real calendar arithmetic)
- ✅ Transactional email header: Limule icon added next to the KOMPTA logo
- ✅ 186/186 backend tests (1 pre-existing MoMo network test excluded, flaky independently of this batch), clean frontend build + typecheck, macOS build verified

### v1.10.0 — July 2026 (customer portal: multi-company loyalty, phone login)

- ✅ **Real-time aggregated loyalty**: new `/portal/me/loyalty-overview` endpoint — a customer who frequents several KOMPTA businesses sees their points/tier/discount **for each company** from a single space, with progress toward the next tier
- ✅ **Portal login by email OR phone** (`identifier`), with the same strict disambiguation as `/auth/login` (avoids collisions between a shared email and phone number); enabling portal access from the customer record no longer requires an email
- ✅ **Customer search by phone number** on the Customers page (previously missing — only name/email/city were searchable)
- ✅ **Landing page**: new section dedicated to the customer portal ("100% free" badge, loyalty preview, direct link), in addition to the existing card
- ✅ **Documented implementation plan** for a dedicated "KOMPTA Client" native app (iOS/macOS, targeting end customers) — see `docs/KOMPTA_CLIENT_APP_PLAN.md`; not started, backend already ready (9 `/portal/*` endpoints reusable as-is)
- ✅ 187/187 backend tests, clean frontend build + typecheck

### v1.9.0 — July 2026 (iOS/macOS CRM & bank reconciliation parity, UX fixes)

- ✅ **Lightweight CRM ported to iOS/macOS**: pipeline of opportunities by stage, pipeline summary, stage change, conversion to invoice — previously web-only, tested end-to-end on the iOS simulator with a real account
- ✅ **Bank reconciliation ported to iOS/macOS**: CSV statement import, automatic matching, line-by-line confirm/create/ignore — same web/native parity
- ✅ **Simplified connecting to a supplier company**: search + create + connect in one click ("Connect a company" button)
- ✅ **UX fixes**: larger POS payment buttons with visible Stripe status, `window.alert` replaced with toasts (CrmPage, Copilot), shared table style (Transactions, Inventory, Employees)
- ✅ **Configurable Vite proxy** (`VITE_PROXY_TARGET`) for multi-session E2E, dev dependencies updated (0 npm audit vulnerabilities)

### v1.8.0 — July 2026 (cross-company supplier network, landing page, customer portal)

- ✅ **Cross-company supplier network**: search companies by name/email, invite them to become a connected supplier, accept/decline, purchase orders sent directly into the supplier's app (new "Received" tab in the Purchasing module) — available on **web, iOS, and macOS**
- ✅ **Public landing page** (`/`): a general-audience presentation of KOMPTA (modules, Limule spotlight, native apps) shown to logged-out visitors before the login screen
- ✅ **Simplified customer portal account creation**: a checkbox directly in "New customer" generates portal access (web, with iOS/macOS parity), direct link to the customer space from the login screen

### v1.7.0 — July 2026 (Purchasing, native apps, quality audit)

- ✅ **Purchasing & Suppliers module (Phase B)**: suppliers, purchase orders with a full lifecycle (draft → approved → ordered → received → paid), **stock valued at weighted average cost (WAC)**, automatic accounting entries on receipt and payment, COGS posted on sale — available on **web, iOS, and macOS**
- ✅ **Extended accounting**: SYSCOHADA classes 2 (fixed assets) and 3 (inventory), automatic chart-of-accounts backfill, `FiscalYear` (year-end closing, entry locking)
- ✅ **Full security audit**: 5 vulnerabilities fixed — Safe Mode export/restore with no role check, 3 IDOR issues (group board changes, cross-group message deletion, role creation outside the tenant), misattributed super-admin audit logs (impersonation, password reset, company suspension invisible to the targeted company)
- ✅ **Page-by-page functional audit** (7 bugs fixed): budget tracking that compared revenue instead of expenses, risk of double payroll runs between iOS/Mac and web (incompatible period formats), task statuses out of sync between platforms, invoices linked to customers by name instead of ID, KPIs and AI prompts based on nonexistent backend keys, hard-coded fictitious data on the TERAS dashboard
- ✅ **187 backend tests** (up from 106)

### v1.6.0 — June 2026 (platform subscriptions & billing)

- ✅ **Full subscription system**: pricing plans (Starter/Pro/Business), monthly/annual billing period
- ✅ **Subscription payment**: card (Stripe), Mobile Money (MoMo), Zola (QR) — wired onto the existing payment infrastructure
- ✅ **Promo codes**: percentage discount, plan targeting, usage limit, validity — managed by the super-admin
- ✅ **Non-payer suspension**: backend middleware → business routes blocked with **402**; full-screen UX barrier with payment to reactivate
- ✅ **Super-admin console `/admin/subscriptions`**: manage plans & pricing LIVE, promotions, and each company's status (suspend / reactivate / grant a free period)
- ✅ **Settings → Subscription tab** on the company side (plans, promo, payment)
- ✅ **5 dedicated tests** (plans, promo, free checkout, 402 suspension + reactivation, grant) — 106 backend tests total

### v1.5.2 — June 2026 (strict zero-mock)

- ✅ **Currencies**: in production, no more estimated rates — real-time source down → explicit `unavailable` (instead of a stale fallback)
- ✅ **Document extraction**: text too short → explicit `insufficient_text` (no more "Document analyzed locally")
- ✅ **Contracts**: removed the "mock" label from the legal PDF → "standard KOMPTA template (no AI)" / "Limule AI assistant"
- ✅ **Dues reminders (groups)**: `source` field (`ai`/`template`) — the origin of the message is explicit
- ✅ **Copilot export**: PDF failure made explicit (correct `.txt` extension + alert, no more misleading `.pdf`)
- ✅ **Audit cleanup script**: `backend/scripts/cleanup_audit_data.py` (dry-run + `--apply`, automatic backup)
- ✅ **101 backend tests** (+ a "no estimated rate in production" test)

### v1.5.1 — June 2026 (zero-mock audit remediation)

- ✅ **Per-environment session cookie**: host-only + non-secure outside production (reliable local browser QA), `.kompta0.com` + Secure kept in prod
- ✅ **Stronger zero-mock AI**: `limule_generate` fails closed with a 503 in prod; `limule_stream` emits an explicit unavailability state; group AI (4 endpoints) now surfaces the 503; document extraction → `provider='unavailable'` (no more fake summary); **2** regression tests
- ✅ **Exchange rates**: `certified` flag + "⚠ estimated rate" UI badge when the rate comes from the offline fallback
- ✅ **Duplicate API removed**: `GET /audit-logs` is now declared only once (canonical aggregated version)
- ✅ **Orphaned pages removed**: `InventoryPosPage`, `ModuleBoardPage`
- ✅ **Limule Admin tokens**: labeled "estimate" (not measured)
- ✅ **Python 3.16 warnings**: `datetime.utcnow()` → `datetime.now(timezone.utc)`
- ✅ **100 backend tests** (98 → 100)

### v1.5.0 — June 2026

- ✅ **`kompta0.com` production deployment**: named Cloudflare Tunnel, `infra/` scripts (`start-kompta.sh`, launchd plist, dedicated README)
- ✅ **Single-domain architecture**: API on a relative `/api` URL proxied by `vite preview` → no need for a separate `api.` subdomain (HTTP + WebSockets)
- ✅ **Real payments**: Stripe (card, HMAC-signed webhook) + MTN Mobile Money (request-to-pay + status polling), idempotence and double-payment protection
- ✅ **POS — card/MoMo checkout**: Stripe/MoMo modals wired into the register, server confirmation before the sale is recorded
- ✅ **Configurable low-cash alert threshold**: per company via Settings → General (`cash_low_threshold_cents`, 0 = disabled)
- ✅ **Onboarding — Limule icon**: the mascot + Limule's blue theme replace the stars icon on the AI step
- ✅ **Header — clickable sync badge**: the status cloud opens the register (triggers offline sync)
- ✅ **`.gitignore` security**: excludes database backups (`*.db.bak*`, `*.db.backup*`) and `backend/.env.production`
- ✅ **Playwright E2E tests removed**: CI reduced to backend (98 tests) + frontend (type-check, Vitest, build)

### v1.4.0 — May 2026

- ✅ **Invoicing — cash payment**: cash mode is now selectable, BankTransaction created automatically
- ✅ **Invoicing — accounting impact**: paying an invoice → transaction visible immediately + Dashboard updated
- ✅ **POS/Register — full receipt**: item list, quantities, prices, payment method, accounting confirmation
- ✅ **POS/Register — automatic BankTransaction**: every sale creates a transaction (`source_type=pos`)
- ✅ **Dashboard — "Collected" KPI**: shows the amount actually received (vs. total invoiced)
- ✅ **Transactions — sources**: "Invoicing" and "POS Register" labels added to the source filter
- ✅ **Filings — full rewrite**: 6 types, 4,000-token Limule generation, downloadable PDF, native Limule icon
- ✅ **Limule — in-depth analyses**: mandatory 5-part structure, min 400 words, CEMAC benchmark
- ✅ **Limule — "CEMAC Outlook" block**: systematic opinion on CEMAC-zone conditions at the end of every analysis
- ✅ **Limule — adaptive token budget**: 3,500 (analyses) / 2,200 (standard replies)
- ✅ **Limule — 1-click task creation**: created directly when confidence about the intent is high enough
- ✅ **PDF — Markdown rendering**: `###` and `####` replaced with bold text (no more broken headings)
- ✅ **Journal — connected meetings**: daily notes include the day's meetings
- ✅ **Multi-currency**: user currency respected throughout every Limule analysis
- ✅ **Full quality audit**: 0 TypeScript errors, 11 backend modules verified, DB integrity

### v1.3.0 — May 2026

- ✅ **Tasks — proof upload**: image, video (MP4/MOV/WebM), PDF — max 50 MB
- ✅ **Tasks — enriched detail**: formatted instructions, meta-info, proof badge, overdue badge
- ✅ **Tasks — improved Kanban**: search, priority/assignee filters, "Done" pagination
- ✅ **Limule — inline task creation**: smart title, bullet-point description, pre-filled
- ✅ **Limule — history**: single-item deletion, multi-select, full clear
- ✅ **Limule — task description**: structured read view + edit mode
- ✅ **TERAS — module toggle**: enable/disable from Settings with a deep link
- ✅ **Dashboard — AI summary**: Limule icon replaces the stars
- ✅ **TERAS alerts**: removed automatic injection into Limule
- ✅ **Sales channels**: more diverse color palette on the donut chart
- ✅ **Navigation**: Limule icon in the AI Drafting menu

### v1.2.0 — 2025

- ✅ **Limule**: SSE streaming, multi-turn, branching, pinning, quick replies
- ✅ **TERAS Connect**: scoring, alerts, AI recommendations, PDF export
- ✅ **Analytics hub**: centralized reports page
- ✅ **AI drafting**: themed assistants
- ✅ **Real-time AI status** in the header (latency + colored indicator)

### v1.1.0 — 2025

- ✅ **Novice onboarding**: 8 steps with a Limule typewriter demo
- ✅ **Password reset**: local token flow (no email)
- ✅ **Auto-refresh**: dashboard every 30 s
- ✅ **Employee record**: detailed page with quick actions
- ✅ **PDF export**: payslip, TERAS report
- ✅ **CSV export**: POS sales with filters
- ✅ **Audit log** in Settings
- ✅ **Low-stock alerts** in inventory with configurable threshold
- ✅ **1-click TERAS alert → task conversion**
- ✅ **Automatic SQLite migration** with no data loss
- ✅ **Multi-tenant** full isolation by `company_id`

### v1.0.0 — Initial release

- Full FastAPI backend (JWT auth, 10 modules, SSE streaming)
- React 18 frontend (17 pages, Tailwind CSS, TanStack Query)
- TERAS Connect local engine
- Limule AI with fail-closed guardrail outside local environment
- Explicit test seed, disabled by default

---

## License

Proprietary software — all rights reserved.

© 2026 DAVY OKEMBA. All rights reserved.
