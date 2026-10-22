# ADR-001 — IA: solo modelos `:free` de OpenRouter

**Fecha:** 19 oct 2026 · **Estado:** aceptada

## Contexto
El servicio es gratuito para docentes ecuatorianos y el gasto en IA debe ser **0 USD**, aunque la cuenta de OpenRouter tenga saldo. Las APIs gratuitas cambian: hay que verificar y no asumir.

## Verificación (19 oct 2026, fuentes oficiales)
- `GET https://openrouter.ai/api/v1/models`: **17 modelos `:free`**, entre ellos `nvidia/nemotron-3-super-120b-a12b:free` (262k ctx, tools+JSON), `google/gemma-4-31b-it:free` y `gemma-4-26b-a4b-it:free` (262k, JSON), `minimax/minimax-m3.1-flash:free` (1M, JSON), `nvidia/nemotron-3-ultra-550b-a55b:free` (1M), `poolside/laguna-s-2.1:free` y `cohere/north-mini-code:free` (código).
- Límites (docs `limits`): **20 solicitudes/minuto** por cuenta en modelos free; **50/día** si se han comprado < 10 créditos y **1000/día** con ≥ 10. Un saldo negativo devuelve 402 incluso en modelos free.
- Política de datos: los proveedores gratuitos pueden retener y usar los prompts. Se informa al docente (consentimiento al primer ingreso y al subir materiales) y se prohíbe subir datos de estudiantes.

## Decisión
1. **Guard duro** (`packages/ai/src/guard.ts`): solo ids que cumplen `…/…:free`. Se aplica en (a) la configuración de cadenas por rol, (b) el proveedor, y (c) un `fetch` envuelto que inspecciona el cuerpo de **cada** petición a OpenRouter y rechaza modelos de pago, `models[]` (fallback), `route` y `plugins` (podrían generar coste). Tests: `packages/ai/test/ai.test.ts` (el fetch real nunca se invoca con un modelo de pago).
2. **Cadena de fallback por rol** (`packages/ai/src/models.ts`), sobrescribible por entorno; los modelos que desaparecen se saltan con cooldown.
3. **Presupuesto global diario** en BD (`AI_DAILY_BUDGET`, 800 = 80 % de 1000) y limitador local de 18 req/min. Cupo agotado → el job pasa a `quota_wait` con hora estimada de reanudación (reanudación automática cada 30 s).
4. **Clave dedicada** con límite de crédito 0 USD (la entrega Esteban); `ai_calls` registra modelo/latencia/resultado y el panel admin muestra si alguna llamada usó un modelo no `:free` (debe ser siempre «ninguno»).

## Consecuencias
Calidad variable y 429 frecuentes: salida estructurada validada con Zod, una reparación acotada por modelo, verificación determinista de la matemática (ADR-009) y diseño de respaldo 100 % determinista si la IA falla.

**Actualización v1.2 (rol `vision`, ADR-014):** verificado el 22 oct 2026 con la API pública: 17 modelos `:free`, 8 aceptan imagen. Cadena `vision` por defecto: `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free`, `nvidia/nemotron-3.5-super-vl:free` (sobrescribible con `LAMINA_MODELS_VISION`). El guard `:free` aplica igual (tests en `packages/ai/test/vision.test.ts`); las imágenes se reenvían como `image_url` y nunca se registran en `ai_calls`.
