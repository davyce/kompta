🇬🇧 **English** · [🇫🇷 Français](README.fr.md)

# KOMPTA — Intelligent Business Management Platform

> All-in-one AI-powered ERP for SMBs, NGOs, tontines, mutual associations, and collectives in the CEMAC zone.
> **SYSCOHADA double-entry accounting** · **POS** · **VAT invoicing** · **Payroll (CNSS + IRPP)** ·
> **Groups & Organizations module** · **Limule AI assistant** · **Lightweight offline-first mode**.
>
> Stack: **FastAPI 0.115** + **SQLAlchemy 2** + **SQLite/Postgres** · **React 18** + **TS** + **Vite 8** + **Tailwind** ·
> **Native iOS + macOS** (SwiftUI, `kompta-apple/`).
> Money handled in **integer cents** (BigInt) · **real payments** via Stripe (card) + MTN Mobile Money.
> Free production deployment via **Cloudflare Tunnel** (`kompta0.com`, single hostname).
> 187 backend tests + frontend unit tests · GitHub Actions CI/CD.

## Why

Most accounting/ERP tools assume reliable connectivity and Western banking rails. Kompta is built offline-aware from the ground up, with local payment providers (MTN Mobile Money) as first-class integrations rather than an afterthought — and with a data model wide enough to serve not just companies, but tontines, mutual associations, NGOs, and clubs.

## What it does

| Domain | Detail |
|---|---|
| **Dashboard** | Real-time KPIs, charts, 30s auto-refresh, AI summary |
| **HR & Employees** | Records, AI-assisted contracts, org chart, attendance, leave |
| **Payroll** | Payslips, CNSS (4% employee / 8% employer), progressive IRPP, PDF export |
| **Invoicing** | Pre-tax/VAT/total invoices, atomic anti-collision numbering, immutable paid invoices, credit notes |
| **Inventory** | Products, real-time stock, atomic anti-TOCTOU decrement, low-stock alerts |
| **Purchasing & Suppliers** | Purchase orders (draft → approved → ordered → received → paid), weighted-average-cost stock valuation, automatic accounting entries on receipt |
| **Light CRM** | Opportunity pipeline, per-stage summary, conversion to invoice — web + native iOS/macOS |
| **POS** | Cash register, detailed receipt, automatic accounting entry, CSV export |
| **Double-entry accounting** | SYSCOHADA-lite chart of accounts, guaranteed-balanced journal entries, general ledger, trial balance |
| **Bank reconciliation** | CSV statement import, automatic matching, line-by-line confirm/create/ignore — web + native iOS/macOS |
| **Client portal** | Free client-facing space, email or phone login, invoices + PDF + Mobile Money payment requests, loyalty aggregated in real time across every Kompta business a client visits |
| **Groups & Organizations** | Tontines, mutual associations, NGOs, clubs — members, board & terms, dues, cash box, real-time chat, calendar, votes, dedicated AI |
| **Tax filings** | Full AI-generated filings (VAT, corporate tax, CNPS), PDF, compliance checklist |
| **TERAS Connect** | Compliance scoring, regulatory alerts, AI recommendations |
| **Limule (AI)** | Streaming assistant, anti-injection guardrails, read-only, sourced citations |

## Roles (RBAC)

| Role | Access |
|---|---|
| `superadmin` | Full access, all companies |
| `admin` | Full access, own company |
| `comptable` (accountant) | Invoicing, payroll, filings, reports |
| `rh` (HR) | HR, payroll, HR documents |
| `manager` | Read + tasks + meetings |
| `employe` | Payslip, profile, assigned tasks |
| `caissier` (cashier) | POS only |

API routes check the role via JWT on every request.

## Security

| Layer | Measure |
|---|---|
| **Passwords** | PBKDF2-HMAC-SHA256, 200,000 iterations, unique salt, constant-time comparison |
| **2FA** | TOTP, actually enforced at login (not decorative) |
| **Anti-brute-force** | Rate-limited login: 429 after 5 failures in 5 minutes, 15-minute lockout |
| **Tokens** | HMAC-SHA256, 8h expiry, `token_version` invalidates all tokens on logout/password change |
| **Multi-tenancy** | 71 `company_id` checks across routes, verified cross-company isolation (404, not leakage) |
| **HTTP headers** | CSP, X-Frame-Options=DENY, X-Content-Type-Options=nosniff, HSTS in production |
| **Audit** | Unified `AuditLog` + `AccessAuditLog`, paginated and filterable |
| **AI guardrails** | Limule is read-only, anti-prompt-injection, mandatory source citations, scoped to `company_id` |
| **Secrets** | `.env` gitignored and untracked; refuses to boot in production on the default `SECRET_KEY` |

## Tests & CI/CD

- **Backend** — 106 pytest tests (invoicing numbering, VAT, immutability, atomic POS stock, payroll idempotence, anti-brute-force, token revocation, AI guardrails)
- **Frontend** — 21 Vitest unit tests
- **E2E** — Playwright smoke tests (desktop + mobile viewport) against an ephemeral seeded database, never real data
- **CI** — 3 GitHub Actions jobs on every push/PR: backend, frontend (`tsc --noEmit` + tests + build), E2E smoke

## TERAS Connect & Limule AI

**TERAS Connect** is the regulatory-compliance engine built into Kompta: it analyzes HR, payroll, filings, and documents, produces a 0–100 score per domain, raises classified alerts, and turns them into assignable tasks.

**Limule** is Kompta's AI assistant (DeepSeek-powered): economic forecasts, investment advice, sector benchmarks, HR/payroll cost analysis, and professional writing — streamed via SSE.

## Repository layout

```
backend/          FastAPI application (app/, migrations/, scripts/)
frontend/          React + TypeScript SPA
kompta-apple/      Native iOS + macOS client (SwiftUI)
infra/             Cloudflare Tunnel + AWS deployment scripts
```

## Status

This is an active, in-production project. See [README.fr.md](README.fr.md) for the full original documentation (French), including the complete API reference, deployment guide, and changelog.

---

Built by [Davy Okemba](https://github.com/davyce).
