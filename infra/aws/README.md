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

```bash
/opt/kompta/infra/aws/deploy.sh
```
Le script fait `git fetch` + `git reset --hard origin/main`, rebuild backend +
frontend, recrée les conteneurs, et vérifie la santé.

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
