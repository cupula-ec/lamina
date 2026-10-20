#!/usr/bin/env bash
# Se ejecuta EN EL SERVIDOR (cloud-2). Crea /opt/lamina/.env con secretos aleatorios si no existe; no pisa valores existentes.
set -euo pipefail
DIR="${1:-/opt/lamina}"
cd "$DIR"
touch .env && chmod 600 .env
rnd() { head -c "${1:-32}" /dev/urandom | base64 | tr -d '/+=\n' | head -c "${1:-32}"; }
setv() { grep -q "^$1=" .env || echo "$1=$2" >> .env; }
setv NODE_ENV production
setv APP_URL https://lamina.cupula.com.ec
setv POSTGRES_PASSWORD "$(rnd 32)"
setv BETTER_AUTH_SECRET "$(rnd 48)"
setv RENDER_SERVICE_TOKEN "$(rnd 40)"
setv SANDBOX_TOKEN "$(rnd 40)"
setv SEARXNG_SECRET "$(rnd 40)"
setv ADMIN_EMAILS esteban.morocho@cupula.com.ec
setv KEYCLOAK_ISSUER https://auth.cupula.com.ec/realms/cupula
setv LAMINA_AI_PROVIDER openrouter
setv AI_DAILY_BUDGET 800
setv MAIL_FROM '"Lámina <noreply@cupula.com.ec>"'
# SMTP: mismo relay que usan Talento/Yapo (por Tailscale)
if ! grep -q "^SMTP_HOST=" .env && [ -r /opt/recruitment/.env ]; then
  grep -E '^(SMTP_HOST|SMTP_PORT|SMTP_USER|SMTP_PASS)=' /opt/recruitment/.env >> .env
fi
echo "provisionado: $(grep -c . .env) variables"
