# ADR-009 — Verificación matemática determinista

El modelo no es fuente de verdad. `packages/validation`:
1. **LaTeX**: `katex.renderToString(throwOnError)`; un error obliga a reparar.
2. **Expresiones** (gráficas): mathjs con lista blanca de AST (sin `import`, `evaluate`, asignaciones, accesos…).
3. **Igualdades y derivadas**: se convierte un subconjunto de LaTeX a mathjs y se comprueba **numéricamente por muestreo** (≥ 3 puntos válidos, tolerancia relativa 1e-6); las derivadas se calculan simbólicamente con mathjs (`f'(x)`, `\frac{d}{dx}`) y se comparan con el lado derecho. Discrepancia → aviso «Posible error matemático».
4. Lo no verificable (límites, integrales…) se marca **«no se pudo verificar»**: nunca se da por correcto en silencio.
5. En diseño, un chequeo de **fidelidad**: toda fórmula/expresión del contenido aprobado debe aparecer literalmente en la diapositiva (`mustKeep/missingFormulas`).
