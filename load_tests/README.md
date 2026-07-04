# load_tests

Suite cible pour performance et charge.

Scénarios à formaliser :
- 100, 500, 1000, 5000 utilisateurs virtuels ;
- endpoints `auth/login`, dashboard, factures, POS, paiements, rapports, IA ;
- métriques CPU, RAM, latence p50/p95/p99, erreurs 4xx/5xx, verrous DB.

Pré-requis avant charge sérieuse :
- déployer une base Postgres dédiée ;
- isoler les intégrations externes avec sandbox/mocks ;
- exporter Prometheus/OpenTelemetry ou équivalent.

## Fait : tests de concurrence POS (correctness, pas de charge)

En attendant une base Postgres dédiée, `backend/app/tests/test_pos_concurrency.py`
couvre la **correction** du comportement sous écritures concurrentes (et non le
débit/latence à grande échelle) :
- décrément de stock concurrent sans survente (deux ventes simultanées qui
  dépassent le stock disponible : une seule passe, l'autre échoue proprement
  en 409, stock final jamais négatif) ;
- cas limite exact (stock == somme des quantités demandées) ;
- isolation des soldes de session de caisse entre deux caissiers concurrents
  (le FK `Sale.session_id`, ajouté en `98de9e4`, empêche la contamination
  croisée même sous charge concurrente, pas seulement en séquentiel) ;
- constat documenté (pas corrigé ici) : `POST /pos/sales` n'a aucun mécanisme
  d'idempotence — un payload identique soumis deux fois crée deux ventes et
  décrémente le stock deux fois. Voir le test
  `test_duplicate_rapid_sale_requests_both_decrement_stock_no_idempotency_key`.

Limitation connue : ces tests tournent sur SQLite (DB de dev), dont le
verrouillage fichier est plus strict que Postgres sous écritures concurrentes
réelles ; un petit retry/backoff absorbe le bruit `database is locked` propre à
SQLite. Une validation de charge réelle (100 à 5000 utilisateurs virtuels,
métriques de latence/throughput) reste à faire une fois Postgres disponible
comme indiqué ci-dessus.
