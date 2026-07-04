# integration_tests

Suite cible pour les tests bout-en-bout entre API, base, paiements, IA et frontends.

Tests existants :
- backend complet via `backend/.venv/bin/pytest` ;
- frontend via `npm run lint` et `npm test` dans `frontend` ;
- synchronisation offline (file d'attente IndexedDB du POS) couverte par
  `frontend/src/lib/offlineQueue.test.ts` : persistance de la file, ordre FIFO,
  flush réussi (vidage de la file) et flush en échec (l'élément reste en file
  pour un nouveau essai au lieu d'être perdu silencieusement) ;
- webhooks/callbacks paiement : `backend/app/tests/test_payments.py` (signature
  Stripe valide/invalide, horodatage expiré, secret non configuré, callback
  MoMo forgé/valide) complété par `backend/app/tests/test_webhooks.py` (rejeu
  d'un webhook Stripe déjà "succeeded" → idempotent, rejeu d'un callback MoMo
  déjà traité → idempotent, en-tête de signature Stripe absent/malformé → 4xx
  propre jamais 500, corps non-JSON → 4xx propre, callback MoMo sandbox
  authentifié par token/secret) ;
- concurrence POS (correction, pas débit) : `backend/app/tests/test_pos_concurrency.py`
  — décrément de stock concurrent sans survente, isolation des soldes de
  session de caisse entre caissiers concurrents ; voir aussi `load_tests/README.md`.

À ajouter en priorité :
- paiement carte complet avec Stripe test/live isolé ;
- facture → paiement → écriture comptable → rapport ;
- upload document → extraction → analyse IA ;
- suspension abonnement → blocage routes métier → réactivation ;
- mécanisme d'idempotence pour `POST /pos/sales` (clé d'idempotence côté
  client + déduplication serveur) — gap identifié par
  `test_duplicate_rapid_sale_requests_both_decrement_stock_no_idempotency_key`,
  correction hors périmètre de cette tâche (décision de conception plus large).
