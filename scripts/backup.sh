#!/usr/bin/env bash
# Backup diario (cron en cloud-2): volcado de Postgres + tar del volumen de datos, retención 14 días. Carpeta 700.
set -euo pipefail
D=/opt/lamina/backups; mkdir -p "$D"; chmod 700 "$D"; T=$(date +%Y%m%d-%H%M)
docker exec lamina-postgres-1 pg_dump -U lamina -Fc lamina > "$D/db-$T.dump"
docker run --rm -v lamina_data:/data:ro -v "$D":/out alpine sh -c "tar czf /out/data-$T.tgz -C /data . && chown $(id -u):$(id -g) /out/data-$T.tgz"
chmod 600 "$D"/*; find "$D" -type f -mtime +14 -delete
