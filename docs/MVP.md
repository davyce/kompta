# KOMPTA MVP local

## Socle livre

- Backend FastAPI avec seed automatique.
- Auth locale par token signe HMAC.
- SQLite par defaut, PostgreSQL pret via `docker-compose.yml`.
- Frontend React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query.
- Donnees demo pour entreprise, utilisateurs, employes, produits, facture, taches, chat, paie et alertes TERAS.

## Flux valides par code

- Login et lecture du profil.
- Creation employe.
- Creation rapide employe avec telephone, compte utilisateur, mot de passe temporaire et audit.
- Premier login employe avec changement obligatoire du mot de passe.
- Generation/regeneration des acces employe.
- Contrat de travail HTML telechargeable et imprimable.
- Contrat de travail genere par IA et stocke dans l'espace documentaire.
- Espace Documents avec upload, classement IA, analyse et telechargement.
- Transmission locale/mockee des donnees d'employabilite vers TERAS.
- Creation produit avec QR.
- Generation apercu etiquette.
- Vente POS avec decrementation du stock.
- Creation facture.
- Creation tache.
- Envoi message chat avec mentions et suggestion IA.
- Generation cycle de paie et bulletins.
- Liste alertes TERAS et conversion en tache.
- Rapports de synthese.

## Couleurs proposees

- Base claire: `#f7f8f5`
- Texte: `#17211f`
- Primaire: `#0f766e`
- Accent: `#f59e0b`
- Risque: `#e05252`
- Complements: bleu, violet, emeraude selon les modules.

Cette palette evite un rendu mono-couleur tout en restant professionnelle pour un SaaS ERP/fintech.
