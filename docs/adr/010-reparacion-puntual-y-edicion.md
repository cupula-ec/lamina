# ADR-010 — Reparación puntual de diapositivas y edición posterior

**Estado:** aceptada (auditoría QA del 20 de octubre)

**Contexto.** El renderer detectaba desbordes y otros problemas, pero nada los corregía: el pulido (ADR-005) solo puede tocar `build`/`transition`/`stepwise`, no recibía los problemas y su versión no se volvía a renderizar. El docente aprobaba diseños con errores conocidos y tampoco podía retocar una diapositiva después de aprobar.

**Decisión.**
1. **Reparación puntual antes de la revisión.** `design.generate` guarda un borrador y la etapa sigue en `designing`. Encola `render` (`then: "repair"`); al terminar, el renderer decide: si quedan errores no ignorados y hay intentos (máx. 2), encola `design.repair`; si no, `designFinish` pasa a `design_review`.
2. **Contexto aislado por diapositiva.** `design.repair` (worker) llama a la IA una vez por diapositiva con error, enviando solo esa diapositiva, sus problemas (texto claro + medidas), las medidas de los layouts y las fórmulas que deben conservarse; nunca el deck completo. La salida se valida con el catálogo y con la fidelidad matemática (`missingFormulas`). Crea una versión `kind: "repair"` (autor IA), copia capturas y problemas de las diapositivas intactas y solo re-renderiza las corregidas.
3. **Nunca bloquea.** Cualquier fallo, falta de cupo o render caído cierra el diseño con los problemas marcados como pendientes. No consume cuota del docente (sí el presupuesto global de IA). «Corregir errores» (botón principal si hay errores) reutiliza el mismo trabajo; «Aprobar de todos modos» pide confirmación.
4. **El pulido sigue sin cambiar contenido** (ADR-005) pero ahora su versión se re-renderiza y re-detecta (`final_review` muestra los problemas reales).
5. **Problemas legibles.** `SlideIssue` guarda `message` para el docente, `detail` técnico, `element`, `bbox` (px del canvas, para resaltar) y `ignored`. El contador global cuenta diapositivas afectadas; cada miniatura muestra errores y avisos.
6. **Edición posterior** (`design_review`, `final_review`, `private_final`, `published`): `saveEditedDeck` crea una versión `kind: "edit"` (autor docente) descendiente de la cabecera. En diseño pasa a ser la vigente; en las demás, la final. Lo publicado no cambia hasta `publishChanges` (mismo enlace y visibilidad; registra una aprobación `final`). El editor edita las props del componente (validadas contra su esquema real) y, en diseño, `Slide.adjust` por slot: posición, tamaño y escala del contenido (acotados al lienzo).

**Consecuencias.** El tiempo hasta `design_review` sube (render + 0–2 reparaciones). La reparación depende de la calidad del modelo gratuito: lo que no se arregla queda visible, no oculto. `reopenDesign` desde `final_review` descarta las ediciones hechas sobre la versión final (siguen en el historial).
