# integration_tests

Suite cible pour les tests bout-en-bout entre API, base, paiements, IA et frontends.

Tests existants :
- backend complet via `backend/.venv/bin/pytest` ;
- frontend via `npm run lint` et `npm test` dans `frontend` ;
- synchronisation offline (file d'attente IndexedDB du POS) couverte par
  `frontend/src/lib/offlineQueue.test.ts` : persistance de la file, ordre FIFO,
  flush réussi (vidage de la file) et flush en échec (l'élément reste en file
  pour un nouveau essai au lieu d'être perdu silencieusement).

À ajouter en priorité :
- paiement carte complet avec Stripe test/live isolé ;
- callback MoMo sandbox authentifié ;
- facture → paiement → écriture comptable → rapport ;
- upload document → extraction → analyse IA ;
- suspension abonnement → blocage routes métier → réactivation.
