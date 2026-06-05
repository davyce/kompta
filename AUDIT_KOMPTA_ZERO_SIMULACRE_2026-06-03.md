# Audit KOMPTA zero simulacre - 2026-06-03

## Synthese

Verdict global : **8.4 / 10**.

KOMPTA est dans un etat nettement plus solide qu'au precedent audit : les tests backend, frontend, build et E2E passent, les routes principales sont accessibles en desktop et mobile, les routes dynamiques critiques fonctionnent, et les protections production contre demo/default secrets existent.

Le principal reste a corriger pour revendiquer un vrai **zero simulacre production** : certains fallbacks IA/documentaires generent encore du contenu de secours hors `deepseek.py`. Ils sont utiles en local, mais doivent devenir fail-closed en `production`, `prod`, `staging`, `preprod`.

## Validations executees

| Suite | Commande | Resultat |
|---|---|---|
| Backend | `./.venv/bin/python -m pytest app/tests` | **98 passed**, 10 warnings |
| Backend avec mauvais interpreteur systeme | `python3 -m pytest app/tests` | Echec environnement : `slowapi` absent du Python systeme |
| Frontend build | `npm run build` | **OK**, warning gros chunks |
| Frontend unit | `npm run test` | **21 passed** |
| E2E pages | `npx playwright test e2e/audit-all-pages.spec.ts` | **2 passed** |
| E2E complet | `npx playwright test` | **22 passed** |

Warnings notables :
- `slowapi` est installe dans `backend/.venv`, mais absent de `backend/requirements.txt`.
- `vendor-export` depasse 1 MB minifie et `vendor-charts` depasse 530 KB. Les chunks sont separes, mais le cout reste important lors du premier usage export/charts.
- Plusieurs warnings `datetime.utcnow()` sont presents dans les rapports comptables.

## Accessibilite des pages

Audit Playwright desktop/mobile :
- Routes publiques : `/login`, `/register-group`
- Routes entreprise : dashboard, workspace, activation, company, employees, documents, payroll, billing, POS, inventory, chat, work, calendar, notes, reports, TERAS, assistants, declarations, settings, accounting, projects, meetings, help, safe-mode, clients, investments, budget, transactions, legislation, audit, analytics, fiscal
- Routes dynamiques : `/employees/:id`
- Routes groupes : liste + 16 sous-pages groupe
- Routes admin : dashboard, companies, company detail, users, tickets, ticket detail, limule, logs, analytics, broadcast, system, onboarding
- 404 : route inconnue

Resultat : **toutes les routes testees sont OK en desktop et mobile**, sans erreur console bloquante, erreur API, page vide, redirection login inattendue, ni overflow horizontal mobile detecte par le test.

Pages creees mais non routees directement :
- `frontend/src/pages/InventoryPosPage.tsx` : page existante non importee par le routeur. `/inventory-pos` redirige vers `/pos`.
- `frontend/src/pages/ModuleBoardPage.tsx` : composant page generique non route.

Ces deux fichiers ne cassent pas l'application, mais ils doivent etre soit supprimes, soit routes, soit convertis explicitement en composants internes.

## Zero simulacre

### Conforme

- `main.py` bloque le demarrage en prod/staging si `SECRET_KEY` est placeholder.
- `main.py` bloque le demarrage en prod/staging si `SUPER_ADMIN_PASSWORD=super2026`.
- `main.py` bloque `SEED_DEMO=true` en prod/staging.
- `seed_demo_data()` refuse aussi de creer la societe demo en prod/staging.
- `deepseek.py` fail-close en prod/staging/preprod si l'IA externe est indisponible.
- La base locale auditee ne contient pas `KOMPTA Demo` ni `admin@kompta.local`.

### Non conforme strict zero simulacre

1. **Limule principal rend encore du contenu fallback**
   - Fichier : `backend/app/services/limule.py`
   - Risque : si LLM indisponible, `limule_generate()` et `limule_stream()` renvoient un texte de secours professionnel.
   - Impact : en production, l'utilisateur peut croire a une reponse IA/contextuelle alors que c'est un template local.
   - Correction : centraliser `_ai_is_prod()` / `_ai_fail_closed()` et bloquer ces fallbacks hors local/dev.

2. **Extraction documentaire rend encore un fallback local**
   - Fichier : `backend/app/services/doc_extractor.py`
   - Risque : `extract_structured_data()` retourne `provider="fallback"` avec resume local si texte court, LLM absent ou JSON invalide.
   - Impact : classification documentaire possiblement presentee comme analyse.
   - Correction : en prod/staging, retourner 503 ou un statut explicite `analysis_unavailable`, jamais une analyse de substitution.

3. **Taux de change fallback determinant**
   - Fichier : `backend/app/services/exchange_rates.py`
   - Risque : source `fallback` avec taux figes si API indisponible.
   - Impact : acceptable pour UX informative si clairement affiche, dangereux pour decision comptable/financiere.
   - Correction : afficher source/date/taux stale dans l'UI, interdire validations financieres qui dependent d'un fallback.

4. **PDF bulletin de paie minimal**
   - Fichier : `backend/app/api/routes_features.py`
   - Risque : PDF genere manuellement, valide au test `%PDF-`, mais rendu limite.
   - Impact : coherence documentaire faible pour production paie.
   - Correction : utiliser `reportlab` ou moteur PDF existant commun, avec pagination, signature, mentions legales.

5. **Fallback client PDF Copilot**
   - Fichier : `frontend/src/components/Copilot.tsx`
   - Risque : si endpoint PDF echoue, creation d'un blob `text/plain`.
   - Impact : UX trompeuse si l'utilisateur attend un PDF.
   - Correction : afficher erreur export indisponible au lieu de telecharger un fichier texte silencieux.

### Donnees locales post-test

Les tests E2E ont cree des donnees reelles de verification dans `backend/kompta.db` :
- 4 societes `E2E Audit...`
- 21 utilisateurs `e2e...@test.cg`
- 3 groupes `Groupe audit...`
- 3 tickets `Ticket audit...`

Ce ne sont pas des donnees demo embarquees, mais une pollution de base locale. Prevoir un cleanup E2E automatique ou une DB temporaire par run.

## Securite et production

Points solides :
- RBAC negatif teste.
- Token invalide/expire teste.
- Reset password DB hashe teste.
- ConfirmModal remplace les confirmations natives.
- Super-admin default bloque en prod/staging.

Points a corriger :
- Ajouter `slowapi` a `backend/requirements.txt`.
- Ajouter test de demarrage prod : default secret/password/SEED_DEMO doivent lever une erreur.
- Ajouter test prod/staging pour `limule_generate`, `limule_stream`, `extract_structured_data`.
- Ajouter nettoyage E2E ou base SQLite temporaire.
- Ajouter rate-limit tests pour endpoints auth/reset/IA.

## Recommandations par interface

| Interface / page | Technique | Fonctionnel | Esthetique / UX |
|---|---|---|---|
| Login / Register group | Tester forgot password complet en E2E | Ajouter etats lien expire/token invalide | Harmoniser login entreprise/groupe, reduire texte hero mobile |
| Workspace | Tester choix role multi-espace | Ajouter indicateur dernier espace utilise | Cartes espace plus scannables, CTA principal unique |
| Dashboard | Lazy-load charts deja OK, mais surveiller chunk charts | Comparaison periode N/N-1 configurable | Hierarchie KPI plus nette, densite plus dashboard pro |
| Entreprise | Ajouter audit des changements profil | Historique legal/forme/pays | Vue lecture plus compacte avant edition |
| Employes | E2E creation + activation + reset | Absences, documents confidentiels, historique salaire | Table desktop plus dense, cartes mobile avec actions rapides |
| Profil employe | Test upload document employe | Timeline RH, contrats, acces, paie | Resume top plus compact, badges confidentialite |
| Documents | Fail-closed extraction prod | Workflow validation humaine obligatoire si IA | Differencier visuellement analyse IA vs extraction brute |
| Paie | Remplacer PDF minimal par moteur PDF robuste | Primes/retenues, validation multi-niveau, paiement | Timeline run de paie, etats plus visibles |
| Facturation | Tests avoirs/remises/partiels | Verrou facture payee, relances, paiement partiel | Preview PDF laterale, statuts plus lisibles |
| POS | Idempotency key client visible en test | Annulation ticket, retours, pertes, sessions caisse | Panier bottom sheet mobile, touches rapides, mode caisse dense |
| Inventaire | Tests mouvements/lots | Lots, unites, pertes, stock negatif controle | Alertes seuil plus lisibles, grille produits moins card-heavy |
| Chat | E2E websocket/reconnect | Reactions, pieces jointes, lecture | Mobile plein ecran, liste salons en drawer |
| Travail | Tests bouton/action par colonne | Dependances, commentaires, preuves obligatoires | Kanban mobile plus tactile, filtres en sheet |
| Calendrier | Tests creation/modification evenement | Invites, rappels, synchronisation | Vue agenda/liste mobile plus simple |
| Meetings | Tests compte-rendu et lien calendrier | Decisions/actions assignees | Separation reunion vs tache plus visible |
| Notes | Tests markdown/export | Tags, recherche globale, liens taches | Editeur plus riche, preview optionnelle |
| Rapports | Tests export CSV/PDF | Rapports sauvegardes, favoris | Navigation rapport plus dense et moins marketing |
| TERAS | Tests source/score | Explication score, actions correctives suivies | Risques par severite, preuves liees |
| Assistants IA | Fail-closed prod sur tous providers | Sources obligatoires, validation humaine | Badge provider/source/confiance permanent |
| Declarations | Tests workflow declaration | Checklist depot, pieces manquantes, statut depot | Timeline fiscale et alertes echeances |
| Settings | Tests paiements + 2FA + reset workspace | Permissions par module, audit config | Onglets en accordions mobile |
| Accounting | Tests grand livre/balance/export | Lettrage, cloture, journaux immutables | Tables comptables scannables, filtres sticky |
| Projects | Tests drag/drop ou update statut | Milestones, budgets, dependances | Colonnes horizontales mobile avec snap |
| Help | Tests creation ticket | Liens contextuels depuis erreurs | Recherche FAQ plus pro, categories compactes |
| Safe Mode | Tests rollback/actions | Mode lecture seule, export secours | Etat systeme plus clair |
| Clients | Tests CRUD + remise | Segmentation, historique factures, relances | Fiche client en drawer, cartes plus compactes |
| Investments | Verrouiller fallback taux finance | Alertes reelles, portefeuille multi-devise | Charts plus lisibles mobile, disclaimer source |
| Budget | Tests categorie/delete | Budgets recurrents, ecarts, alertes | Barres plus compactes et comparatives |
| Transactions | Tests import OCR/CSV | Lettrage facture, rapprochement bancaire | Table dense desktop, cartes mobile detaillees |
| Legislation | Tests upload/version | Versioning, validation juridique | Badges juridiction/statut |
| Audit logs | Tests filtres/export | Retention, export signe, detail JSON | Diff avant/apres plus lisible |
| Analytics | Tests charts sans data | Cohortes, retention, adoption modules | Eviter charts vides, skeletons contextualises |
| Fiscal | Tests deadlines | Rappels automatiques, depot, justificatifs | Calendrier fiscal par severite |
| Groupes liste | Tests creation/role membre | Invitations, transfert propriete | Cartes groupe plus denses |
| Groupe dashboard | Tests KPIs | Solde, cotisations dues, votes actifs | Vue synthese plus claire |
| Groupe membres | Tests reset/retirer deja confirm | Import CSV membres, roles multiples | Cards mobile avec action principale visible |
| Groupe contributions | Tests plan + paiement | Penalites, echeances, recurrences | Progress bars et filtres statut |
| Groupe transactions | Tests exports | Rapprochement cotisation/depense | Table mobile en cartes |
| Groupe expenses | Tests validation depense | Approbation, justificatifs | Etats "a valider" plus visibles |
| Groupe calendar/meetings | Tests CRUD | Rappels et presence | Vue mobile agenda simplifiee |
| Groupe chat | Tests envoi/reconnect | Pieces jointes, mentions, lecture | Composer sticky deja bon, enrichir messages |
| Groupe documents | Tests upload/download | Dossiers, permissions | Apercu document et tags |
| Groupe votes | Tests vote complet | Quorum, anonymat, audit | Resultats plus visuels |
| Groupe leadership | Tests mandat | Historique mandats, passation | Timeline leadership |
| Groupe assistant IA | Fail-closed prod | Sources groupe, actions validables | Badge limites/confiance |
| Groupe reports | Tests export | Rapport financier/membres | Graphiques plus utiles |
| Groupe settings | Tests quitter/fermer | Archivage, transfert, suppression | Danger zone plus separee |
| Admin dashboard | Tests indicateurs | Incidents, SLO, tenants a risque | Densite admin plus operationnelle |
| Admin companies | Pagination serveur | Suspendre/reactiver tenant, quotas | Cards mobile OK, table desktop dense |
| Admin company detail | Tests dynamiques | Timeline tenant, usage modules | Synthese top plus riche |
| Admin users | Tests suspend/reset/impersonate | Expiration tokens impersonation | Actions sensibles mieux groupees |
| Admin tickets | Tests assign/reply/status | SLA, priorites, files | Kanban/table switch plus explicite |
| Admin ticket detail | Tests reply/assign | Macros support, historique complet | Conversation plus lisible |
| Admin Limule | Tests provider health | Cout IA, taux erreur, logs prompts | Separateurs provider/source |
| Admin logs | Export + filtres testes | Retention, alertes actions sensibles | JSON details en drawer |
| Admin analytics | Tests zero-data | Cohortes usage, MRR/activation | Charts legers, eviter chunk charts initial |
| Admin broadcast | Tests envoi cible | Brouillons, planification, accusés | Apercu message avant envoi |
| Admin system | Tests health/email/flags | Flags par tenant, audit flag | Mobile cards au lieu de table flags |
| Admin onboarding | Tests pipeline | Etapes activation, relances | Funnel plus lisible |

## Priorites recommandees

1. **P0 - Zero simulacre IA prod** : bloquer fallbacks `limule.py` et `doc_extractor.py` hors local/dev.
2. **P0 - Dependances reproductibles** : ajouter `slowapi` a `requirements.txt`, verifier lock/deploy.
3. **P1 - Nettoyage E2E** : DB temporaire par run ou teardown des `E2E Audit`.
4. **P1 - PDF paie robuste** : remplacer PDF minimal par `reportlab`/service PDF commun.
5. **P1 - Pages non routees** : supprimer/router `InventoryPosPage` et `ModuleBoardPage`.
6. **P2 - Chunks lourds** : dynamic import pour exports lourds au clic, pas au chargement page.
7. **P2 - Tests adversariaux IA** : prompt injection, fuite cross-tenant, validation source obligatoire.
8. **P2 - Tests interaction UI** : boutons/formulaires critiques par page, pas seulement accessibilite.

