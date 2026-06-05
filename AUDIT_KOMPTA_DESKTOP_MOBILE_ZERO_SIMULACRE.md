# Audit KOMPTA — Desktop, Mobile, zéro simulacre

Date : 2026-05-31  
Périmètre : code local, backend, frontend, scans anti-simulacre, tests unitaires, build, E2E desktop/mobile.

## 1. Résumé exécutif

Note globale : **6.8 / 10**

Verdict : **KOMPTA est accessible et cohérent en desktop sur les routes testées, mais le mobile n’est pas encore propre et le zéro simulacre n’est pas atteint.**

Maturité : **beta avancée / production partielle contrôlée**  
Risque global : **élevé** pour usage financier, fiscal, RH et caisse en production.

## 2. Tests exécutés

| Test | Résultat | Lecture stricte |
|---|---:|---|
| Backend `pytest app/tests -q` | ✅ 68/68 | OK, mais 1609 warnings |
| Frontend `npm test` | ✅ 21/21 | OK |
| Build `npm run build` | ✅ OK | Warning perf : `vendor-export` 883.90 kB |
| Scan `alert(` | ✅ 0 occurrence | Plus d’alertes natives |
| Scan mock/demo/TODO/FIXME | ⚠️ 3 familles restantes | `KOMPTA Demo`, cloche placeholder, seed dev |
| E2E desktop/mobile complet | ❌ 9/10 | Échec réel : 8 pages mobile débordent horizontalement |

Le crawler a été renforcé pour tester **desktop 1440x1000** et **mobile 390x844**, avec détection de débordement horizontal : [audit-all-pages.spec.ts](/Users/davyokemba/Documents/kompta/frontend/e2e/audit-all-pages.spec.ts:15).

## 3. Accessibilité des pages

### Desktop

Verdict desktop : **✅ accessible sur les routes testées**.

Pages desktop OK : login, register-group, workspace, dashboard, activation, company, employees, documents, payroll, billing, POS, inventory, chat, work, calendar, notes, reports, TERAS, assistants IA, declarations, settings, accounting, projects, meetings, help, safe-mode, clients, investments, budget, transactions, legislation, audit logs, analytics, fiscal, 404, admin dashboard, admin companies, admin users, admin tickets, admin Limule, admin logs, admin analytics, admin broadcast, admin system, admin onboarding.

Routes non vérifiables dans la base locale courante :

| Route | Statut | Raison |
|---|---|---|
| `/employees/:id` | ❓ Non vérifiable | Aucun employé disponible dans la DB courante |
| `/groups/:groupId/*` | ❓ Non vérifiable | Aucun groupe disponible dans la DB courante |
| `/admin/tickets/:ticketId` | ❓ Non vérifiable | Aucun ticket disponible |
| `/admin/companies/:companyId` | ❓ Non vérifiable | Aucune entreprise retournée par la route admin courante |

### Mobile

Verdict mobile : **❌ partiellement cassé**.

Pages mobile OK : login, register-group, workspace, dashboard, activation, company, employees, payroll, POS, inventory, chat, work, notes, reports, TERAS, assistants IA, declarations, accounting, projects, meetings, help, safe-mode, clients, investments, budget, transactions, legislation, audit logs, analytics, fiscal, 404, admin dashboard, admin users, admin tickets, admin Limule, admin analytics, admin onboarding.

Pages mobile en échec :

| Page | Problème | Sévérité | Correction recommandée |
|---|---|---:|---|
| `/documents` | Débordement horizontal 29px | 🟡 Moyenne | Identifier table/actions larges, ajouter `min-w-0`, `overflow-x-auto` local, réduire boutons |
| `/billing` | Débordement horizontal 232px | 🟠 Élevée | Repenser facturation mobile : cartes empilées, tableau transformé, actions sticky compactes |
| `/calendar` | Débordement horizontal 61px | 🟡 Moyenne | Adapter grille/calendrier en liste agenda mobile |
| `/settings` | Débordement horizontal 25px | 🟡 Moyenne | Segmenter formulaires, éviter champs/badges fixes |
| `/admin/companies` | Débordement horizontal 16px | 🟡 Moyenne | Transformer table admin en cards mobiles |
| `/admin/logs` | Débordement horizontal 11px | 🟡 Moyenne | Tronquer colonnes longues, wrap contrôlé |
| `/admin/broadcast` | Débordement horizontal 75px | 🟡 Moyenne | Réduire largeur des panneaux/actions admin |
| `/admin/system` | Débordement horizontal 97px | 🟡 Moyenne | Recomposer feature flags/health en blocs mobiles |

## 4. Zéro simulacre

Verdict : **❌ non atteint**.

| Élément | Statut | Preuve |
|---|---|---|
| IA mock en production | ✅ Corrigé | Fail-closed dans `deepseek.py`, tests backend OK |
| Alerts natives | ✅ Corrigé | Scan `alert(` vide |
| Seed démo | ⚠️ Dev seulement | `seed_demo_data` refuse prod/staging, mais crée `KOMPTA Demo` en dev : [init_db.py](/Users/davyokemba/Documents/kompta/backend/app/db/init_db.py:304) |
| Placeholders “KOMPTA Demo” | 🟡 À corriger | [SettingsPage.tsx](/Users/davyokemba/Documents/kompta/frontend/src/pages/SettingsPage.tsx:434) |
| Notification groupes | 🟡 Simulacre UI | Bouton sans action : [GroupsShell.tsx](/Users/davyokemba/Documents/kompta/frontend/src/pages/groups/GroupsShell.tsx:54) |
| Paiements réels | 🟠 Non prouvé | Pas de preuve E2E webhook/idempotence/mobile money/carte/QR réel |
| Routes dynamiques | ❓ Non vérifiable | Manque de données test pour employés, groupes, tickets, sociétés admin |

## 5. Verdict fonctionnel par domaine

| Domaine | Desktop | Mobile | Zéro simulacre | Verdict |
|---|---|---|---|---|
| Auth | ✅ | ✅ | ⚠️ JWT localStorage à traiter | Partiel |
| Dashboard | ✅ | ✅ | ⚠️ dépend des seeds/dev | Partiel |
| Comptabilité | ✅ | ✅ | ⚠️ workflows complets non E2E | Partiel |
| Facturation | ✅ | ❌ | ⚠️ paiements/certification non prouvés | Dangereux mobile |
| POS | ✅ | ✅ | ⚠️ vente/stock bout en bout à tester | Partiel |
| Inventaire | ✅ | ✅ | ⚠️ lots/retours non prouvés | Partiel |
| Documents | ✅ | ❌ | ⚠️ IA sources/logs à renforcer | Partiel |
| RH | ✅ | ✅ | ❓ profil dynamique non vérifiable sans employé | Partiel |
| Paie | ✅ | ✅ | ⚠️ bulletin complet à E2E | Partiel |
| Chat | ✅ | ✅ | ✅ ticket temps réel | Bon, à surveiller offline |
| Groupes | ✅ liste | ✅ liste | ❓ sous-routes non vérifiables sans groupe | Partiel |
| Admin | ✅ | ❌ certaines pages | ⚠️ actions critiques à confirmer | Partiel |
| IA | ✅ page | ✅ page | ⚠️ sources/validation humaine à renforcer | Partiel |

## 6. Améliorations techniques prioritaires

| Priorité | Amélioration |
|---|---|
| 🔴 | Ajouter données E2E déterministes : au moins 1 entreprise, 1 employé, 1 groupe, 1 ticket, 1 facture, 1 produit |
| 🔴 | Créer E2E métier : facture → paiement → reçu → écriture ; POS → stock ; RH → paie → PDF |
| 🟠 | Corriger tous les débordements mobile listés ci-dessus |
| 🟠 | Remplacer JWT `localStorage` par cookies HttpOnly/SameSite + refresh rotation |
| 🟠 | Prouver paiements réels : webhook signé, idempotency key, statut transactionnel, double paiement bloqué |
| 🟠 | Achever migration montants en centimes entiers, supprimer usages métier `Float` |
| 🟡 | Isoler `/api/ai/health` des appels DeepSeek en E2E/dev ou ajouter cache strict |
| 🟡 | Réduire chunk `vendor-export` par import dynamique export/PDF |
| 🟡 | Ajouter audit axe/accessibilité automatisé |

## 7. Améliorations UI/UX Desktop

| Interface | Améliorations |
|---|---|
| Dashboard | Ajouter fraîcheur des données, drill-down, skeletons cohérents, indicateurs vides |
| Comptabilité | Verrouiller visuellement les écritures postées, filtres exercice/journal, exports signés |
| Facturation | Timeline facture, statut paiement précis, aperçu PDF, confirmations paiement/annulation |
| POS | Mode caisse compact, raccourcis clavier, scan plus visible, panier sticky |
| Inventaire | Historique stock par produit, alertes seuil, fiches produits plus denses |
| RH | Timeline employé, badges confidentialité, accès documents mieux séparés |
| Paie | Workflow validation multi-étapes, verrouillage bulletins validés |
| Documents | Prévisualisation, statut OCR/IA, journal d’accès admin |
| Chat | Statut connexion temps réel, retry, état offline |
| Groupes | Remplacer la cloche placeholder, rendre les sous-modules visibles même sans données |
| Admin | Actions dangereuses confirmées, tables filtrables persistantes, audit par objet |
| IA | Sources, mode démo explicite, validation humaine obligatoire sur fiscal/RH/compta |

## 8. Améliorations UI/UX Mobile

| Interface | Améliorations |
|---|---|
| Global | Tolérance zéro scroll horizontal, `min-w-0` systématique, tables en cartes mobiles |
| Facturation | Recomposer en flux vertical : client, lignes, taxes, paiement, PDF ; éviter tableau large |
| Documents | Cartes document compactes, actions dans menu kebab, tags wrapés |
| Calendrier | Vue agenda mobile par défaut, pas de grille mensuelle large |
| Paramètres | Sections accordéon, inputs full-width, boutons sur deux lignes si nécessaire |
| Admin companies/logs | Cartes résumé + détail, colonnes longues tronquées, filtres en sheet |
| Admin broadcast/system | Formulaires single-column, boutons pleine largeur, health cards empilées |
| POS | Garder panier accessible en bottom sheet, produits en grille 2 colonnes stable |
| Chat | Liste salons en drawer, zone message sticky, état connexion lisible |
| Paie/RH | Masquer colonnes secondaires, actions dans menu, données sensibles moins exposées |

## 9. Conclusion

KOMPTA est maintenant **testé plus honnêtement** : desktop passe bien sur les routes disponibles, mobile révèle 8 pages à corriger, et zéro simulacre n’est pas encore atteint.

Blocages avant production :

1. Corriger les 8 débordements mobile.
2. Ajouter des fixtures E2E déterministes pour tester toutes les routes dynamiques.
3. Prouver les workflows métier critiques de bout en bout.
4. Éliminer les derniers placeholders/simulacres visibles.
5. Sécuriser les sessions et prouver les paiements réels.
