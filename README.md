<div align="center">

# Lámina

### Tu clase, con fórmulas y gráficas, lista para proyectar.

**Presentaciones educativas con IA que investiga, redacta y diseña — y que tú revisas y apruebas en cada etapa.**
Hecha en Ecuador, para docentes de Cálculo, Álgebra, Matemática y Física.

[**Probar Lámina →**](https://lamina.cupula.com.ec) · [Alojamiento con Cúpula Systems](#-hospédala-con-cúpula-systems) · [Instalar por tu cuenta](#-instalación-en-5-minutos)

![Licencia AGPL-3.0](https://img.shields.io/badge/licencia-AGPL--3.0-1b4f9c)
![Gasto en IA](https://img.shields.io/badge/gasto%20en%20IA-0%20USD-17482a)
![Hecho en Ecuador](https://img.shields.io/badge/hecho%20en-Ecuador%20🇪🇨-c0301c)
![Código abierto](https://img.shields.io/badge/c%C3%B3digo-abierto-0b6b5f)

</div>

---

## Por qué Lámina

Preparar una clase de Cálculo con buenas gráficas, derivaciones paso a paso y ejemplos resueltos puede costar un fin de semana. Las herramientas de IA genéricas generan diapositivas bonitas… con fórmulas inventadas y sin fuentes.

**Lámina es distinta:** no es un prompt que devuelve diapositivas, es un **flujo de trabajo revisable** donde la IA propone, el motor garantiza consistencia y **el docente conserva la última palabra** antes de publicar.

| | Herramientas genéricas | **Lámina** |
|---|---|---|
| Matemática | Fórmulas a ojo | **Verificada**: KaTeX + comprobación numérica de igualdades y derivadas; lo que no se puede verificar, se marca |
| Fuentes | Inventadas o ausentes | **Cada afirmación apunta a su fuente** (tus apuntes, PDF, enlaces, búsqueda web) |
| Control | Resultado final y ya | **Apruebas el contenido y luego el diseño**; versiones, feedback y regeneración por sección o diapositiva |
| Gráficas | Imágenes estáticas | **Calculadas desde la función**: tangentes, secantes, áreas, asíntotas, vectores, geometría |
| Costo | Suscripción por usuario | **Gratis para docentes ecuatorianos** · código abierto |
| Tus datos | Caja negra | **Privado por defecto**, enlace revocable, aviso claro de qué ve la IA |

## Qué incluye

- **Investigación real.** Sube apuntes (Markdown), PDF, DOCX o enlaces; Lámina busca fuentes adicionales y te muestra de dónde sale cada dato. Si la búsqueda no está disponible, lo dice: nunca simula.
- **Editor de contenido estructurado.** Secciones, fórmulas con vista previa KaTeX en vivo, derivaciones, ejemplos resueltos, tablas y gráficas. Bloquea las secciones que te gustan y regenera el resto con tus comentarios.
- **16 componentes visuales científicos** listos: gráfica de funciones, derivación paso a paso, ejemplo resuelto, fórmula destacada, vectores 2D, figuras geométricas, tablas, definiciones/teoremas, preguntas para la clase…
- **Componentes nuevos a pedido.** ¿Falta una recta numérica o un diagrama de fases? La IA lo construye **en un entorno aislado (gVisor)**, lo prueba y lo usa en tu presentación en minutos; un administrador decide si pasa al catálogo de todos.
- **Revisión automática de diseño.** Un renderizador detecta desbordes, texto ilegible, fórmulas rotas y componentes caídos antes de que lo veas.
- **Presenta en el navegador.** Pantalla completa, transiciones sobrias, aparición progresiva y **notas del presentador en otra ventana**. Pensado para proyector (alto contraste, tipografía legible).
- **Compartir con control.** Privada, por enlace revocable o pública. La autorización ocurre en el servidor; un UUID nunca basta.
- **Panel de administración.** Altas de docentes con contraseña temporal por correo, cuotas por usuario, revisión de componentes propuestos, métricas de embudo y estado de los trabajos.

## Cómo funciona

```
Tema + materiales ─▶ Investigación ─▶ Borrador de contenido ─▶ ✅ Apruebas
                                                                    │
        Presentación web ◀─ ✅ Apruebas ◀─ Diseño con componentes ◀─┘
        (privada · enlace · pública)       (revisión visual automática)
```

1. **Cuéntale el tema** — nivel y objetivo. Opcionalmente, tus materiales.
2. **Revisa el contenido** — editable, con fuentes y avisos de verificación.
3. **Revisa el diseño** — miniaturas, problemas detectados, cambios por diapositiva.
4. **Presenta o comparte.**

## Confianza y seguridad, de serie

- **Gasto en IA: 0 USD.** Solo modelos gratuitos; un *guard* inspecciona cada petición y rechaza cualquier modelo de pago.
- **Código generado por IA = código no confiable.** Análisis estático → contenedor efímero con gVisor, sin red, sin secretos → iframe con origen opaco y CSP estricta.
- **Anti-SSRF y anti-inyección.** Los textos externos son datos, nunca instrucciones.
- **Máquina de estados persistente.** Nadie salta la aprobación, ni llamando a la API directamente; las aprobaciones referencian versión + hash.
- **Tus datos:** consentimiento explícito, borrado completo de la presentación y de la cuenta, retención acotada.

---

## 🇪🇨 Hospédala con Cúpula Systems

> **¿Eres una unidad educativa, universidad, colegio de profesores o ministerio y quieres Lámina funcionando para tu institución — sin montar servidores?**
> **Cúpula Systems**, la empresa detrás de Lámina, es tu **partner de alojamiento en Ecuador**.

Lámina es software libre: puedes instalarlo tú mismo. Pero operar IA, colas, renderizado y un sandbox seguro **bien** requiere experiencia. Nosotros ya lo hacemos en producción y podemos hacerlo por ti.

**Lo que te ofrecemos**

- ✅ **Instancia dedicada** de Lámina con el dominio de tu institución (`clases.tu-universidad.edu.ec`) y tu marca.
- ✅ **Infraestructura gestionada**: despliegue, TLS, actualizaciones, copias de seguridad, monitoreo 24/7 y página de estado.
- ✅ **Inicio de sesión institucional** (SSO / Google Workspace / Microsoft) y alta masiva de docentes.
- ✅ **Cuotas y políticas a tu medida**, catálogo de componentes propio por institución y panel de métricas de uso.
- ✅ **Acompañamiento a docentes**: capacitación, soporte en español y mejoras priorizadas con tu equipo.
- ✅ **Datos con criterio local**: contratos y tratamiento de datos acordes a tu normativa; opciones de modelos de IA según tu política de privacidad.
- ✅ **Sin lock-in**: es código abierto (AGPL-3.0). Tus presentaciones y datos son tuyos, y puedes migrar a tu propia infraestructura cuando quieras.

**Quién lo hace posible:** Cúpula Systems opera su propia infraestructura (DNS autoritativo, monitoreo, identidad y plataformas productivas) y desarrolla software a medida en Ecuador.

### 📩 Hablemos

**[systems.cupula.com.ec](https://systems.cupula.com.ec)** — escríbenos desde el formulario de cotización y cuéntanos tu institución, el número de docentes y tus requisitos. Te respondemos con una propuesta a la medida.

*Lámina está disponible gratis para docentes ecuatorianos en [lamina.cupula.com.ec](https://lamina.cupula.com.ec) (acceso por invitación mientras el servicio crece).*

---

## 🚀 Instalación en 5 minutos

Requisitos: Node 24, pnpm 11, Docker.

```bash
git clone https://github.com/cupula-ec/lamina && cd lamina
pnpm install
docker compose -f docker-compose.dev.yml up -d          # Postgres 17 + SearXNG
cp .env.example apps/web/.env.local                      # ajusta DATABASE_URL, secretos
pnpm --filter @lamina/db migrate
./scripts/dev-up.sh                                      # web + worker + renderer (IA fake por defecto)
```

Abre <http://localhost:3100>. Con `LAMINA_AI_PROVIDER=fake` todo funciona sin claves (contenido determinista de Cálculo). Para IA real: `LAMINA_AI_PROVIDER=openrouter` y una clave de OpenRouter (**solo modelos `:free`**).

Más detalle: [docs/local-dev.md](docs/local-dev.md) · despliegue en producción: [docs/deploy.md](docs/deploy.md) · decisiones técnicas: [docs/adr](docs/adr/README.md) · límites conocidos: [docs/known-limitations.md](docs/known-limitations.md).

## Arquitectura

```
apps/web        Next.js 16 · Better Auth · Server Actions · visor y presentador
apps/worker     pg-boss: investigación, contenido, diseño, pulido, componentes
apps/renderer   Playwright/Chromium: capturas y detección de problemas
apps/sandbox-runner  API estrecha sobre Docker (gVisor) para componentes de IA
packages/       contracts · db · ai · research · validation · engine · components · sandbox-kit · jobs
```

Contratos versionados (`ContentDraft`, `DeckDocument`, `ComponentManifest`), motor de presentaciones independiente del modelo y Postgres como única fuente de verdad.

## Contribuir

PRs bienvenidos: lee [CONTRIBUTING.md](CONTRIBUTING.md) y el [CLA](CLA.md). Los componentes nuevos del catálogo (con manifest, fixtures y tests) son la forma más directa de ayudar a otros docentes.

## Licencia

[GNU AGPL-3.0](LICENSE) © 2026 Cúpula Systems. Si ofreces Lámina como servicio, tus modificaciones deben compartirse con la comunidad. ¿Necesitas condiciones distintas para tu institución? [Hablemos](https://systems.cupula.com.ec).

<div align="center">

**Hecho con cariño en Ecuador 🇪🇨 por [Cúpula Systems](https://systems.cupula.com.ec)**

</div>
