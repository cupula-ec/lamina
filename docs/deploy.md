# Despliegue en producción (cloud-2)

`scripts/deploy.sh [host] [dir]` hace rsync a `/opt/lamina`, genera `.env` (secretos aleatorios, `scripts/provision.sh`), construye imágenes (web, worker, renderer, sandbox, sandbox-runner), aplica migraciones y levanta `docker-compose.prod.yml`. La primera vez instala el vhost de nginx y ejecuta `certbot --nginx`.

Requisitos del servidor: Docker con `runsc` (gVisor) registrado, nginx, certbot, DNS `A` del dominio, SMTP (relay) y, opcionalmente, Keycloak/Google.
Variables a completar en `/opt/lamina/.env`: `OPENROUTER_API_KEY` (el worker no arranca sin ella), `GOOGLE_CLIENT_ID/SECRET`, `KEYCLOAK_CLIENT_ID/SECRET`, `TAVILY_API_KEY`, `GITHUB_TOKEN`.
Detalle operativo e infraestructura: repo de infra de Cúpula, secciones 52 y 53.
