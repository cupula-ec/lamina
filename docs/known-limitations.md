# Limitaciones conocidas (v1.0)

- **IA gratuita:** calidad variable y límites (20 req/min, 1000/día con ≥ 10 créditos comprados, 50/día sin ellos). Los trabajos pasan a «en espera de cupo» y se reanudan solos.
- **Sin OCR:** los PDF escaneados no se procesan (error claro). Máx. 150 páginas y 20 MB por archivo.
- **Verificación matemática parcial:** se comprueban igualdades y derivadas con varias variables escalares y matrices (producto, suma, transpuesta, inversa, determinante, traza; matrices simbólicas con dimensión 2×2 y 3×3 o la de los literales). Límites, integrales, sumatorias y relaciones que no son identidades (ecuaciones por resolver) se marcan «no verificable» y el docente las aprueba o corrige una a una.
- **Reparación automática acotada:** hasta 2 intentos por diapositiva; si el modelo no logra arreglar un desborde, queda marcado como pendiente. La edición manual cubre texto/props, posición, tamaño y escala; no hay carga de imágenes propias.
- **Sandbox compartiendo host** con otros servicios (mitigado con gVisor); se recomienda host dedicado para instituciones.
- **Un solo idioma de interfaz (español)** y un solo tema de slides claro/oscuro; sin exportación a PDF/PowerPoint.
- **PR automáticos de componentes** requieren `GITHUB_TOKEN` en el servidor.
- **Backups** de Postgres y del volumen de datos: ver infra (pendiente de cron en la v1.0).
