# KOMPTA — Déploiement Option A (Cloudflare Tunnel + Mac local)

`kompta0.com` exposé depuis ton MacBook via un tunnel Cloudflare nommé.
Setup **gratuit**, 0 €/mois, HTTPS automatique.

## Architecture

```
Internet
   ↓
Cloudflare DNS + WAF + SSL
   ↓
Cloudflare Tunnel (chiffré, sortie sortante depuis ton Mac)
   ↓
Ton MacBook (127.0.0.1)
   ├── :8010 → backend FastAPI (uvicorn)
   └── :3000 → frontend (Vite preview du build)
```

Tu n'ouvres **aucun port** sur ton routeur. Le tunnel est sortant — sûr et propre.

## Setup initial (à faire UNE seule fois)

### 1. Préparer les variables d'environnement de prod

```bash
# Backup ton .env actuel
mv backend/.env backend/.env.local

# Active le mode prod
cp backend/.env.production backend/.env
```

Édite `backend/.env` et remplace :
- `SECRET_KEY=REMPLACE_PAR_UNE_CLE_ALEATOIRE_64_CARACTERES`
  → Génère : `python3 -c "import secrets; print(secrets.token_hex(32))"`
- `SUPER_ADMIN_PASSWORD=REMPLACE_PAR_UN_MOT_DE_PASSE_FORT`
  → Choisis un mot de passe solide (minimum 12 caractères, mixe lettres/chiffres/symboles)

Le backend **refuse de démarrer en production** si ces deux valeurs ne sont pas changées.

### 2. Authentifier Cloudflare et créer le tunnel

```bash
bash infra/setup-tunnel.sh
```

Ce script va :
1. Ouvrir ton navigateur → connecte-toi à Cloudflare → choisis `kompta0.com`
2. Créer un tunnel nommé `kompta`
3. Mettre à jour `infra/cloudflared.yml` avec l'UUID du tunnel
4. Créer 3 routes DNS dans Cloudflare (`kompta0.com`, `www.kompta0.com`, `api.kompta0.com`)

À la fin du script, ouvre le dashboard Cloudflare → DNS → tu dois voir 3 entrées CNAME pointant vers le tunnel.

### 3. Démarrer KOMPTA

```bash
bash infra/start-kompta.sh
```

Cette commande :
- Build le frontend en mode production (avec `VITE_API_URL=https://api.kompta0.com/api`)
- Démarre uvicorn :8010
- Démarre `vite preview` :3000
- Démarre `cloudflared run kompta`

**Au bout de 30 secondes**, va sur `https://kompta0.com` — tu dois voir KOMPTA en ligne.

`Ctrl+C` arrête tout proprement.

## Démarrage quotidien

Une fois le setup terminé, à chaque fois que tu veux remettre KOMPTA en ligne :

```bash
cd /Users/davyokemba/Documents/kompta
bash infra/start-kompta.sh
```

Si tu as modifié le frontend :

```bash
bash infra/start-kompta.sh --rebuild
```

## Démarrage automatique au boot du Mac (optionnel)

Pour que KOMPTA redémarre tout seul quand tu connectes ton Mac (utile si tu fermes l'ordi le soir) :

```bash
cp infra/com.kompta.app.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.kompta.app.plist
```

Pour désactiver :

```bash
launchctl unload ~/Library/LaunchAgents/com.kompta.app.plist
rm ~/Library/LaunchAgents/com.kompta.app.plist
```

## Configuration Cloudflare recommandée (panel kompta0.com)

Une fois en ligne, va sur https://dash.cloudflare.com → kompta0.com → :

### SSL/TLS
- Mode : **Full (strict)** (chiffrement bout en bout)
- Always Use HTTPS : **On**
- Minimum TLS Version : **TLS 1.2**

### Security
- WAF → Managed Rules : **Cloudflare Managed Ruleset = On**
- Bot Fight Mode : **On**
- Security Level : **Medium**

### Speed
- Auto Minify : JS/CSS/HTML **On**
- Brotli : **On**

### Rules (optionnel mais recommandé)
- `kompta0.com/api/payments/stripe/webhook` → **Cache: Bypass** (webhooks ne doivent pas être cachés)

## Webhook Stripe en prod

Une fois `kompta0.com` accessible :

1. Va sur https://dashboard.stripe.com → Developers → Webhooks → **Add endpoint**
2. URL : `https://api.kompta0.com/api/payments/stripe/webhook`
3. Events : `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`
4. Stripe te donne un `whsec_...` → colle dans `backend/.env` → `STRIPE_WEBHOOK_SECRET=whsec_...`
5. Relance KOMPTA

Avantage majeur : **plus jamais besoin de Stripe CLI** ni de tunnel temporaire.

## Logs

Tous les logs sont dans `infra/logs/` :

```bash
tail -f infra/logs/backend.log       # erreurs API
tail -f infra/logs/frontend.log      # logs vite preview
tail -f infra/logs/cloudflared.log   # connexion tunnel
```

## Dépannage

### `kompta0.com` ne répond pas
1. Vérifie que les 3 services tournent : `lsof -i :8010 -i :3000` + `ps aux | grep cloudflared`
2. Vérifie le DNS Cloudflare : `dig kompta0.com` doit retourner une IP Cloudflare
3. Regarde `tail -50 infra/logs/cloudflared.log` → cherche "Registered tunnel connection"

### "502 Bad Gateway" depuis Cloudflare
Le tunnel tourne mais le service local (backend ou frontend) n'est pas joignable.
Vérifie : `curl http://127.0.0.1:8010/api/health` et `curl http://127.0.0.1:3000/`

### Backend refuse de démarrer
Le mode prod bloque si :
- `SECRET_KEY` est encore `dev-kompta-secret` → génère une nouvelle clé
- `SUPER_ADMIN_PASSWORD` est encore `super2026` → change-le
- `SEED_DEMO=true` est activé → mets `false`

### Reset des comptes en cas de blocage
```bash
cd backend
.venv/bin/python3 -c "
from app.db.session import SessionLocal
from app.models import User
from sqlalchemy import select
import sys, hashlib, secrets
new_pwd = sys.argv[1] if len(sys.argv) > 1 else 'ChangeMoi2026!'
salt = secrets.token_hex(16)
digest = hashlib.pbkdf2_hmac('sha256', new_pwd.encode(), salt.encode(), 200_000)
with SessionLocal() as db:
    u = db.scalar(select(User).where(User.role == 'super_admin'))
    u.password_hash = f'{salt}\${digest.hex()}'
    db.commit()
    print(f'Super-admin reset OK — connecte-toi avec : {u.email} / {new_pwd}')
" "MonNouveauMotDePasse2026!"
```

## Quand passer en VPS (Option B) ?

Reste sur Option A tant que :
- Tu n'as pas de clients réels qui dépendent de KOMPTA 24/7
- Ton Mac est allumé la plupart du temps
- Tu n'as pas besoin de scale au-delà de 10-20 utilisateurs simultanés

Passe en VPS (Hetzner CX22 à 6 €/mois) dès que :
- Tu signes ton 1er client payant
- Tu veux fermer ton Mac le soir
- Tu vois des "tunnel disconnected" répétés dans les logs
