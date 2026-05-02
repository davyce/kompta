# Briefing TERAS × KOMPTA — Contexte de collaboration

> **À qui s'adresse ce document :**  
> Ce briefing est destiné à l'IA avec laquelle je travaille sur le projet TERAS.  
> Il décrit ce que nous avons construit ensemble dans KOMPTA, comment TERAS y est intégré,  
> et quel rôle joue **Limule** dans l'ensemble du système.  
> Lis ce document en entier avant de continuer notre travail — il remplace tout contexte précédent.

---

## 1. Qu'est-ce que KOMPTA ?

KOMPTA est un **ERP local intelligent** conçu pour les entreprises africaines — PME, ONG, programmes financés, commerce de détail.  
Il fonctionne entièrement **en local** (pas de cloud requis), sur une stack technique légère :

| Couche | Technologie |
|--------|-------------|
| Backend | Python / FastAPI (port 8010) |
| Base de données | SQLite (SQLAlchemy ORM) |
| Frontend | React 18 + TypeScript + Vite (port 3001) |
| Styles | Tailwind CSS |
| Temps réel | WebSocket (chat + notifications) |

L'application est **multi-tenant** : chaque entreprise (`company_id`) a ses propres données, ses propres utilisateurs, et son propre score TERAS.

---

## 2. Les modules de KOMPTA

KOMPTA couvre l'ensemble du cycle opérationnel d'une entreprise :

| Module | Ce qu'il fait |
|--------|---------------|
| **Tableau de bord** | KPIs temps réel, alertes TERAS, onboarding, score global |
| **RH / Employés** | Dossiers, accès employé, contrats IA in-app, statuts, invitation |
| **Paie** | Cycles de paie, bulletins PDF, validation, export |
| **Facturation** | Création, brouillon/envoi, nom client optionnel, export PDF (ReportLab) |
| **POS / Caisse** | Ventes, paiements multi-méthodes, TVA manuelle, mode offline |
| **Inventaire** | Stock, mouvements, alertes seuil, étiquettes QR, icônes SVG produit |
| **Documents** | Upload, analyse de confiance, association employé |
| **Comptabilité** | Suivi financier, rapports analytiques |
| **Déclarations** | Fiscal, social, bailleur — assistant IA intégré |
| **Chat interne** | Channels temps réel, mentions @employé autocomplete, partage de fichiers |
| **Tâches** | Kanban, priorisation, source TERAS ou manuelle |
| **Assistants IA** | Studio de rédaction (Limule), routeur de décisions |
| **TERAS Connect** | Scoring, alertes, recommandations, analyse de conformité |
| **Console Super Admin** | Interface cross-tenant pour monitorer toute la plateforme |

---

## 3. Le système de rôles

```
super_admin          → Console admin globale /admin (cross-tenant)
admin_entreprise     → Accès complet à son entreprise
manager_entreprise   → Tout sauf paramètres système
comptable            → Comptabilité, facturation, déclarations
rh_entreprise        → RH, paie, documents
caissier_pos         → POS et inventaire uniquement
employe              → Accès limité à son propre profil
```

Comptes de démo actifs :
| Email | Mot de passe | Rôle |
|-------|-------------|------|
| `admin@kompta.local` | `kompta123` | admin_entreprise |
| `rh@kompta.local` | `kompta123` | rh_entreprise |
| `finance@kompta.local` | `kompta123` | comptable |
| `caissier@kompta.local` | `kompta123` | caissier_pos |
| `dg@kompta.local` | `kompta123` | manager_entreprise |
| `superadmin@kompta.io` | `super2026` | super_admin |

---

## 4. L'intégration TERAS dans KOMPTA

TERAS est le **moteur d'intelligence analytique et de conformité** de KOMPTA.  
Il ne vit pas dans un service externe — il est **embarqué localement** dans le backend KOMPTA, sous `app/services/teras.py`.

### 4.1 Ce que TERAS fait dans KOMPTA

TERAS remplit trois rôles complémentaires :

#### A. Scoring de conformité (par domaine)
À chaque déclenchement d'analyse, TERAS calcule un **score sur 100** pour un domaine précis.  
L'algorithme est déterministe et basé sur les données réelles de l'entreprise :

```
Score de base : 90/100

Déductions :
  - Employé sans contrat rattaché   → -8 pts par employé (max -28)
  - Document à faible confiance     → -6 pts par document (max -24)
  - Produit en rupture de stock     → -4 pts par article (max -16)
  - Déclaration sans justificatif   → -12 pts
  - Aucun cycle de paie             → -10 pts

Score final : entre 25 et 100
```

Niveaux de maturité associés :
- `well_structured` : ≥ 85
- `partially_structured` : 65–84
- `fragile` : 45–64
- `high_risk` : < 45

#### B. Domaines d'analyse disponibles

| Endpoint | Domaine | Ce qui est analysé |
|----------|---------|-------------------|
| `POST /teras/analyze/company` | `company` | Vue globale : RH, paie, documents, stock, tâches |
| `POST /teras/analyze/rh` | `rh` | Dossiers employés, contrats, accès |
| `POST /teras/analyze/payroll` | `payroll` | Cycles de paie, bulletins |
| `POST /teras/analyze/declaration` | `declaration` | Justificatifs déclaratifs |
| `POST /teras/analyze/documents` | `documents` | Confiance et couverture documentaire |
| `POST /teras/analyze/document/{id}` | document unique | Re-analyse d'un fichier spécifique |

#### C. Vérification d'employabilité
```
POST /teras/employability
```
TERAS vérifie si un employé est "employable" selon ses données :
- Contrat de travail rattaché → +20 pts
- Contact valide (tél/email) → +15 pts
- Salaire renseigné → +15 pts
- Accès actif → +5 pts
- Base → 45 pts

Score ≥ 75 → `confirmed` | < 75 → `needs_review`

### 4.2 Les modèles de données TERAS

```python
# Alerte générée par une analyse TERAS
class TerasAlert:
    title: str          # description de l'anomalie
    severity: str       # "high" | "medium" | "low"
    module: str         # domaine source (rh, paie, documents...)
    status: str         # "open" | "resolved"
    confidence: int     # % de confiance de la détection (0-100)
    recommendation: str # action recommandée
    company_id: int

# Job d'analyse lancé par un utilisateur
class TerasAnalysisJob:
    domain: str               # domaine analysé
    target_type: str          # "company" | "payroll" | "document"...
    status: str               # "completed" | "pending" | "failed"
    payload_snapshot: str     # données envoyées à l'analyse (JSON)
    result_snapshot: str      # résultat complet de l'analyse (JSON)
    teras_reference: str      # ex: "TERAS-JOB-A3B2F9"
    company_id: int

# Snapshot du score à un instant T
class TerasScoreSnapshot:
    domain: str
    score: int             # 0-100
    confidence: int        # 0-100
    maturity_level: str    # "well_structured" | "partially_structured"...
    summary: str
    recommendations: str   # séparées par " | "
    source_job_id: int     # lié au job source

# Vérification d'employabilité d'un employé
class EmployabilityCheck:
    employee_id: int
    status: str            # "confirmed" | "needs_review"
    score: int             # 0-100
    teras_reference: str   # ex: "TERAS-EMP-C7D4E1"
    result_summary: str
    submitted_at: datetime
    confirmed_at: datetime | None

# Événement de synchronisation TERAS
class TerasSyncEvent:
    event_type: str   # ex: "analysis_company"
    status: str       # "success" | "error"
    details: str
```

### 4.3 Ce que TERAS produit après une analyse

Après chaque `run_teras_analysis()` :
1. Un `TerasAnalysisJob` est créé (trace de l'analyse)
2. Un `TerasScoreSnapshot` est sauvegardé (historique du score)
3. Un `TerasSyncEvent` est enregistré (journal de synchronisation)
4. Si des recommandations existent → une `TerasAlert` est créée avec `status="open"`
5. Une **notification WebSocket** est envoyée en temps réel à tous les utilisateurs de l'entreprise

### 4.4 Le score sur l'entreprise

Le modèle `Company` porte un champ `teras_score: int` (0-100).  
C'est le score affiché dans le tableau de bord, le header TERAS, et la console Super Admin.  
Ce score est mis à jour manuellement pour l'instant (valeur initiale seedée à 84 pour la démo).  
Les scores snapshots domain permettent d'aller plus loin (historique par axe).

---

## 5. Limule — notre modèle IA

**Limule** est le nom de notre modèle d'intelligence artificielle et la mascotte officielle de KOMPTA.  
Il a été renommé ainsi dans toute l'interface KOMPTA (remplace l'ancienne désignation "DeepSeek").

### Identité visuelle Limule

Limule dispose d'un **système de design complet** intégré dans le frontend :

| Fichier | Rôle |
|---------|------|
| `frontend/public/assets/limule.svg` | Logo officiel vectoriel |
| `frontend/public/assets/limule-idle.gif` | Animation état attente |
| `frontend/public/assets/limule-thinking.gif` | Animation état analyse (IA en calcul) |
| `frontend/public/assets/limule-speaking.gif` | Animation état réponse (IA parle) |
| `frontend/src/components/LimuleAvatar.tsx` | Composant React animé (3 états) |
| `frontend/src/components/LimuleAvatar.css` | Animations premium (aura, ring, dots en orbite) |

#### Composant `LimuleAvatar`
```tsx
<LimuleAvatar state="idle" size={48} />      // attente douce
<LimuleAvatar state="thinking" size={48} />  // dots en orbite rapides
<LimuleAvatar state="speaking" size={48} />  // ring doré, float rythmique
```

#### Composant `LimuleIcon`
```tsx
<LimuleIcon size={20} />  // icône SVG simple, sans animation (nav, badges)
```

### Placement de Limule dans l'interface

| Surface | État | Description |
|---------|------|-------------|
| **Copilot FAB flottant** | `idle` / `thinking` | Remplace l'ancienne étoile ✦ — animé selon état IA |
| **Copilot panel header** | `speaking` | Fond sombre professionnel, avatar Limule |
| **Copilot loading "Analyse…"** | `thinking` | Affiché pendant la génération IA |
| **ReportsHubPage — bouton Générer** | `thinking` | Pendant la génération d'un rapport |
| **ReportsHubPage — header rapport** | `thinking`/`speaking` | Selon état du stream |
| **AssistantsPage — zone brouillon** | `idle`/`speaking` | Selon état de génération |
| **AssistantsPage — spinner génération** | `thinking` | Grand format centré |
| **AssistantsPage — historique** | LimuleIcon | Icône compact par entrée |
| **LoginPage — panel gauche** | `idle` 64px | Bloc "Votre Grand Sage" sous les modules |
| **Shell topbar — status** | LimuleIcon | Chip avec latence + dot de statut |

### Rôle de Limule dans KOMPTA

Limule est le **moteur de génération** (texte, décisions, raisonnement).  
TERAS est le **moteur analytique** (scoring, détection, conformité).  
Ils travaillent ensemble via un routeur intelligent.

### Le routeur IA (`route_ai_request`)

Quand un utilisateur envoie un message au Copilot KOMPTA, le système décide automatiquement :

```python
# Si la requête touche : score, conformité, RH, paie, audit, document manquant...
→ Route : "limule_with_teras_context"
   - Limule : explique, reformule et guide l'utilisateur
   - TERAS  : vérifie, score, détecte les anomalies, fournit les recommandations

# Sinon (conversation, rédaction, organisation...)
→ Route : "limule_only"
   - Limule : répond, guide, rédige ou organise le travail
   - TERAS  : non sollicité
```

### Ce que fait Limule aujourd'hui dans KOMPTA

1. **Studio de rédaction** (`/assistants`) — génère des emails, notes de service, communiqués
2. **Déclarations assistées** (`/declarations`) — analyse de conformité, checklist, documents manquants
3. **Analyse de documents** — détecte le type, extrait les métadonnées, calcule un score de confiance
4. **Clauses contractuelles** — génère des clauses de contrat de travail adaptées
5. **Copilot conversationnel** — répond aux questions opérationnelles, oriente vers les bons modules
6. **Rapports IA en streaming** (`/reports`) — génère 6 types de rapports (financier, RH, projet, TERAS, RSE, évolution) avec rendu Markdown in-app
7. **Contrats employés IA** — génère les contrats de travail via `GET /employees/{id}/contract`, visualisés dans une modal iframe in-app

---

## 6. Modules — détails techniques récents

### 6.1 Contrats employés (RH)

- Endpoint : `GET /api/employees/{id}/contract`
- Retourne du HTML généré par Limule (clauses IA adaptées au profil)
- Frontend : modal in-app avec `<iframe srcDoc={html}>`, pas de `window.open`
- Gestion des états : `contractLoading`, `contractError`, `contractModal`
- Téléchargement via `<a download>` dans la modal

### 6.2 Rapports IA (`/reports`)

- Streaming SSE via `api.aiGenerateStream(payload, onChunk, onDone, onError)`
- Composant `MarkdownBlock` — renderer Markdown sans dépendance externe
  - Supporte `##`, `###`, `**bold**`, listes `-` et numérotées
- 6 types de rapports : financier, RH, projet, conformité TERAS, RSE, évolution 12 mois
- État IA : `null` → `{ loading: true }` → `{ loading: false, content: "..." }`
- LimuleAvatar `thinking` pendant génération, `speaking` quand rapport affiché

### 6.3 POS / Caisse

- **TVA manuelle** : toggle on/off + input taux (défaut 18%, modifiable par transaction)
- **Modes de paiement** complets :
  - QR Zola, Mobile money, Wave, Orange Money, MTN MoMo, Airtel Money
  - Banque, PayPal, Carte, Espèces
- Mode offline : queue IndexedDB via `enqueue/dequeue`, sync automatique à la reconnexion
- Export CSV ventes avec filtre par date

### 6.4 Facturation (`/billing`)

- Nom client **optionnel** (fallback `"Client anonyme"`)
- Toggle **Brouillon / Envoyer** (couleur amber vs emerald)
- Champs : date d'échéance, notes libres
- Validation : au moins une ligne avec description (pas le nom client)

### 6.5 Chat interne

- **@mention autocomplete** : détection `/@([\wÀ-ÿ]*)$/` en temps réel
- Dropdown flottant avec navigation clavier (↑↓ Enter Tab Escape)
- Filtre suggestions Limule : masque les suggestions de type "aucune action / message archivé"
- Bouton "→ Tâche" masqué par défaut, visible au hover du message (`group-hover`)

### 6.6 Inventaire

- Banque d'icônes SVG produit (`frontend/src/utils/productIcons.ts`)
  - 67+ entrées `{ key, label, Icon: LucideIcon, bg, color, keywords }`
  - `inferProductIcon(product)` → meilleure icône par nom/catégorie
  - `productIconSuggestions(query, limit)` → suggestions filtrées pour le picker
- Remplace tous les emojis dans InventoryPage et PosPage

---

## 7. La Console Super Admin

Accessible à l'URL `/admin`, réservée au rôle `super_admin`.  
C'est une interface **cross-tenant** — elle voit toutes les entreprises sur la plateforme.

| Section | Contenu |
|---------|---------|
| Vue d'ensemble | # entreprises, # utilisateurs, tickets ouverts, alertes TERAS totales, CA cumulé |
| Entreprises | Liste + détail : score TERAS, complétion, utilisateurs, alertes actives |
| Utilisateurs | Tous les comptes, recherche, suspension/réactivation |
| Tickets support | Triage, réponse staff, workflow open→in_progress→resolved→closed |
| Audit & logs | Journal centralisé de toutes les actions sensibles |
| Grand Sage Limule | Monitoring des interactions IA, métriques, tests |

Compte de démo : `superadmin@kompta.io` / `super2026`

---

## 8. Flux de données TERAS — résumé visuel

```
Utilisateur KOMPTA
       │
       ▼
   [Action déclenchante]
   (upload document, création employé, validation paie...)
       │
       ▼
   run_teras_analysis(domain=...)
       │
       ├──► TerasAnalysisJob    (trace, payload, result)
       ├──► TerasScoreSnapshot  (score, maturity, recommandations)
       ├──► TerasSyncEvent      (journal de sync)
       └──► TerasAlert          (si anomalies détectées)
                │
                ▼
         broadcast WebSocket
         → notification temps réel
         → badge d'alerte dans le header
         → liste sur /reports-teras
```

---

## 9. État actuel du projet

| Composant | Statut |
|-----------|--------|
| Backend FastAPI + SQLAlchemy | ✅ Opérationnel |
| Frontend React + TypeScript | ✅ Opérationnel |
| Intégration TERAS locale | ✅ Complète (scoring, alertes, snapshots, employabilité) |
| Export PDF ReportLab | ✅ Opérationnel (factures + bulletins de paie) |
| WebSocket (chat + notifications) | ✅ Opérationnel |
| Console Super Admin | ✅ Complète (6 pages, routing, auth) |
| Limule brand system | ✅ Composant LimuleAvatar + assets + intégration complète |
| Rapports IA streaming + Markdown | ✅ Opérationnel (6 types de rapports) |
| Contrats IA in-app (iframe modal) | ✅ Opérationnel |
| @mention autocomplete Chat | ✅ Opérationnel |
| Icônes SVG produit (67+ entrées) | ✅ Inventaire + POS migrés |
| TVA manuelle POS | ✅ Toggle + input taux |
| Modes de paiement étendus | ✅ Wave, Orange Money, MTN, Airtel ajoutés |
| Facturation nom client optionnel | ✅ Brouillon/envoi + date échéance |
| Comptes démo utilisateurs | ✅ 5 rôles créés (fix seed) |
| Système de tickets support | ✅ Complet (CRUD, triage, réponses staff) |
| Audit logs | ✅ Opérationnel |
| Mode offline POS | ✅ Queue IndexedDB |

---

## 10. Ce qu'il reste à construire

Ce briefing décrit ce qui **existe aujourd'hui** (commit `fcf0d0c` — mai 2026).  
Les prochaines étapes possibles :

- **Connecteur TERAS externe** : remplacer le scoring local par des appels vers une API TERAS hébergée
- **Webhooks TERAS → KOMPTA** : permettre à TERAS de pousser des alertes sans déclenchement utilisateur
- **Limule en mode production** : brancher le vrai modèle LLM derrière les endpoints de génération
- **Score TERAS dynamique** : mettre à jour `company.teras_score` automatiquement après chaque analyse
- **Tableau de bord TERAS avancé** : courbes d'évolution du score dans le temps par domaine
- **Rapport de conformité PDF** : générer un rapport complet TERAS exportable (ReportLab)
- **Notifications push mobile** : étendre le système WebSocket vers PWA/mobile

---

## 11. Références techniques rapides

```bash
# Lancer le projet
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8010
cd frontend && npm run dev

# API TERAS
POST /api/teras/analyze/company       # analyse globale
POST /api/teras/analyze/rh            # analyse RH
POST /api/teras/analyze/payroll       # analyse paie
POST /api/teras/analyze/declaration   # analyse déclarations
POST /api/teras/analyze/documents     # analyse documents
POST /api/teras/employability         # vérification employé
GET  /api/teras/scores                # derniers snapshots
GET  /api/teras/alerts                # alertes actives
GET  /api/teras/recommendations       # recommandations par domaine

# API Limule / IA
GET  /api/employees/{id}/contract     # contrat HTML généré par Limule
POST /api/ai/generate-stream          # génération SSE (rapports, rédaction)
POST /api/copilot/chat                # Copilot conversationnel

# Fichiers clés — Backend
backend/app/services/teras.py         # moteur TERAS local
backend/app/models/domain.py          # modèles SQLAlchemy
backend/app/api/routes.py             # tous les endpoints
backend/app/db/init_db.py             # seed + backfill utilisateurs démo

# Fichiers clés — Frontend
frontend/src/components/LimuleAvatar.tsx     # composant Limule animé
frontend/src/components/LimuleAvatar.css     # animations premium
frontend/src/components/Copilot.tsx          # copilot flottant
frontend/src/utils/productIcons.ts           # banque icônes SVG produit
frontend/src/pages/ReportsHubPage.tsx        # rapports IA streaming
frontend/src/pages/EmployeesPage.tsx         # RH + contrats in-app
frontend/src/pages/AssistantsPage.tsx        # studio rédactionnel
frontend/src/pages/PosPage.tsx               # caisse + TVA + paiements
frontend/src/pages/ChatPage.tsx              # chat + @mention
frontend/src/admin/pages/                    # console Super Admin
```

---

*Document mis à jour le 1er mai 2026 — KOMPTA v1.x — commit `fcf0d0c` — Davy Okemba*
