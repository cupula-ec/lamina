# ADR-006 — Búsqueda e ingesta

**Verificado el 19 oct 2026:** SearXNG (`searxng/searxng`) en Docker devuelve JSON con `format=json`; Tavily ofrece **1000 créditos/mes** gratis (sin tarjeta).

- **Búsqueda:** SearXNG propio (principal) y Tavily (respaldo, clave pendiente). Si ninguno responde, se **dice** («Búsqueda web no disponible») y se avisa en el borrador; nunca se simula.
- **SSRF** (`packages/research/src/ssrf.ts`): solo http(s) en 80/443, sin credenciales, bloqueo de loopback/privadas/link-local/CGNAT/metadata/IPv6 y mapeadas **en el momento de conectar** (lookup propio de undici, a prueba de DNS rebinding), redirecciones manuales (≤ 3, cada salto revalidado), 5 MB, 15 s, lista blanca de `content-type`.
- **Documentos:** PDF (`unpdf`, ≤ 150 páginas; sin texto → OCR local desde v1.2, ver ADR-014; vacío tras el OCR → error claro), DOCX (`mammoth`), TXT/MD; tipo real por *magic bytes*, no por extensión.
- **Texto no confiable:** todo texto externo va delimitado `<<<DATOS_NO_CONFIABLES …>>>` (se neutraliza el delimitador dentro del texto) y el *system prompt* prohíbe obedecerlo.

**Actualización v1.2 (OCR, ADR-014):** los PDF escaneados se leen con Tesseract en el servidor (las imágenes viven en un tmp privado del job y se borran al terminar). Enviar imágenes de páginas con fórmulas a un modelo de visión `:free` requiere un consentimiento **aparte** y opcional (`consent_ocr_vision`, registrado como evento de la presentación); sin él ninguna imagen sale del servidor. De cada página solo se guardan metadatos (`ocr_pages`); el texto reconocido es un fragmento de fuente más y se trata como **no confiable**.
