#!/bin/bash

set -e

echo "📦 Pulling latest changes from git..."
git reset --hard HEAD
git pull

echo "🔨 Building containers..."
docker compose build

echo "🚀 Starting containers..."
docker compose up -d --force-recreate

echo "✅ Deployment complete!"
echo "📊 Container status:"
docker compose ps

echo ""
echo "📝 To view logs, run: docker compose logs -f"
