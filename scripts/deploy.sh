#!/usr/bin/env bash
# Despliegue a cloud-2: rsync + build + migraciones + up. Uso: scripts/deploy.sh [host] [dir]
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${1:-cupula-server-cloud-2}"; REMOTE="${2:-/opt/lamina}"
echo "deploy -> $TARGET:$REMOTE"
ssh "$TARGET" "sudo mkdir -p $REMOTE && sudo chown -R \$(id -u):\$(id -g) $REMOTE"
rsync -az --delete --exclude .git --exclude node_modules --exclude .next --exclude data --exclude '.env*' --exclude e2e/test-results --exclude 'apps/web/.env.local' --exclude apps/promo/out --exclude apps/promo/public ./ "$TARGET:$REMOTE/"
ssh "$TARGET" "cd $REMOTE && bash scripts/provision.sh $REMOTE"
ssh "$TARGET" "cd $REMOTE && docker build -q -f sandbox/Dockerfile -t lamina-sandbox:latest . && docker compose -f docker-compose.prod.yml build web worker renderer migrate sandbox-runner"
# El worker solo arranca si hay clave de OpenRouter (nunca en modo fake en producción).
ssh "$TARGET" "cd $REMOTE && SVC='postgres searxng migrate web renderer sandbox-runner'; if grep -q '^OPENROUTER_API_KEY=.' .env; then SVC=\"\$SVC worker\"; else echo 'AVISO: sin OPENROUTER_API_KEY: el worker NO se inicia'; fi; docker compose -f docker-compose.prod.yml up -d \$SVC"
# vhost de nginx: solo se instala si cambió; certbot ya gestiona el bloque 443 (no se pisa).
ssh "$TARGET" "cd $REMOTE && sudo install -m 644 deploy/lamina-proxy.conf /etc/nginx/snippets/lamina-proxy.conf && if [ ! -e /etc/nginx/sites-enabled/lamina.cupula.com.ec ]; then sudo install -m 644 deploy/nginx-lamina.conf /etc/nginx/sites-available/lamina.cupula.com.ec && sudo ln -s /etc/nginx/sites-available/lamina.cupula.com.ec /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx && sudo certbot --nginx -d lamina.cupula.com.ec --redirect --non-interactive --agree-tos; fi"
ssh "$TARGET" "cd $REMOTE && docker compose -f docker-compose.prod.yml ps"
