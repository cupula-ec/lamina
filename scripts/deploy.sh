#!/usr/bin/env bash
# Despliegue a cloud-2: rsync + build + migraciones + up. Uso: scripts/deploy.sh [host] [dir]
# Por servicio (no toca jobs si no incluye worker): SERVICES="web" scripts/deploy.sh   (web|worker|renderer|sandbox-runner; por defecto todos)
# Orden seguro de V3 (lectores antes que escritores): desplegar web+worker+renderer con el código que LEE v2 antes de activar el flag que ESCRIBE v2.
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${1:-cupula-server-cloud-2}"; REMOTE="${2:-/opt/lamina}"
echo "deploy -> $TARGET:$REMOTE"
SERVICES="${SERVICES:-web worker renderer sandbox-runner}"
[[ "$SERVICES" =~ ^(web|worker|renderer|sandbox-runner)( (web|worker|renderer|sandbox-runner))*$ ]] || { echo "SERVICES inválido: '$SERVICES' (use nombres separados por espacio: web worker renderer sandbox-runner)"; exit 2; }
has() { [[ " $SERVICES " == *" $1 "* ]]; }
DRAINS=0; { has worker || has renderer; } && DRAINS=1   # el renderer también ejecuta jobs (render): se drenan antes de recrearlo
DRAIN_SECS="${DRAIN_SECS:-120}"   # espera máx. a que terminen los jobs en curso antes de recrear contenedores
# SQL por stdin contra el postgres de producción (tolera que aún no exista: primer deploy).
pgq() { ssh "$TARGET" "cd $REMOTE && docker compose -f docker-compose.prod.yml exec -T postgres sh -c 'psql -U \$POSTGRES_USER -d \$POSTGRES_DB -At -v ON_ERROR_STOP=1'" 2>/dev/null || true; }
ssh "$TARGET" "sudo mkdir -p $REMOTE && sudo chown -R \$(id -u):\$(id -g) $REMOTE"
rsync -az --delete --exclude .git --exclude node_modules --exclude .next --exclude data --exclude '.env*' --exclude e2e/test-results --exclude 'apps/web/.env.local' --exclude apps/promo --exclude pnpm-lock.yaml --exclude pnpm-workspace.yaml ./ "$TARGET:$REMOTE/"
# apps/promo (video) no se despliega: lockfile y workspace salen del último commit, no del árbol de trabajo.
for f in pnpm-lock.yaml pnpm-workspace.yaml; do git show "HEAD:$f" | ssh "$TARGET" "cat > $REMOTE/$f"; done
ssh "$TARGET" "cd $REMOTE && bash scripts/provision.sh $REMOTE"
ssh "$TARGET" "cd $REMOTE && $(has sandbox-runner && echo 'docker build -q -f sandbox/Dockerfile -t lamina-sandbox:latest . &&') docker compose -f docker-compose.prod.yml build migrate $SERVICES"
# Jobs en curso: se espera a que drenen (DRAIN_SECS) y, lo que siga activo, se respalda y se reencola tras el deploy.
for ((i = 0; DRAINS == 1 && i < DRAIN_SECS; i += 10)); do
  [[ -n "$(echo "select 1 from pgboss.job where state='active' limit 1" | pgq)" ]] || break
  echo "esperando jobs activos ($i/${DRAIN_SECS}s)..."; sleep 10
done
ACTIVE=""; if [[ $DRAINS == 1 ]]; then ACTIVE="$(echo "select id from pgboss.job where state='active'" | pgq)"; fi
if [[ -n "$ACTIVE" ]]; then
  echo "AVISO: jobs activos que se reencolarán tras el deploy:"; echo "$ACTIVE"
  echo "$ACTIVE" | ssh "$TARGET" "cat > /var/tmp/lamina-active-jobs-\$(date +%s).txt"
fi
# El worker solo arranca si hay clave de OpenRouter (nunca en modo fake en producción).
ssh "$TARGET" "cd $REMOTE && SVC='postgres searxng migrate'; for s in $SERVICES; do [ \$s = worker ] || SVC=\"\$SVC \$s\"; done; if ! echo \" $SERVICES \" | grep -q \" worker \"; then :; elif grep -q '^OPENROUTER_API_KEY=.' .env; then SVC=\"\$SVC worker\"; else echo 'AVISO: sin OPENROUTER_API_KEY: el worker NO se inicia'; fi; docker compose -f docker-compose.prod.yml up -d \$SVC"
# Restauración: un job que estaba activo antes del deploy y sigue activo ahora quedó huérfano (su worker murió); se reencola sin gastar reintentos.
if [[ -n "$ACTIVE" ]]; then
  sleep 15
  IDS="$(echo "$ACTIVE" | sed "s/.*/'&'/" | paste -sd,)"
  echo "update pgboss.job set state='retry', start_after=now(), started_on=null where state='active' and id in ($IDS) returning name, id" | pgq | sed 's/^/reencolado: /'
fi
# vhost de nginx: solo se instala si cambió; certbot ya gestiona el bloque 443 (no se pisa).
ssh "$TARGET" "cd $REMOTE && sudo install -m 644 deploy/lamina-proxy.conf /etc/nginx/snippets/lamina-proxy.conf && if [ ! -e /etc/nginx/sites-enabled/lamina.cupula.com.ec ]; then sudo install -m 644 deploy/nginx-lamina.conf /etc/nginx/sites-available/lamina.cupula.com.ec && sudo ln -s /etc/nginx/sites-available/lamina.cupula.com.ec /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx && sudo certbot --nginx -d lamina.cupula.com.ec --redirect --non-interactive --agree-tos; fi"
ssh "$TARGET" "cd $REMOTE && docker compose -f docker-compose.prod.yml ps"
