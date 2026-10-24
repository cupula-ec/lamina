# Runbook de producción (V3)

Reglas completas: `docs/PLAN-v3.md` §4. Todo cambio manual en la BD de producción se escribe aquí (script + motivo).

## Antes de migrar o desplegar

1. **Respaldo:** `ssh cupula-server-cloud-2 'bash /opt/lamina/scripts/backup.sh'` y verificar que `db-<fecha>.dump` existe (`pg_restore -l` lo lista sin error).
2. **Probar la migración en una copia:** restaurar el dump en una BD temporal y ejecutar `migrate` contra ella:
   ```
   createdb lamina_copia && pg_restore -d lamina_copia db-<fecha>.dump
   DATABASE_URL=postgres://.../lamina_copia pnpm --filter @lamina/db migrate
   ```
   Precedente de evidencia: `docs/evidence/`.
3. **Solo migraciones aditivas** (tablas/columnas nuevas, `null` o default = comportamiento v2). Nunca renombrar ni borrar en la misma versión.
4. **Ventana:** fuera de horas de clase. Comprobar jobs activos: `select name,state,count(*) from pgboss.job where state in ('active','retry') group by 1,2;`

## Despliegue por servicio

```
SERVICES="web" scripts/deploy.sh                 # solo web: no toca el worker ni los jobs
SERVICES="web renderer" scripts/deploy.sh
scripts/deploy.sh                                # todos (espera DRAIN_SECS a que drenen los jobs y reencola huérfanos)
```

Con `worker` en `SERVICES` el script espera a que se vacíe la cola (`DRAIN_SECS`, 120 s por defecto) y reencola los jobs que sigan activos.
Hasta que existan los jobs durables (bloque 1) **no desplegar el worker con jobs activos** salvo que el docente afectado esté avisado.

## Lectores antes que escritores (esquemas v2)

1. Desplegar en **web, worker y renderer** el código que *lee* v2 (`parseDeckAny` / `parseContentAny`).
2. Solo después activar el flag que hace que algo *escriba* v2.
3. Las versiones guardadas nunca se reescriben.

## Feature flags

Se guardan en `app_settings` (clave `v3_flags`), sin deploy. Orden de activación: `testers` → `volunteers` → `all`. Para apagar: `mode: "off"` (apaga también los overrides por usuario/presentación; para activar a una sola persona usar `mode: "testers"` con su id).

```sql
-- Ver
select value from app_settings where key = 'v3_flags';
-- Apagar uno
update app_settings set value = jsonb_set(value, '{v3_images,mode}', '"off"'), updated_at = now() where key = 'v3_flags';
-- Activar para cuentas de prueba
insert into app_settings(key, value) values ('v3_flags', '{"v3_images":{"mode":"testers","testers":["<uuid>"]}}')
  on conflict (key) do update set value = app_settings.value || '{"v3_images":{"mode":"testers","testers":["<uuid>"]}}', updated_at = now();
```

Nombres: ver `FLAG_NAMES` en `packages/db/src/flags.ts`. La caché es de 15 s.

## Timeouts de jobs

El timeout lo fija el worker con `QUEUE_CONFIG` (`packages/jobs/src/index.ts`) en la COLA al arrancar (`createQueue` + `updateQueue`) y cada job lo copia al encolarse: **los jobs ya encolados conservan su valor**. Se puede sobrescribir por entorno sin tocar código: `LAMINA_JOB_EXPIRE_DESIGN_GENERATE=2400` (segundos, mínimo 30) y reiniciar el worker; afecta a los jobs que se encolen después.

## Reversión

Apagar el flag y volver a la imagen anterior (`docker compose ... up -d <servicio>` con la imagen previa). Los datos nuevos se conservan (migraciones aditivas).

## Bitácora de cambios manuales en producción

| Fecha | Qué | Script | Motivo |
|---|---|---|---|
| 2026-10-23 | `expire_seconds` subido a mano en la fila de un job | `update pgboss.job set expire_seconds=...` | Incidente: no surtió efecto, el timeout real sale de `QUEUE_CONFIG` (ahora configurable por env) |
