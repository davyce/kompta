# Déploiement KOMPTA — AWS Lightsail

Production : `https://kompta0.com`

## Architecture réelle

- **Instance** : AWS Lightsail (Ubuntu, Paris `eu-west-3`), code dans `/opt/kompta`.
- **Compose** : le fichier **`docker-compose.yml` à la RACINE** du dépôt (PAS de
  fichier dans ce dossier). 2 services :
  - `backend` (FastAPI, port 8010) — **SQLite** persisté dans le volume
    `kompta_storage` à `/app/storage/kompta.db`.
  - `frontend` (build Vite servi par nginx, port 80).
- **HTTPS** : **tunnel Cloudflare** (`cloudflared`, service systemd) →
  `localhost:80`. Pas de Caddy, pas de Let's Encrypt.
- **Env** : ce dossier contient `.env.production` (gitignoré, secrets réels).
  Voir `.env.production.example`.

> ⚠️ Le volume SQLite ne doit JAMAIS être monté sur `/app` (il masquerait le
> code de l'image et les déploiements seraient ignorés). Il est monté sur
> `/app/storage` uniquement.

## Commandes

Toujours passer `--env-file infra/aws/.env.production` (le compose racine y
référence ses variables) :

```bash
cd /opt/kompta
docker compose --env-file infra/aws/.env.production ps
docker compose --env-file infra/aws/.env.production logs -f backend
```

## Déploiement (mise à jour)

### Option A — `deploy.sh` (historique, rebuild local — TOUJOURS dispo en fallback)

```bash
/opt/kompta/infra/aws/deploy.sh
```
Le script fait `git fetch` + `git reset --hard origin/main`, rebuild backend +
frontend **sur l'instance** (`docker compose build --no-cache`), recrée les
conteneurs, et vérifie la santé.

> ⚠️ Ce rebuild sur place a déjà pris 15+ minutes et une fois rendu l'instance
> complètement inutilisable (erreurs 530, terminal SSH qui plante) — le
> rebuild (npm run build + pip install + build Docker) est trop lourd pour la
> petite instance Lightsail. `deploy.sh` reste utilisable en secours si GHCR
> ou le CI a un problème, mais **préférer l'option B** ci-dessous au quotidien.

### Option B — `deploy-fast.sh` (recommandé — pull d'images pré-construites)

Un workflow GitHub Actions (`.github/workflows/build-and-push.yml`) construit
les images `backend` et `frontend` à chaque push sur `main` (ou manuellement
via l'onglet Actions → "Build and push Docker images" → *Run workflow*), et
les pousse sur GitHub Container Registry (GHCR) :
- `ghcr.io/davyce/kompta-backend:latest` et `:<sha du commit>`
- `ghcr.io/davyce/kompta-frontend:latest` et `:<sha du commit>`

Le serveur n'a alors plus qu'à **pull** ces images toutes faites, au lieu de
tout reconstruire localement — bien plus rapide et bien plus léger pour
l'instance.

**Étape manuelle unique, à faire une seule fois sur github.com** (impossible
à faire depuis la CLI) — rendre les packages GHCR publics pour que le serveur
puisse les `docker pull` sans authentification :

1. Aller sur `https://github.com/davyce?tab=packages` (ou : ton profil GitHub
   → onglet **Packages**).
2. Ouvrir le package `kompta-backend` → **Package settings** (en bas de la
   page ou via le lien `.../settings`) → section **Danger Zone** → **Change
   visibility** → **Public**.
3. Répéter la même chose pour le package `kompta-frontend`.

(Ces images ne contiennent aucun secret — seulement le code applicatif — donc
les rendre publiques est le choix le plus simple pour un projet solo/petite
équipe. Si la confidentialité devient nécessaire plus tard, alternative :
garder les packages privés et faire un `docker login ghcr.io` sur le serveur
avec un Personal Access Token `read:packages`, stocké dans les credentials
Docker locales de l'instance.)

Une fois les packages publics (et au moins un run du workflow terminé avec
succès — vérifier l'onglet **Actions** du repo après un push sur `main`) :

```bash
/opt/kompta/infra/aws/deploy-fast.sh
```
Le script fait `git fetch` + `git reset --hard origin/main` (pour récupérer
les fichiers compose/env à jour), puis
`docker compose -f docker-compose.yml -f docker-compose.prod.yml pull` (pull
des images GHCR au lieu d'un rebuild), `up -d --force-recreate`, nettoyage des
images orphelines, et la même vérification de santé que `deploy.sh`.

`docker-compose.prod.yml` (à la racine du dépôt) est un fichier d'override
qui ajoute `image: ghcr.io/davyce/kompta-{backend,frontend}:...` par-dessus
`docker-compose.yml` — celui-ci garde son `build:` inchangé, donc rien ne
casse pour qui veut continuer à builder en local (dev, ou `deploy.sh` en
secours). Variable optionnelle `IMAGE_TAG` pour cibler un commit précis
plutôt que `latest` :
```bash
IMAGE_TAG=<sha> /opt/kompta/infra/aws/deploy-fast.sh   # si le script est adapté pour l'exporter
# ou directement :
IMAGE_TAG=<sha> docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file infra/aws/.env.production pull
```

## Sauvegardes (SQLite)

```bash
/opt/kompta/infra/aws/backup.sh
```
Snapshot cohérent (`.backup`) → `/opt/kompta/backups/kompta_*.db.gz`,
rétention 14 jours. À planifier en cron :
```
0 3 * * * /opt/kompta/infra/aws/backup.sh >> /var/log/kompta-backup.log 2>&1
```

Restauration : voir les commentaires en bas de `backup.sh`.
