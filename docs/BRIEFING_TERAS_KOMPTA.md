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
| **RH / Employés** | Dossiers, accès employé, contrats, statuts, invitation |
| **Paie** | Cycles de paie, bulletins PDF, validation, export |
| **Facturation** | Création, envoi, export PDF (ReportLab) |
| **POS / Caisse** | Ventes en point de vente, paiements, reçus, mode offline |
| **Inventaire** | Stock, mouvements, alertes seuil, étiquettes QR |
| **Documents** | Upload, analyse de confiance, association employé |
| **Comptabilité** | Suivi financier, rapports analytiques |
| **Déclarations** | Fiscal, social, bailleur — assistant IA intégré |
| **Chat interne** | Channels temps réel, mentions @, partage de fichiers |
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

**Limule** est le nom de notre modèle d'intelligence artificielle.  
Il a été renommé ainsi dans toute l'interface KOMPTA (remplace l'ancienne désignation "DeepSeek").

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

### Où Limule apparaît dans l'interface

| Surface | Libellé |
|---------|---------|
| Copilot flottant (bouton ✦) | "Limule parle · TERAS contrôle" |
| Page Assistants (`/assistants`) | "Studio rédactionnel — assisté par Limule" |
| CommandPalette | "Studio Limule · emails, courriers" |
| Réponses du Copilot | "Limule [rôle] ; TERAS [rôle]" |

### Ce que fait Limule aujourd'hui dans KOMPTA

1. **Studio de rédaction** (`/assistants`) — génère des emails, notes de service, communiqués
2. **Déclarations assistées** (`/declarations`) — analyse de conformité, checklist, documents manquants
3. **Analyse de documents** — détecte le type, extrait les métadonnées, calcule un score de confiance
4. **Clauses contractuelles** — génère des clauses de contrat de travail adaptées
5. **Copilot conversationnel** — répond aux questions opérationnelles, oriente vers les bons modules

---

## 6. La Console Super Admin

Accessible à l'URL `/admin`, réservée au rôle `super_admin`.  
C'est une interface **cross-tenant** — elle voit toutes les entreprises sur la plateforme.

| Section | Contenu |
|---------|---------|
| Vue d'ensemble | # entreprises, # utilisateurs, tickets ouverts, alertes TERAS totales, CA cumulé |
| Entreprises | Liste + détail : score TERAS, complétion, utilisateurs, alertes actives |
| Utilisateurs | Tous les comptes, recherche, suspension/réactivation |
| Tickets support | Triage, réponse staff, workflow open→in_progress→resolved→closed |
| Audit & logs | Journal centralisé de toutes les actions sensibles |

Compte de démo : `superadmin@kompta.io` / `super2026`

---

## 7. Flux de données TERAS — résumé visuel

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

## 8. État actuel du projet

| Composant | Statut |
|-----------|--------|
| Backend FastAPI + SQLAlchemy | ✅ Opérationnel |
| Frontend React + TypeScript | ✅ Opérationnel |
| Intégration TERAS locale | ✅ Complète (scoring, alertes, snapshots, employabilité) |
| Export PDF ReportLab | ✅ Opérationnel (factures + bulletins de paie) |
| WebSocket (chat + notifications) | ✅ Opérationnel |
| Console Super Admin | ✅ Complète (6 pages, routing, auth) |
| Modèle Limule (renommé) | ✅ Renommé dans toute l'interface |
| Système de tickets support | ✅ Complet (CRUD, triage, réponses staff) |
| Audit logs | ✅ Opérationnel |
| Mode offline POS | ✅ Queue IndexedDB |

---

## 9. Ce qu'il reste à construire ensemble

Ce briefing décrit ce qui **existe aujourd'hui**.  
Les prochaines étapes de notre collaboration peuvent inclure :

- **Connecteur TERAS externe** : remplacer le scoring local par des appels vers une API TERAS hébergée
- **Webhooks TERAS → KOMPTA** : permettre à TERAS de pousser des alertes sans qu'un utilisateur déclenche l'analyse
- **Limule en mode production** : brancher le vrai modèle LLM derrière les endpoints de génération
- **Score TERAS dynamique** : mettre à jour `company.teras_score` automatiquement après chaque `run_teras_analysis`
- **Tableau de bord TERAS avancé** : courbes d'évolution du score dans le temps par domaine
- **Rapport de conformité PDF** : générer un rapport complet TERAS exportable (ReportLab)

---

## 10. Références techniques rapides

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

# Fichiers clés
backend/app/services/teras.py         # moteur TERAS local
backend/app/models/domain.py          # modèles SQLAlchemy
backend/app/api/routes.py             # tous les endpoints
frontend/src/pages/ReportsTerasPage.tsx  # UI TERAS Connect
frontend/src/admin/pages/             # console Super Admin
```

---

*Document généré le 29 avril 2026 — KOMPTA v1.x — Davy Okemba*
