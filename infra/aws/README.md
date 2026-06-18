# Déploiement KOMPTA sur AWS — le moins cher

Architecture : **1 seule instance AWS Lightsail** qui exécute tout via Docker Compose.

```
Internet ──443──> Caddy (HTTPS auto) ──> frontend (nginx, SPA)
                                              │  /api, /ws
                                              ▼
                                         backend (FastAPI) ──> Postgres (conteneur + volume)
```

## Coût estimé

| Poste | Choix le moins cher | Prix |
|---|---|---|
| Instance Lightsail | 2 Go RAM / 2 vCPU / 60 Go SSD | **~12 $/mois** |
| IP statique | incluse avec l'instance | 0 $ |
| DNS | Lightsail DNS zone | 0 $ |
| Backups DB | bucket S3 (quelques Go) | < 1 $/mois |
| **Total** | | **~12–13 $/mois** |

> Le plan 1 Go (~7 $/mois) peut suffire pour une beta privée, mais le build des images + Postgres + IA est plus confortable en 2 Go. Commencez en 2 Go, vous pourrez descendre ensuite.

> Pour passer plus tard à l'échelle (milliers d'entreprises), on remplacera le Postgres conteneurisé par **Lightsail Managed Database** ou **RDS**, sans changer le code (juste `DATABASE_URL`).

---

## Étapes (à faire par vous — création de compte et identifiants)

### 1. Créer l'instance
1. Console AWS → **Lightsail** → *Create instance*.
2. Région : la plus proche de vos utilisateurs (ex. `eu-west-3` Paris).
3. Plateforme **Linux** → blueprint **OS Only → Ubuntu 22.04 LTS**.
4. Plan **2 Go RAM**.
5. Nom : `kompta-prod` → *Create*.

### 2. IP statique + pare-feu
1. Onglet *Networking* de l'instance → *Create static IP* → l'attacher.
2. *Firewall* : ouvrir **80 (HTTP)** et **443 (HTTPS)** en plus de 22 (SSH).

### 3. DNS
- Pointez votre domaine (ex. `app.kompta.com`) en **enregistrement A** vers l'IP statique.
- Lightsail propose une *DNS zone* gratuite, ou utilisez votre registrar.
- ⚠️ Le HTTPS ne marchera qu'une fois le DNS propagé (vérifier : `dig +short app.kompta.com`).

### 4. Installer Docker sur l'instance
SSH (bouton *Connect using SSH* de Lightsail), puis :
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && newgrp docker
```

### 5. Récupérer le code
```bash
sudo mkdir -p /opt/kompta && sudo chown ubuntu:ubuntu /opt/kompta
git clone https://github.com/davyce/kompta.git /opt/kompta
cd /opt/kompta/infra/aws
```

### 6. Configurer les secrets
```bash
cp .env.production.example .env.production
# Générer les secrets :
echo "SECRET_KEY=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "MOMO_CALLBACK_SECRET=$(openssl rand -hex 32)"
nano .env.production   # coller les valeurs + DOMAIN, TLS_EMAIL, SUPER_ADMIN_*, clés Stripe/IA
```

### 7. Lancer
```bash
chmod +x deploy.sh backup.sh
./deploy.sh
```
Caddy obtient le certificat TLS automatiquement. Vérifier :
```bash
curl https://app.kompta.com/api/health
```

### 8. Backups automatiques (recommandé avant prod)
```bash
# (optionnel) créer un bucket S3 et renseigner BACKUP_S3_BUCKET dans .env.production
crontab -e
# ajouter :
0 3 * * * cd /opt/kompta/infra/aws && ./backup.sh >> /var/log/kompta-backup.log 2>&1
```

### 9. Mises à jour ultérieures
```bash
cd /opt/kompta/infra/aws && ./deploy.sh   # pull + rebuild + restart
```

---

## Pointer les apps natives vers la prod
Dans l'app iOS/macOS, régler l'URL API sur `https://app.kompta.com/api`
(Réglages → URL du serveur), et retirer le local-networking ATS avant soumission App Store.

## Ce qui reste hors de ce déploiement
- **Stripe live / MoMo prod** : renseigner les vraies clés dans `.env.production`.
- **Monitoring** : renseigner `SENTRY_DSN` (gratuit jusqu'à un certain volume).
- **Tests de charge** : à lancer contre cette instance (k6/Locust) avant un déploiement massif.
