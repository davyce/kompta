# Audit expert KOMPTA

Date d'audit : 2026-05-30  
Workspace audite : `/Users/davyokemba/Documents/kompta`  
Portee : frontend React/Vite, backend FastAPI/SQLAlchemy, base SQL, routes API, IA, POS, facturation, paie/RH, documents, tests et readiness production.

## 1. Resume executif

**Note globale : 4/10**

**Verdict : KOMPTA est une application SaaS/ERP reelle au niveau prototype avance/MVP, mais elle n'est pas utilisable en production pour de la comptabilite, paie, fiscalite ou donnees sensibles.**

**Maturite : MVP avance / beta technique.**  
**Risque global : critique.**

KOMPTA n'est pas seulement une interface : il existe un backend FastAPI, un modele de donnees riche, des endpoints reels, des tests et des flux E2E qui passent. En revanche, les protections backend sont inegales, plusieurs modules critiques sont accessibles a tout utilisateur authentifie de la meme entreprise, l'IA peut exposer des salaires et donnees documentaires, des factures peuvent etre marquees payees sans transaction de paiement, des donnees financieres peuvent etre supprimees, et les seeds/demo credentials restent dangereux.

Validation executee :

- Backend : `42 passed`, `1343 warnings`.
- Frontend unitaires : `21 passed`.
- Build frontend : OK, avec avertissement de chunks > 800 kB.
- E2E Playwright : `8 passed` hors sandbox macOS. Premier lancement bloque par permissions Chromium, pas par l'application.

## 2. Phase 0 - Vue d'ensemble

| Element | Observation |
|---|---|
| Frontend | React 18, TypeScript, Vite 8, Tailwind, React Query, Recharts, Playwright. |
| Backend | FastAPI, SQLAlchemy 2, Pydantic Settings, Uvicorn. |
| Base de donnees | SQLite par defaut, Postgres possible via `DATABASE_URL`; migrations Alembic presentes mais beaucoup de migration manuelle dans `init_db.py`. |
| ORM | SQLAlchemy declaratif, modele central `backend/app/models/domain.py`. |
| Auth | Token HMAC maison `body.signature`, pas JWT standard ; expiration 8h ; `token_version` pour revocation. |
| Roles | Roles presents, appliques partiellement ; beaucoup de routes sensibles ne verifient que `get_current_user`. |
| API | Environ 290 routes FastAPI, modules routes multiples. |
| IA | DeepSeek/OpenAI/Ollama possibles ; nombreux fallbacks `mock`/deterministes ; contexte Limule riche mais trop permissif. |
| Documents | Upload, extraction, PDF/HTML ; ingestion automatique de documents vers factures. |
| Paiements | Paiements internes simules/enregistres, pas d'integration transactionnelle ZOLA/TERAS/SFEC verifiee. |
| Offline/sync | Pas d'architecture offline-first robuste observee ; Safe Mode snapshot/restauration existe mais dangereux. |

Anti-patterns majeurs detectes :

- `docker-compose.yml:10-21` definit `SECRET_KEY=change-me-in-production` et `SEED_DEMO=true` par defaut.
- `backend/app/db/init_db.py:254-293` cree un super-admin par defaut dans tous les environnements avec mot de passe par defaut.
- `backend/app/api/routes.py:496-560` supprime definitivement des donnees metier et meme des logs d'audit.
- `backend/app/api/routes.py:581-649`, `2224-2383`, `2573-2639`, `2642-2692` exposent RH/paie/documents sans RBAC backend strict.
- `backend/app/services/limule_context.py:405-475` injecte salaires, paie et documents extraits dans le contexte IA pour tout utilisateur authentifie.
- `backend/app/api/routes.py:1569-1595` permet de passer une facture a `paid` sans endpoint de paiement, transaction ni compta.

## 3. Tableau synthetique des risques

| Domaine | Probleme | Severite | Impact | Fichier | Correction recommandee | Priorite |
|---|---:|---|---|---|---|---|
| Production | Secret et seed demo par defaut | 🔴 Critique | Compromission comptes/donnees demo en prod | `docker-compose.yml:10-21`, `main.py:61-75` | Refuser tout secret placeholder, `SEED_DEMO=false` par defaut en prod | P0 |
| Auth | Super-admin/mots de passe par defaut | 🔴 Critique | Prise de controle plateforme | `init_db.py:254-293`, `316-366` | Exiger variables fortes, rotation au premier login, pas de credentials dans README | P0 |
| RH/paie | RBAC backend absent sur routes sensibles | 🔴 Critique | Fuite/modification salaires et bulletins | `routes.py:581-649`, `2224-2383`, `2573-2639` | `require_roles`, self-scope employe, audit trail | P0 |
| IA | Contexte IA expose salaires/documents | 🔴 Critique | Fuite RH/fiscale/comptable via Limule | `limule_context.py:405-475`, `routes_extra.py:406-435` | Filtrer par role, minimiser contexte, masquer PII | P0 |
| Facturation | Facture marquee payee sans paiement reel | 🔴 Critique | Fraude chiffre d'affaires/tresorerie | `routes.py:1569-1595` | Interdire `status=paid` via PATCH ; paiement transactionnel unique | P0 |
| Donnees financieres | Reset hard delete + suppression audit logs | 🔴 Critique | Perte irreversible, fraude non tracable | `routes.py:496-560` | Soft delete, confirmations, exports signes, interdiction suppression audit | P0 |
| Documents | Upload et ingestion IA automatiques | 🔴 Critique | Faux documents/factures creees par LLM | `documents.py`, `doc_extractor.py:252-275` | Validation humaine obligatoire, quarantaine, MIME/size/AV | P0 |
| Comptabilite | Vente/facture conservee si ecriture comptable echoue | 🟠 Elevee | Incoherence ERP/compta | `routes.py:1453-1460`, `1697-1705` | Transaction atomique ou statut `accounting_failed` bloquant | P1 |
| Audit | Logs lisibles par tout utilisateur entreprise | 🟠 Elevee | Fuite operations internes | `routes_audit.py:83-141` | Restreindre a admin/comptable/auditeur | P1 |
| Monetaire | Floats encore utilises largement | 🟠 Elevee | Arrondis, ecarts comptables | `domain.py:82`, `251`, `302-364`, `423-454`, `689-692` | Minor units uniquement, DECIMAL/BigInteger partout | P1 |
| Frontend auth | Token en `localStorage` et query-string SSE/WS | 🟠 Elevee | Vol de token via XSS/logs/proxy | `api.ts:75-84`, `useNotifications.ts:25-28`, `GroupChatPage.tsx:37-40` | Cookies HttpOnly/SameSite ou WS subprotocol/session | P1 |
| PDF/HTML | HTML facture non echappe | 🟠 Elevee | Stored XSS via nom client/ligne facture | `routes.py:2477-2516` | Echappement HTML/Jinja autoescape, PDF server-only | P1 |
| Safe Mode | Restauration client sans RBAC fort | 🟠 Elevee | Insertion donnees RH/stock non controlee | `routes_safe_mode.py:757-849` | Admin only, signature snapshot, audit | P1 |

## 4. Points critiques a corriger immediatement

### 🔴 C1 - Credentials et seeds dangereux

Preuves :

```yaml
docker-compose.yml:10 SECRET_KEY=${SECRET_KEY:-change-me-in-production}
docker-compose.yml:21 SEED_DEMO=${SEED_DEMO:-true}
```

```python
backend/app/db/init_db.py:265 email = os.getenv("SUPER_ADMIN_EMAIL", "superadmin@kompta.io")
backend/app/db/init_db.py:266 password = os.getenv("SUPER_ADMIN_PASSWORD", "super2026")
backend/app/db/init_db.py:323 password_hash=hash_password("kompta123")
```

Risque : un deploiement Docker sans configuration stricte expose une plateforme avec secret faible, donnees demo et comptes connus.  
Correction : refuser le boot en production si secret placeholder ou credentials admin par defaut ; mettre `SEED_DEMO=false`; forcer creation admin via commande one-shot securisee.

### 🔴 C2 - RH/paie accessibles ou modifiables sans role suffisant

Preuves :

```python
backend/app/api/routes.py:581 @router.get("/employees")
backend/app/api/routes.py:636 @router.post("/employees")
backend/app/api/routes.py:2224 @router.get("/payroll/runs")
backend/app/api/routes.py:2279 @router.post("/payroll/runs")
backend/app/api/routes.py:2594 @router.patch("/payroll/payslips/{payslip_id}")
```

Ces routes n'appliquent pas `require_roles`; elles utilisent seulement `get_current_user`.  
Risque : un employe authentifie peut consulter des salaries, cycles de paie, bulletins, et modifier des montants si l'UI ou une requete directe l'appelle.  
Correction : introduire une matrice RBAC backend : `rh_entreprise`, `admin_entreprise`, `manager_entreprise` avec restriction stricte ; `employe` doit voir uniquement son propre profil/bulletins.

### 🔴 C3 - IA Limule fuite des donnees sensibles

Preuves :

```python
backend/app/services/limule_context.py:414 "salary": employee.salary
backend/app/services/limule_context.py:421 "payroll": { "net_total": ... }
backend/app/services/limule_context.py:473 "extracted": _safe_json(doc.extracted_data, {})
backend/app/api/routes_extra.py:406 @router.get("/limule/context")
backend/app/api/routes_extra.py:424-435 return { ... "modules": context["modules"] }
```

Risque : toute session authentifiee peut recuperer le contexte IA avec salaires, paie, documents extraits et signaux internes. C'est une fuite RH/fiscale/comptable.  
Correction : contexte IA par role, masquage PII, scopes explicites, endpoint `/limule/context` reserve admin/auditeur ou supprime cote client.

### 🔴 C4 - Facture payable par simple PATCH

Preuves :

```python
backend/app/api/routes.py:1586 allowed_fields = {"status", "customer_name", "customer_email", "due_date"}
backend/app/api/routes.py:1590 if invoice.status == "paid" and not invoice.paid_at:
backend/app/api/routes.py:1591 invoice.payment_method = invoice.payment_method or "cash"
```

Risque : n'importe quel utilisateur autorise a PATCH dans la meme entreprise peut marquer une facture payee sans transaction, sans recu, sans comptabilite, sans preuve externe.  
Correction : retirer `status` de PATCH ; utiliser uniquement `/invoices/{id}/pay` avec montant, idempotency key, compte de paiement, statut transactionnel et ecriture comptable atomique.

### 🔴 C5 - Suppression definitive de donnees financieres et logs

Preuves :

```python
backend/app/api/routes.py:496 @router.post("/workspace/reset")
backend/app/api/routes.py:529 db.execute(delete(CompanyDocument) ...)
backend/app/api/routes.py:530 db.execute(delete(AccessAuditLog) ...)
backend/app/api/routes.py:536-539 delete Invoice, Payslip, PayrollRun
```

Risque : perte de factures, paie, documents, POS et traces d'audit. Inacceptable pour une application comptable/fiscale.  
Correction : pas de hard delete des pieces financieres/RH ; archive legale, export signe, double confirmation, audit append-only non supprimable.

### 🔴 C6 - LLM/document extraction peut creer des factures sans validation humaine

Preuves :

```python
backend/app/services/doc_extractor.py:252 if not existing and total_ttc > 0:
backend/app/services/doc_extractor.py:253 invoice = Invoice(...)
backend/app/services/doc_extractor.py:274 db.commit()
```

Risque : un document forge ou une hallucination d'extraction cree une facture brouillon avec numero et montant fournis par l'IA.  
Correction : creer une `DocumentExtractionSuggestion`, jamais une facture reelle ; workflow de validation humaine ; journaliser acteur, source, hash du fichier.

## 5. Problemes importants

- 🟠 Comptabilite non atomique : les ventes et paiements continuent meme si `record_sale` ou `record_invoice_payment` echoue (`routes.py:1453-1460`, `1697-1705`). Pour un ERP, la piece commerciale et l'ecriture doivent etre dans une transaction unique ou mise en statut d'anomalie bloquante.
- 🟠 Audit logs exposes : `/audit-logs` n'a pas de role admin/auditeur (`routes_audit.py:83-141`).
- 🟠 XSS HTML facture : les champs facture sont injectes dans une string HTML sans echappement (`routes.py:2477-2516`).
- 🟠 Reset password retourne le token dans la reponse, sans email ni rate limit robuste (`routes_features.py:59-90`), et ne revoke pas les tokens existants (`routes_features.py:118-121`).
- 🟠 Token query-string pour SSE/WS (`useNotifications.ts:25-28`, `GroupChatPage.tsx:37-40`) : fuite possible dans logs et historique.
- 🟠 Safe Mode restore sans role fort (`routes_safe_mode.py:757-849`) : un utilisateur authentifie peut restaurer des employes/produits/taches selon les sections envoyees.
- 🟠 Floats persistants dans des montants critiques (`domain.py:82`, `251`, `302-364`, `423-454`, `689-692`). Des champs `_cents` existent, mais la logique utilise encore souvent `Float`.
- 🟠 Paie fiscale indicative : `IRPP_BRACKETS` est commente "valeurs indicatives" (`routes.py:2239`) alors que le produit vise paie/fiscalite professionnelle.

## 6. Phase 1 - Audit metier comptable, fiscal et ERP

### Comptabilite

Forces observees :

- Plan comptable et ecritures en partie double existent.
- `post_entry` bloque les ecritures desequilibrees (`accounting.py:138-149`).
- Contre-passation disponible (`routes_accounting.py:162-195`).

Limites :

- Pas de cloture comptable/exercice fiscal verrouille.
- Pas d'audit trail systematique sur creation/reversal manuel.
- Mode "full" indique mais non force dans `create_manual_entry` (`routes_accounting.py:136-159`).
- Ecritures automatiques POS/factures non atomiques avec les pieces source.

### Facturation, devis, paiements

Statut : partiel et dangereux. Creation facture reelle, numerotation sequentielle par entreprise, PDF/HTML possibles. Mais paiement partiel/avoir robuste/certification SFEC/mobile money transactionnel ne sont pas prouves. Une facture peut etre declaree payee par PATCH.

### POS / inventaire

Statut : partiel. Vente POS decompte le stock de facon atomique (`routes.py:1388-1400`) et cree mouvement/transaction. Mais pas de RBAC caissier/admin, pas de gestion retours/pertes/lots/unites avancee, et comptabilite non bloquante.

### RH / paie

Statut : dangereux. Les donnees RH et paie sont reelles, mais les roles ne protegent pas assez le backend. Les fiches de paie utilisent des calculs indicatifs et peuvent etre modifiees par PATCH sans audit suffisant.

### Multi-entreprises

Point positif : la plupart des requetes filtrent `company_id`.  
Point critique : le multi-tenant est necessaire mais pas suffisant ; les roles internes a l'entreprise sont trop faibles, et des contraintes uniques globales (`Product.sku`, `Employee.email`) peuvent bloquer deux entreprises utilisant les memes references.

## 7. Phase 2 - Audit IA

Modules IA reels identifies :

- Assistant redaction/declaration via `backend/app/services/deepseek.py`.
- Limule chat/context via `backend/app/services/limule.py`, `ai_context.py`, `limule_context.py`.
- Analyse/extraction documents via `documents.py`, `doc_extractor.py`.
- Assistant groupe via pages/routes groupes.

Constats :

- Fournisseurs : DeepSeek par defaut, OpenAI/Ollama possibles.
- Temperature observee : DeepSeek `0.4`, Limule `0.3/0.4`.
- Fallbacks mock/deterministes nombreux (`deepseek.py:10-36`, `188-218`, `limule.py:584-592`).
- Garde-fous textuels presents dans prompts, mais controles applicatifs insuffisants.
- Pas de RAG/vector store mature observe.
- Logs IA trop riches : `context_snapshot=json.dumps(context)` (`routes_extra.py:528-536`) peut stocker donnees sensibles.

Tests adversariaux recommandes :

- Prompt injection demandant salaires et documents d'autres modules.
- Demande de secrets/API keys.
- Demande de modifier facture/paie/ecriture.
- Demande de faux justificatif/faux bulletin.
- Demande fiscale ambigue sans sources.

Verdict IA : ❌ non conforme pour production sensible tant que le contexte n'est pas role-aware et que les actions documentaires ne sont pas validees humainement.

## 8. Phase 3 - Revue code et architecture

Fichiers critiques :

| Fichier | Role | Probleme principal | Severite |
|---|---|---|---|
| `backend/app/api/routes.py` | Routes metier centrales | Trop gros, RBAC incomplet, reset destructeur, paiement facture dangereux | 🔴 |
| `backend/app/models/domain.py` | Modele SQLAlchemy global | Monolithe, Float monetaires, contraintes multi-tenant imparfaites | 🟠 |
| `backend/app/services/limule_context.py` | Construction contexte IA | Fuite donnees RH/paie/documents | 🔴 |
| `backend/app/services/doc_extractor.py` | Ingestion documents | Creation facture depuis extraction IA | 🔴 |
| `backend/app/api/routes_features.py` | Reset password/IA health | Token reset expose | 🟠 |
| `frontend/src/app/routes.tsx` | Routing frontend | Protection route basee seulement sur token | 🟡 |
| `frontend/src/services/api.ts` | Client API/token | Token en localStorage | 🟠 |
| `frontend/src/pages/LoginPage.tsx` | Login/register/reset | Credentials demo pre-remplis | 🟠 en prod |

## 9. Phase 4 - Audit securite

| Controle | Statut | Commentaire |
|---|---|---|
| Authentification | ⚠️ Partiel | Login, 2FA TOTP possible, rate limit memoire ; token maison, logout frontend ne revoke pas backend. |
| RBAC backend | ❌ Non conforme | Routes RH/paie/documents/factures/POS trop ouvertes. |
| Multi-tenancy | ⚠️ Partiel | `company_id` souvent utilise, mais role intra-tenant insuffisant. |
| Secrets | ❌ Non conforme | Defaults dangereux et credentials demo documentes. |
| CORS/headers | ⚠️ Partiel | Headers presents, CSP avec `unsafe-inline` pour HTML interne. |
| Upload | ❌ Non conforme | Taille/MIME/scan insuffisants ; lecture fichier en memoire ; ingestion automatique. |
| Rate limiting | ⚠️ Partiel | Login seulement, memoire locale. |
| XSS | ❌ Non conforme | HTML facture non echappe. |
| IA | ❌ Non conforme | Fuite contexte, logs sensibles, actions documentaires. |
| Audit trail | ❌ Non conforme | Incomplet et supprimable. |

## 10. Phase 5 - Verification fonctionnelle

Routes frontend principales observees (`frontend/src/app/routes.tsx:143-235`) :

| URL | Statut | Donnees/API | Verdict |
|---|---|---|---|
| `/login` | Accessible E2E | API login/reset/register | ⚠️ Fonctionnel mais demo credentials pre-remplis |
| `/` dashboard | Accessible E2E indirect | API overview/rapports | ⚠️ Partiel |
| `/employees`, `/employees/:id` | Route reelle | API RH | 🔴 Dangereux RBAC |
| `/payroll` | Route reelle | API paie | 🔴 Dangereux RBAC |
| `/billing` | Route reelle | API factures | 🔴 Paiement/status dangereux |
| `/pos` | Route reelle | API POS | ⚠️ Partiel |
| `/inventory` | Route reelle | API produits/stock | ⚠️ Partiel |
| `/documents` | Route reelle | API documents | 🔴 Fuite/ingestion IA |
| `/assistants`, `/declarations` | Route reelle | IA/fiscal | ⚠️ Fallbacks/sources insuffisantes |
| `/safe-mode` | Route reelle | Safe Mode | 🔴 Dangereux |
| `/admin/*` | Route reelle | Admin APIs | ⚠️ Frontend protege seulement par token ; backend a des checks partiels |
| `/groups/*` | Route reelle | Group APIs/WS | ⚠️ Partiel, token WS en query |
| `*` | 404 | E2E OK | ✅ |

Endpoints backend : environ 290 routes. Tous ne sont pas audites ligne par ligne, mais les routes critiques ci-dessus le sont avec preuves.

Flux utilisateur :

- Entreprise/login : smoke E2E OK, mais credentials demo et seeds dangereux.
- Facturation : creation reelle, paiement incomplet/dangereux, pas de paiement partiel fiable.
- POS : vente reelle et stock decremente, compta non atomique.
- RH : creation/paie reelles mais confidentiality/RBAC non conformes.
- IA : reelle en partie, mais fallback mock et fuites de contexte.

## 11. Phase 6 - Design, UX, accessibilite

Forces :

- Routing dense et coherent.
- Lazy loading, error boundary, pages mobiles couvertes par E2E.
- E2E mobile verifie bottom-nav et absence de scroll horizontal sur groupes.

Faiblesses :

- Login pre-rempli demo (`LoginPage.tsx:19-20`) donne une posture non professionnelle en prod.
- Les dashboards peuvent donner confiance a tort si les autorisations/backend ne sont pas fiables.
- Pas assez d'etats "donnee non verifiee"/"calcul indicatif" pour paie/fiscalite/IA.
- Actions dangereuses (`workspace/reset`, Safe Mode restore, paiement facture) devraient avoir confirmation forte, impact preview, audit et role strict.

## 12. Phase 7 - Tests

Tests existants et executes :

- Backend : `42 passed`.
- Frontend unitaires : `21 passed`.
- E2E : `8 passed`.

Couverture insuffisante :

- Pas assez de tests RBAC negatifs sur RH/paie/documents/factures/POS.
- Pas de tests multi-tenant adversariaux complets.
- Pas de tests facture payee immutable via PATCH.
- Pas de tests "accounting write failure must block sale/payment".
- Pas de tests IA prompt injection/data leakage.
- Pas de tests upload MIME/size/malware.
- Pas de tests anti-simulacre systematiques.

Tests a ajouter en P0 :

- Employe ne peut pas `GET /employees`, `GET /payroll/runs`, `PATCH /payroll/payslips/{id}`.
- `PATCH /invoices/{id}` refuse `status=paid`.
- POS/facture rollback si ecriture comptable echoue.
- `/limule/context` masque salaire/documents pour roles non autorises.
- `/workspace/reset` interdit en prod et n'efface jamais audit logs.
- Upload refuse type/taille non autorises.

## 13. Phase 8 - Monitoring et production readiness

Statut : ❌ non production-ready.

Manques critiques :

- Audit trail append-only non supprimable.
- Monitoring securite/IA/paiements/couts IA.
- Backups/restauration verifies.
- Migrations fiables et versionnees partout.
- Environnements dev/staging/prod strictement separes.
- Secrets manager.
- Rate limiting distribue.
- Process incident/fraude.
- Offline/sync robuste avec gestion de conflits.

## 14. Tableau conformite

| Referentiel | Statut | Motif |
|---|---|---|
| OWASP Top 10 | ❌ Non conforme | XSS HTML, auth/token/secrets, upload, RBAC. |
| OWASP API Security | ❌ Non conforme | BOLA/BFLA intra-tenant sur RH/paie/documents. |
| OWASP LLM Top 10 | ❌ Non conforme | Prompt/data leakage, contexte sensible, actions documentaires. |
| Bonnes pratiques SaaS | ⚠️ Partiel | Multi-tenant present mais RBAC/secrets/audit insuffisants. |
| Bonnes pratiques comptables | ❌ Non conforme | Suppression, paiement sans preuve, non-atomicite compta. |
| Bonnes pratiques multi-tenant | ⚠️ Partiel | `company_id` present, mais contraintes et role-scopes a renforcer. |
| Bonnes pratiques IA | ❌ Non conforme | Sources/garde-fous insuffisants au niveau applicatif. |

## 15. Verification zero simulacre

| Module | Donnees reelles ? | API reelle ? | Boutons/formulaires ? | Tests ? | Verdict |
|---|---|---|---|---|---|
| Auth/login | Oui | Oui | Oui | Oui | ⚠️ Reel mais credentials demo |
| Dashboard | Partiel | Oui | Partiel | Smoke | ⚠️ Partiel |
| Comptabilite | Oui | Oui | Partiel | Backend | ⚠️ Partiel |
| Factures | Oui | Oui | Oui | Insuffisant | 🔴 Dangereux |
| POS | Oui | Oui | Oui | Insuffisant | ⚠️ Partiel |
| Inventaire | Oui | Oui | Oui | Insuffisant | ⚠️ Partiel |
| RH | Oui | Oui | Oui | Insuffisant | 🔴 Dangereux |
| Paie | Oui | Oui | Oui | Insuffisant | 🔴 Dangereux |
| Documents | Oui | Oui | Oui | Insuffisant | 🔴 Dangereux |
| IA Limule | Partiel | Oui | Oui | Non adversarial | 🔴 Dangereux |
| Declarations IA | Partiel/mock possible | Oui | Oui | Non adversarial | ❌ Simule/partiel |
| Admin | Oui | Oui | Oui | Smoke | ⚠️ Partiel |
| Groupes | Oui | Oui | Oui | E2E leger | ⚠️ Partiel |
| Safe Mode | Oui | Oui | Oui | Non | 🔴 Dangereux |

## 16. Roadmap priorisee

### Court terme - 0 a 2 semaines

- Bloquer production si `SECRET_KEY` placeholder, `SEED_DEMO=true`, admin password par defaut.
- Supprimer credentials pre-remplis hors mode demo explicite.
- Ajouter RBAC backend strict sur RH, paie, documents, factures, POS, audit, Safe Mode.
- Interdire `status=paid` via PATCH facture.
- Rendre POS/facture + ecriture comptable atomiques.
- Retirer salaires/documents du contexte IA pour roles non autorises.
- Desactiver creation automatique de facture depuis IA ; passer en suggestion validee.
- Interdire suppression audit logs et hard delete financier.
- Ajouter tests P0 negatifs permissions et anti-fraude.

### Moyen terme - 1 a 2 mois

- Refactoriser `routes.py` en modules metier plus petits.
- Migrer tous les montants vers minor units/Decimal et supprimer usages Float critiques.
- Ajouter cloture comptable, exercices, verrous de pieces validees.
- Implementer paiements partiels, idempotency keys, webhooks signes.
- Upload securise : allowlist MIME, taille max, scan, stockage prive, URLs temporaires.
- Observabilite : logs securite, audit financier, alertes, monitoring IA/couts.
- Suite E2E metier complete : facturation, POS, RH, IA, multi-tenant.

### Long terme - 3 a 6 mois

- Certification/fiscalite : SFEC ou mecanisme equivalent, numerotation inviolable, exports conformes.
- Offline-first robuste : journal local, resolution conflits, signatures, replay idempotent.
- Integrations ZOLA/TERAS/SFEC avec contrats API, webhooks et reconciliation.
- IA controlee : RAG source, citations, policy engine, validation humaine pour actions critiques.
- Architecture production : Postgres gere, backups/restores testes, secret manager, CI/CD avec gates securite.

## 17. Conclusion

KOMPTA contient une vraie base technique et produit : backend fonctionnel, UI riche, tests existants, modules nombreux. Mais pour une application qui manipule comptabilite, paie, fiscalite et documents sensibles, les failles actuelles sont trop graves. Le point principal n'est pas d'ajouter encore des ecrans : il faut maintenant durcir les invariants backend, les permissions, l'audit trail, la logique comptable et la securite IA.

Verdict final : **ne pas utiliser KOMPTA en production avec de vraies entreprises avant correction des P0.**
