# ADR-004 — Aislamiento de componentes generados por IA

**Fecha:** 19 oct 2026 · **Estado:** aceptada

El código de un componente nuevo es **no confiable**. Defensa en profundidad, de fuera hacia dentro:

1. **Análisis estático (AST)** (`packages/sandbox-kit/src/astcheck.ts`, TypeScript compiler API): solo `react` y `@lamina/sdk`; prohíbe `fetch`, `eval`, `Function`, globales (`window`, `document`, `globalThis`…), `constructor`/`__proto__`, accesos computados por cadena, manejadores de eventos, `dangerouslySetInnerHTML`, `<script>/<iframe>/<a>/<img>`… Se ejecuta en el worker y otra vez dentro del contenedor.
2. **Contenedor efímero con gVisor** (`runsc`, instalado en cloud-2 el 19 oct 2026, ver infra §52) lanzado por `sandbox-runner`: `--network none`, rootfs de solo lectura, tmpfs, 512 MB, 1 CPU, 128 pids, `cap_drop ALL`, `no-new-privileges`, sin variables de entorno ni secretos, timeout 60 s. **El worker nunca recibe el socket de Docker**: habla con un runner de API estrecha (plantilla fija; ningún dato del cliente llega a flags de Docker). La sonda `/v1/probe` demuestra en prod que no hay red, DNS, metadata, escritura en rootfs, socket ni secretos del host.
3. **Build y pruebas en el contenedor**: typecheck estricto contra el SDK, bundle IIFE (esbuild), render de fixtures en un DOM simulado sin errores de consola, sin elementos peligrosos, tamaño máximo.
4. **Runtime en el navegador**: `<iframe sandbox="allow-scripts">` **sin** `allow-same-origin` (origen opaco), `srcdoc` con CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:`, props por `postMessage`, tamaño fijado por el slot. Mismo runtime en preview, `/view` y Playwright. El bundle además anula `Function.prototype.constructor`.
5. **Ciclo de vida**: provisional con `scope = presentación` → el docente lo evalúa → promoción a estable solo por un admin (instantánea en BD, versionada) + PR automático con el código. Lo publicado fija `componentPins` (id, versión y **hash del bundle**): no cambia retroactivamente. Un componente roto o caído se muestra como error de slot y se resuelve con diseño de respaldo; nunca tumba el deck.

**Riesgo residual:** el sandbox comparte host con otros servicios (cloud-2). Mitigado con gVisor, límites de recursos y cola de 1 build simultáneo. Pendiente a futuro: host dedicado.
