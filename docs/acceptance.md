# Aceptación de Lámina v1.0.0 (producción: https://lamina.cupula.com.ec)

Solo se marca como cumplido lo que tiene evidencia. Fecha: 19–20 oct 2026.

## ✅ Cumplido, con evidencia

| Criterio | Evidencia |
|---|---|
| Recorrido real de punta a punta con modelos `:free` y búsqueda real (tema de Cálculo «regla de la cadena» + URL de Wikipedia → contenido → edición → aprobación → diseño → revisión del renderer → aprobación → pulido → publicar por enlace → acceso anónimo → revocar) | `e2e/tests/prod.spec.ts` contra producción: **1 passed (11,1 min)**. Capturas: `docs/evidence/prod-1-contenido.png`, `prod-2-diseno.png`, `prod-3-publicada.png` |
| Fuentes reales conservadas | 7 fuentes de la presentación de prueba (la URL aportada + 6 páginas halladas por SearXNG), todas `ok` |
| **Gasto de IA = 0 USD** | OpenRouter `GET /key`: `usage = 0`, `limit = 0`; en `ai_calls` **0** modelos que no terminan en `:free`; fallback verificado (gemma sin cupo → nemotron) |
| Aislamiento entre cuentas y accesos sin sesión | `e2e/tests/security.spec.ts` (anónimo y dos cuentas) |
| Sandbox de componentes (red, DNS, metadata, rootfs, socket, secretos) bajo gVisor en prod | sonda `/v1/probe` en cloud-2: todo «BLOQUEADO», `env` solo `PWD`, uid 10002 |
| Componente ausente → provisional aislado → usado en la presentación → admin lo promueve a estable | `e2e/tests/components.spec.ts` (IA fake, entorno local con sandbox real) |
| Pruebas unitarias/integración | 118+ tests (`pnpm test`): contratos, workflow (transiciones inválidas, concurrencia, cuotas, límite de jobs), guard `:free`, SSRF, validadores matemáticos, AST del sandbox, pipeline completo |
| Revisión crítica (reviewer Opus) | 4 hallazgos altos y 8 medios corregidos (ver historial de commits `fix(seguridad)`) |
| Monitoreo | Uptime Kuma (monitores 50 y 51), NOC, Glance y status page pública |
| Backups | cron diario 03:40 (`scripts/backup.sh`, retención 14 días), restauración no probada aún |

## ⏳ Pendiente (no se marca como cumplido)

1. **Inicio de sesión con Google**: cliente OAuth cargado el 20 oct; el flujo arranca (redirige a Google) pero el login completo de un docente real no se ha probado de punta a punta (requiere una cuenta Google interactiva).
2. **Alta de docente desde el panel + correo real**: probado en local (contraseña temporal, cambio obligatorio, consentimiento); el envío SMTP por el relay de Cúpula y el ingreso del admin por Keycloak requieren una sesión interactiva de Esteban.
3. **Tavily**: clave cargada y activa como respaldo (no ejercitada: SearXNG responde primero).
4. **PR automático de componentes**: `GITHUB_TOKEN` de grano fino cargado (acceso solo a `cupula-ec/lamina`; comprobado: otros repos de la organización devuelven 404); el PR automático no se ha ejecutado en prod todavía.
5. **CLA Assistant** en el repo (GitHub App) y restauración de prueba de backups.
6. **Prompt injection con un PDF real hostil** en prod y prueba del especialista con modelos reales (la prueba automatizada usa IA fake para el componente).
7. Una presentación con subida de **PDF** en prod (cubierto por tests de extracción, no por el recorrido real).

---

# Aceptación de Lámina v1.2.0 (22 oct 2026; aún no desplegada)

Solo se marca lo que tiene evidencia; todo se ejecutó en local con IA fake (modelos `:free` no ejercitados en v1.2).

## ✅ Cumplido, con evidencia

| Criterio | Evidencia |
|---|---|
| Pruebas unitarias/integración | `pnpm test` (con `heavy.sh`): **475 tests** en contratos, sandbox-kit, ai, engine, validation, db, components, research, mcp, worker y web, todos verdes; `pnpm typecheck` sin errores |
| E2E Playwright (local, IA fake) | `pnpm --filter @lamina/e2e test`: 39 de 42 en la corrida completa (branding/onboarding con logo, flujo completo, galería 10 temas × 3 acentos × 17 layouts, selector de estilo, PDF escaneado con OCR, seguridad anónima, móvil). El test de componentes falló en esa corrida y pasó al repetirlo solo tras corregir el fake y una espera de hidratación (`components.spec.ts`: 1 passed) |
| Landing nueva | Accesibilidad Lighthouse **100**; capturas `docs/evidence/landing-desktop.png` y `landing-mobile.png` (sin desborde horizontal a 360 px) |
| Revisión del MCP/OAuth (reviewer Opus) | Hallazgos corregidos: destino real (`redirect_uri`) en el consentimiento, revocación de conexiones al cambiar/restablecer la clave (test en `apps/web/test/mcp-route.test.ts`), aviso de datos no confiables a la IA, `Object.hasOwn` en scopes |
| Flujo OAuth del MCP con el cliente del SDK | `docs/evidence/mcp-oauth-smoke.txt`, `mcp-flow.txt`, `mcp-conectar.png`, `mcp-presentacion-lista-para-aprobar.png` |

## ⏳ Pendiente (no se marca como cumplido)

1. **Migraciones 0001–0003 sobre una copia de la BD de producción** y comprobar que decks existentes abren y renderizan igual.
2. **Imagen del worker** (`docker/Dockerfile` con poppler + tesseract) sin construir.
3. **Prueba manual del MCP con Claude Code real** (`claude mcp add`); solo se llegó a «Needs authentication».
4. **Dos e2e saltados**: `prod.spec.ts` (solo contra producción) y «dos cuentas» (requiere correo configurado).
5. Registro dinámico de clientes anónimo sin limpieza automática, CIMD sin probar contra un dominio público, rate limits en memoria por instancia; validación del logo UPS por la institución; capacidad de cloud-2 para Tesseract + poppler; visión OCR con modelos `:free` reales.
6. Revisión final del diff completo (7.F.1) aparte del MCP: OCR, logos y migraciones no han tenido un `reviewer` dedicado en esta etapa.
