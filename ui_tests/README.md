# ui_tests

Suite cible pour les parcours UI Web, iOS et macOS.

Tests existants :
- `frontend/e2e/smoke.spec.ts` pour smoke Playwright Web.
- `scripts/audit-pages-cdp.mjs` pour crawl visuel Web existant.

À ajouter en priorité :
- parcours login/session expirée ;
- parcours rôle `caissier_pos`, `comptable`, `rh_entreprise`, `membre_groupe`, `super_admin` ;
- tests offline/connexion faible pour iOS et macOS ;
- captures comparatives Web/iOS/macOS sur dashboard, factures, stocks, paiements, RH, IA.
