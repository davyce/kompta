# security_tests

Suite cible pour les tests défensifs sécurité.

Tests déjà exécutés et maintenus dans `backend/app/tests` :
- `test_rbac_negative.py` : RBAC négatif, uploads, audit logs, profil entreprise, modules, avatar cross-tenant.
- `test_payments.py` : signature Stripe, secret callback MoMo, montants invalides, anti-double-paiement.
- `test_password_reset.py` : token hashé, usage unique, anti-énumération.
- `test_limule_failclose.py` : comportements IA fail-close.

À ajouter en priorité :
- fuzz IDOR multi-tenant sur tous les `{id}` métier ;
- CSRF sur endpoints cookie-auth ;
- replay de tickets realtime ;
- tests de webhook MoMo avec rotation de secret.
