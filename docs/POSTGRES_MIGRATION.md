# Migration SQLite → PostgreSQL (production)

Ce document décrit la procédure de bascule de la production KOMPTA
(actuellement SQLite dans un volume Docker) vers PostgreSQL. L'outillage a
été testé de bout en bout en local sur une copie de la base de dev (57
tables, 3083 lignes) : migration, connexion applicative, réalignement des
séquences, backup et restauration. Voir les commits associés pour le détail.

**Avant de commencer**, sache que cette opération nécessite une courte
coupure de service (fenêtre de maintenance) et modifie des données de
production réelles. Prends un moment calme, pas un vendredi 18h.

## 0. Pré-requis

- Le code est déjà à jour sur le serveur (`git log` doit inclure les commits
  ajoutant `docker-compose.yml` profil `postgres`, `backend/scripts/
  migrate_sqlite_to_postgres.py`, `backend/scripts/check_orphaned_fks.py`,
  `scripts/backup-postgres.sh` et `scripts/restore-postgres.sh`).
- Accès SSH à l'instance Lightsail.
- Un mot de passe PostgreSQL fort prêt (`openssl rand -hex 24`).

## 1. Vérifier l'intégrité des données avant bascule

SQLite n'impose pas les contraintes de clé étrangère par défaut,
contrairement à PostgreSQL. D'anciennes suppressions ont pu laisser des
références orphelines (ex. un `audit_logs.user_id` pointant vers un
utilisateur supprimé) — sans gravité sous SQLite, mais qui ferait échouer
un futur `pg_dump`/`pg_restore` sur PostgreSQL une fois migré.

```bash
cd /opt/kompta
docker compose exec backend python -m scripts.check_orphaned_fks \
  --sqlite sqlite:////app/storage/kompta.db
```

- Si le script rapporte "Aucune référence orpheline détectée", passe à
  l'étape 2.
- Sinon, il liste précisément chaque ligne orpheline (table, colonne, id).
  Décide au cas par cas : mettre la colonne à `NULL` (si nullable) ou
  supprimer la ligne. Exemple pour un audit_log orphelin identifié `id=106` :
  ```bash
  docker compose exec backend python3 -c "
  import sqlite3
  conn = sqlite3.connect('/app/storage/kompta.db')
  conn.execute('UPDATE audit_logs SET user_id = NULL WHERE id = 106')
  conn.commit()
  "
  ```
  Ne fais **jamais** cette étape à la légère sur des données de production
  sans comprendre pourquoi la référence est orpheline.

## 2. Sauvegarder la base SQLite actuelle (filet de sécurité)

```bash
cd /opt/kompta
docker compose exec backend sh -c "sqlite3 /app/storage/kompta.db '.backup /app/storage/pre-postgres-backup.db'"
docker cp kompta_backend:/app/storage/pre-postgres-backup.db ./backups/
```

Garde ce fichier de côté — c'est le vrai filet de sécurité si la migration
tourne mal (retour arrière = repointer `DATABASE_URL` sur SQLite et
redémarrer, voir §6).

## 3. Démarrer PostgreSQL

Dans `infra/aws/.env.production` (sur le serveur, pas dans le repo), ajoute :

```
POSTGRES_DB=kompta
POSTGRES_USER=kompta
POSTGRES_PASSWORD=<mot de passe fort généré à l'étape 0>
```

Puis démarre le conteneur (n'affecte pas le backend qui tourne encore sur
SQLite à ce stade) :

```bash
cd /opt/kompta
docker compose --env-file infra/aws/.env.production --profile postgres up -d postgres
docker compose exec postgres pg_isready -U kompta -d kompta   # doit répondre "accepting connections"
```

## 4. Fenêtre de maintenance — couper l'écriture

À partir d'ici, plus personne ne doit écrire dans la base SQLite pendant la
migration (sinon ces écritures seraient perdues, la migration ne prenant
qu'un instantané). Le plus simple :

```bash
docker compose stop backend
```

(Le frontend restera up mais affichera des erreurs réseau — c'est attendu et
bref, quelques minutes.)

## 5. Lancer la migration

```bash
cd /opt/kompta
docker compose run --rm backend \
  python -m scripts.migrate_sqlite_to_postgres \
  --sqlite sqlite:////app/storage/kompta.db \
  --postgres postgresql://kompta:<mot de passe>@postgres:5432/kompta
```

(`docker compose run` attache automatiquement le conteneur au réseau du
projet, donc le service `postgres` est joignable par son nom sans option
réseau supplémentaire.)

Le script affiche le compte de lignes par table (source vs copiées) et
s'arrête avec un code d'erreur si un écart est détecté — dans ce cas, **ne
continue pas** à l'étape 6, diagnostique d'abord (le message précise quelles
tables divergent).

Attends le message final : `✓ Migration terminée, tous les comptages
correspondent.`

## 6. Basculer le backend sur PostgreSQL

Dans `infra/aws/.env.production` :

```
DATABASE_URL=postgresql://kompta:<mot de passe>@postgres:5432/kompta
```

Puis :

```bash
docker compose --env-file infra/aws/.env.production --profile postgres up -d
```

(`--profile postgres` est nécessaire à chaque commande `up`/`pull` tant que
Postgres doit rester démarré — sinon Compose ne le redémarrerait pas après
un redéploiement. Pense à mettre à jour `deploy-fast.sh` pour inclure
`--profile postgres` de façon permanente une fois la bascule confirmée.)

## 7. Vérifier

```bash
curl -s http://localhost:8010/api/health
# {"status":"ok","service":"kompta-api"}
```

Puis dans un navigateur : connexion super-admin, vérifier que les
entreprises/utilisateurs existants apparaissent bien (`/admin/companies`),
créer un test rapide (ex. une entreprise de test) pour confirmer qu'aucune
collision d'ID ne se produit (les séquences PostgreSQL ont été réalignées
automatiquement par le script de migration), puis la supprimer.

## 8. Mettre en place les sauvegardes automatiques

```bash
crontab -e
```

Ajoute :

```
0 3 * * * cd /opt/kompta && ./scripts/backup-postgres.sh >> /var/log/kompta-pg-backup.log 2>&1
```

Vérifie manuellement une première fois avant de faire confiance au cron :

```bash
cd /opt/kompta && ./scripts/backup-postgres.sh
ls -lh backups/postgres/
```

## 9. En cas de problème — retour arrière

Tant que tu n'as pas supprimé le fichier SQLite ni le backup de l'étape 2,
le retour arrière est simple :

```bash
# Dans infra/aws/.env.production, remets :
# DATABASE_URL=  (vide, ou supprime la ligne — SQLite redevient le défaut)
docker compose --env-file infra/aws/.env.production up -d
```

Toute écriture faite pendant la fenêtre PostgreSQL (étapes 6-7) serait
perdue en revenant à la version SQLite d'avant migration — c'est pour ça que
l'étape 4 (couper l'écriture pendant la bascule) est importante : elle
garantit qu'il n'y a justement aucune écriture à perdre.

## Après la bascule

- Le fichier SQLite dans le volume `kompta_storage` reste en place (pas de
  suppression automatique) — tu peux le garder quelques semaines par
  précaution avant de le nettoyer.
- `backend/alembic.ini` existe mais n'a pas encore de révisions générées ;
  une fois sur PostgreSQL, envisage `alembic revision --autogenerate` pour
  établir une base de référence et gérer les futures évolutions de schéma
  proprement plutôt que via `Base.metadata.create_all()` seul.
