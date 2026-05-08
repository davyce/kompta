.PHONY: dev prod build stop logs clean

# Développement local (sans Docker)
dev-local:
	@echo "🚀 Démarrage KOMPTA en local..."
	@cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload &
	@cd frontend && npm run dev

# Développement avec Docker
dev:
	docker compose -f docker-compose.dev.yml up --build

# Production
prod:
	docker compose up --build -d

# Build uniquement
build:
	docker compose build

# Arrêt
stop:
	docker compose down

# Logs
logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

logs-frontend:
	docker compose logs -f frontend

# Nettoyage
clean:
	docker compose down -v --remove-orphans
	docker system prune -f

# Status
status:
	docker compose ps

# Backup SQLite
backup:
	@mkdir -p backups
	@cp kompta.db backups/kompta-$(shell date +%Y%m%d-%H%M%S).db
	@echo "✅ Backup créé dans backups/"

# Shell backend
shell-backend:
	docker compose exec backend bash

# Mise à jour
update:
	git pull origin main
	docker compose up --build -d
	@echo "✅ Mise à jour terminée"
