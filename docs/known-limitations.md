# Limitaciones conocidas (v1.0)

- **IA gratuita:** calidad variable y límites (20 req/min, 1000/día con ≥ 10 créditos comprados, 50/día sin ellos). Los trabajos pasan a «en espera de cupo» y se reanudan solos.
- **Sin OCR:** los PDF escaneados no se procesan (error claro). Máx. 150 páginas y 20 MB por archivo.
- **Verificación matemática parcial:** se comprueban igualdades y derivadas expresables en una sola variable `x`; límites, integrales y expresiones multivariable se marcan «no verificable».
- **Sandbox compartiendo host** con otros servicios (mitigado con gVisor); se recomienda host dedicado para instituciones.
- **Un solo idioma de interfaz (español)** y un solo tema de slides claro/oscuro; sin exportación a PDF/PowerPoint.
- **PR automáticos de componentes** requieren `GITHUB_TOKEN` en el servidor.
- **Backups** de Postgres y del volumen de datos: ver infra (pendiente de cron en la v1.0).
