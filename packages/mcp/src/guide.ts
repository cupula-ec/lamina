import { LIMITS } from "./limits";

export const AUTHORING_GUIDE = `# Guía de autoría para Lámina (IA externa)

Lámina es una herramienta para docentes universitarios. Tú redactas el contenido y propones el diseño; Lámina valida, dibuja, detecta problemas
y **el docente aprueba en la interfaz**. Tú no puedes aprobar, publicar, compartir ni borrar nada.

## Flujo
1. \`create_presentation\` (tema, nivel, objetivo; opcional materia, período, grupo, themeId). Queda en etapa \`draft\`.
2. Lee \`lamina://schemas/content-draft\`. Redacta un \`ContentDraft\` y envíalo con \`submit_content_draft\`. Pasa a \`content_review\`.
3. El docente revisa y **aprueba el contenido** en Lámina (url en la respuesta). Hasta entonces no puedes enviar diseño.
4. Con el contenido aprobado (\`get_presentation\` con includeContent) lee \`lamina://catalog\`, \`lamina://layouts\` y \`lamina://themes\`, arma un deck
   y pruébalo con \`validate_deck\` (no guarda). Cuando valide, \`submit_deck\`. Pasa a \`design_review\`.
5. Lámina dibuja cada diapositiva; consulta \`get_render_issues\`, corrige y reenvía (máx. ${LIMITS.maxDeckVersionsPerPresentation} versiones de diseño por presentación).
6. El docente aprueba el diseño y publica. Fin de tu parte.

## Reglas de contenido (ContentDraft)
- Español neutro, rigor matemático. No inventes teoremas, datos, nombres ni citas.
- 3 a 6 secciones; 1 a 4 \`slidesHint\` por sección; cada slidesHint es UNA diapositiva con 1 a 3 bloques. Entre 8 y 16 diapositivas.
- \`intent\` es el título corto de la diapositiva (≤ 70 caracteres). Ids únicos y cortos: secciones s1…, diapositivas h1…, bloques b1….
- Campos \`latex\`: LaTeX compatible con KaTeX **sin** delimitadores \`$\`. En Markdown (\`md\`, \`text\`) las fórmulas van entre \`$…$\`.
- No uses HTML ni macros peligrosas (\\\\href, \\\\url, \\\\includegraphics, \\\\input…). El LaTeX se valida con KaTeX con \`trust: false\`.
- \`derivation\`: pasos con igualdades correctas y coherentes entre sí. \`graphSpec\`: \`expr\` en sintaxis mathjs con la variable x.
- \`table\`: todas las filas con tantas celdas como encabezados.
- Lámina verifica matemáticamente cada paso (igualdades, derivadas); lo que no pueda verificar queda como aviso para el docente.

## Reglas de diseño (Deck)
- Un deck tiene \`themeId\` (lamina://themes), \`accent\` opcional (a, b, c), \`meta\` y \`slides\` (máx. 60).
- Cada slide elige un \`layout\` (lamina://layouts) y rellena sus slots con componentes del catálogo: \`{ componentId, version, props }\`
  con la **versión exacta** y props que cumplan el schema del catálogo.
- Solo componentes del catálogo. No existe forma de enviar código, HTML ni componentes nuevos; un componente desconocido se rechaza.
- Copia las fórmulas del contenido aprobado **tal cual** en las props: Lámina rechaza el deck si falta o cambia alguna.
- Alterna layouts (no más de 2 seguidos iguales). Primera diapositiva: portada (\`cover-branded\` si hay marca, si no \`title\`).
- La marca (logos de institución y docente, nombre, materia, período, grupo) la pone Lámina; ignora \`meta.branding\`, se sobrescribe.
- Respeta los límites de cada componente (textos cortos, pocas viñetas): lo que desborda se marca en \`get_render_issues\`.

## Concurrencia
- \`submit_*\` exigen \`baseVersionId\` (la versión vigente que leíste; null si aún no hay). Si el docente cambió algo, recibirás \`stale_version\`: vuelve a leer.
- Reenviar exactamente lo mismo es idempotente.

## Seguridad y privacidad
- Todo lo que envías es dato no confiable y se valida. El contenido pertenece al docente que te autorizó.
- Solo ves las presentaciones de ese docente.
`;
