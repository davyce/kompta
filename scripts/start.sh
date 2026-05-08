#!/bin/bash
set -e

echo "🚀 KOMPTA — Démarrage..."

# Vérifier si .env existe
if [ ! -f .env ]; then
    echo "⚠️  Fichier .env non trouvé. Copie depuis .env.example..."
    cp .env.example .env
    echo "✅ .env créé. Modifie-le avec tes paramètres."
fi

# Démarrer
docker compose up --build -d

echo ""
echo "✅ KOMPTA démarré !"
echo "   Frontend : http://localhost"
echo "   Backend  : http://localhost:8010"
echo "   API docs : http://localhost:8010/docs"
echo ""
echo "📋 Logs : make logs"
echo "🛑 Stop  : make stop"
