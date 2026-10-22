# Conectar Lámina con tu IA (MCP)

Con MCP una IA potente que ya usas (Claude Desktop, Claude Code, claude.ai…) puede **crear borradores de presentaciones en tu cuenta**: redacta el contenido y propone el diseño usando el catálogo de componentes, los layouts, los temas y la verificación matemática de Lámina. **Tú revisas y apruebas en Lámina**, como siempre. El gasto de IA lo asume tu proveedor; Lámina no usa su cupo gratuito.

## Lo que puede y no puede hacer

| Puede | No puede |
|---|---|
| Ver **solo tus** presentaciones y su etapa | Aprobar contenido o diseño |
| Crear presentaciones nuevas (borrador) | Publicar, compartir o cambiar la visibilidad |
| Enviar contenido (`ContentDraft`) y diseño (`DeckDocument`) | Borrar nada |
| Validar un deck sin guardarlo y leer los problemas de render | Enviar código, HTML o componentes nuevos |
| Leer esquemas, catálogo, layouts, temas y la guía de autoría | Ver presentaciones de otras cuentas |

Cada versión enviada aparece como **«Creado por IA externa (MCP)»**.

## Conectar

1. Entra a Lámina → **Conectar con IA** (barra lateral, `/conectar`). Allí está la dirección del servidor (`https://<tu-lámina>/api/mcp`).
2. **Claude Code:** `claude mcp add --transport http lamina https://<tu-lámina>/api/mcp`, luego dentro de Claude Code `/mcp` → *lamina* → *Authenticate*.
   **Claude Desktop / claude.ai:** Ajustes → Conectores → Añadir conector personalizado → pega la dirección.
   **Codex:** `codex mcp add lamina --url https://<tu-lámina>/api/mcp`, luego `codex mcp login lamina` (verifica con `/mcp`).
   **ChatGPT:** activa el modo desarrollador (Configuración → Aplicaciones y conectores → Ajustes avanzados; depende del plan), crea un conector con la dirección y autenticación OAuth, sin ID ni secreto de cliente.
3. Se abre Lámina en tu navegador: inicia sesión (la cuenta debe estar dada de alta) y pulsa **Autorizar**. Verás el nombre de la aplicación (no verificado), a dónde volverá y los permisos.
4. Listo. Para cortar el acceso: **Conectar con IA → Aplicaciones autorizadas → Revocar** (inmediato).

## Herramientas

| Tool | Qué hace |
|---|---|
| `list_presentations` | Tus presentaciones (id, título, etapa, origen, enlace). |
| `get_presentation` | Etapa, versiones vigentes (id y hash para `baseVersionId`), problemas de render, fuentes resumidas y siguiente paso. `includeContent` / `includeDeck` traen el contenido aprobado/vigente y el deck. |
| `create_presentation` | Crea un borrador (tema, nivel, objetivo; opcional materia, período, grupo, `themeId`). Gasta tu cuota diaria de presentaciones nuevas. |
| `submit_content_draft` | Envía el contenido; se valida (esquema, LaTeX, verificación matemática) y queda **en tu revisión**. Devuelve avisos por bloque. |
| `validate_deck` | Valida un deck sin guardar (esquema, catálogo, LaTeX y, con `id`, fidelidad de las fórmulas con el contenido aprobado). |
| `submit_deck` | Envía el diseño (solo con contenido **aprobado por ti**). Lámina lo dibuja; queda en tu revisión de diseño. |
| `get_render_issues` | Problemas por diapositiva (desborde, texto pequeño, KaTeX…) para que la IA corrija y reenvíe (máx. 12 versiones por presentación). |

**Resources:** `lamina://schemas/content-draft`, `lamina://schemas/deck`, `lamina://catalog`, `lamina://layouts`, `lamina://themes`, `lamina://guides/authoring`, `lamina://presentations/{id}`.

Reglas útiles: los `submit_*` piden `baseVersionId` (la versión vigente que leyó; `null` si no hay) y devuelven `stale_version` si algo cambió; reenviar lo mismo es idempotente. La marca (logos, docente, materia, período, grupo) la pone Lámina. Las fórmulas del contenido aprobado deben copiarse tal cual en el deck.

## Ejemplos de peticiones

- «Lee la guía de autoría de Lámina y crea una presentación de **Cálculo I** sobre la regla de la cadena para primer ciclo, con un ejemplo resuelto y un resumen. Envía el contenido para mi revisión.»
- «Ya aprobé el contenido de la presentación *La regla de la cadena*. Diséñala con el tema `calculo-editorial`, valídala y envíala; revisa los problemas de render y corrige lo que haga falta.»
- «Lista mis presentaciones que están en revisión y dime qué falta en cada una.»

## Límites y seguridad

- Deck ≤ 60 diapositivas y 1,5 MB; contenido ≤ 400 KB; 60 llamadas por minuto por conexión; cuotas diarias por docente (`mcp_call` 500, `mcp_submit` 40; las ajusta un administrador).
- Todo lo que envía la IA se trata como dato no confiable: se valida con los mismos contratos que el resto de Lámina; no se acepta código ni HTML.
- OAuth 2.1 con PKCE; token de acceso de 10 minutos y refresco de 14 días; los permisos son `presentations:read` y `presentations:write`. Un administrador puede revocar conexiones o **desactivar el MCP** para todos.
- Qué lee la IA lo procesa su proveedor según sus condiciones. Lámina no le envía tus archivos subidos.

Decisión técnica y detalles: [ADR-013](adr/013-mcp.md).
