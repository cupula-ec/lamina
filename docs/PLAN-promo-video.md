# Plan: video de presentación de Lámina

## Decisiones (Esteban)
- Formato: un solo video 16:9; 30 s si el guion cabe, si no 60 s. Sin recorte vertical.
- Cierre: «Planes para docentes: próximamente» (sin precios). Cambiar también el copy «Gratis» del landing si se publica así.
- Motor: Remotion + `@remotion/three`, reutilizando `@lamina/engine` (slides reales). Verificar licencia gratuita de Remotion para Cúpula.
- Sin voz: texto animado + música libre de regalías (el video debe leerse sin sonido).
- Pendientes (por defecto la recomendación): tono cálido-profesional, solo español, logos de IAs solo como texto, 3D puntual sobre base editorial 2D, `apps/promo` excluido de CI, datos demo ficticios, 1080p30.

## Concepto
«De la hoja en blanco a la clase lista, y tú decides». Hoja milimetrada 3D (Three.js): la pluma escribe el tema, la fórmula KaTeX se arma y se marca «verificada», una gráfica se traza con su tangente, la hoja se proyecta en diapositivas de varios temas, dos sellos «Apruebas el contenido / el diseño», conexión MCP, cierre.

## Guion tentativo 60 s (para 30 s: fusionar 1-3, 4-6 y 7-8)
1. 0–5 «Preparar una clase de Cálculo puede costarte el fin de semana.»
2. 5–11 Fórmula errónea tachada: «La IA genérica inventa fórmulas y fuentes.»
3. 11–15 «Lámina. Tu clase, con fórmulas y gráficas, lista para proyectar.»
4. 15–23 Tema + PDF; cada dato conectado a su fuente.
5. 23–31 Derivación paso a paso, check verde; lo no verificable se marca en ámbar.
6. 31–36 Sello «Apruebas el contenido».
7. 36–44 Gráfica calculada y rotación entre 4 temas.
8. 44–49 Sello «Apruebas el diseño» + modo presentador.
9. 49–54 Claude / ChatGPT / Codex por MCP; «la IA no publica».
10. 54–60 Cierre: «Hecho en Ecuador · Planes para docentes: próximamente» + URL.
(Todo texto en pantalla; sin voz.)

## Estilo
Paleta y tipografías de `apps/web/src/app/globals.css` (Literata + Atkinson; papel `#fbfcf8`, tinta `#101b2b`, azul `#1b4f9c`, marcador `#ffe27a`, pluma `#c0301c`). Motion editorial: trazos que se dibujan, resaltador que barre, sombras duras que caen; sin neón de «IA».

## Producción
- `apps/promo/` (Remotion), tokens y fuentes del repo, `delayRender` hasta `document.fonts.ready`.
- Capturas con Playwright (1920×1080, `deviceScaleFactor: 2`) sobre cuenta/deck demo.
- Render: Remotion → PNG (`--concurrency=2`, evitar OOM) → ffmpeg `hevc_nvenc`/`h264_nvenc` `-preset p7 -tune hq -multipass fullres -spatial-aq 1 -temporal-aq 1`.
- QA: `ffprobe`, revisión frame a frame, contrastar cada afirmación con README y `docs/known-limitations.md` (no prometer exportación PDF/PPT, «sin errores», ni «gratis para siempre»).

## Estado (2026-10-23)
- Hecho en `apps/promo` (Remotion 4). Render: `pnpm --filter @lamina/promo promo:render` → `apps/promo/out/lamina-promo-sb.mp4` (1080p30, 60 s, H.264 BT.709 + AAC −14 LUFS).
- Música: «Starboy» (The Weeknd ft. Daft Punk, versión limpia), tramo 1:47,70–2:47,70; el golpe del coro cae en la revelación (11 s) y el cierre en el puente. Descartadas: «Can't Hold Us», «On Top of the World», «Midnight City», «Intro» (The xx). Los eventos se diseñan en pulsos nominales y `B(k)` los ajusta al tempo real de la pista (`src/timeline.ts`). El audio no se versiona (`.gitignore`).
- Carrusel de temas con CSS 3D sobre diapositivas reales del motor (no texturas Three); Three solo en la pila de hojas de la escena 1.
- Decidido (Esteban): se mantienen «Planes para docentes: próximamente» y «Conéctala con tu IA favorita» con Claude/ChatGPT/Codex.
- SFX (72 cues, estilo tráiler): Mixkit, licencia libre, sin versionar (`tools/fetch-sfx.sh` los descarga). Los cues viven en `apps/promo/src/sfx.ts` con los mismos `B(k)` de las escenas; `tools/sfx-bed.py` normaliza cada efecto por pico (−6 dBFS) y arma la pista, y `render.sh` la mezcla a −4 dB (−15 LUFS, pico −3,5 dBFS, el limitador no actúa). `SKIP_FRAMES=1 ./render.sh` rehace solo el audio; `SFX_DB=n` fija el nivel de los efectos (por defecto −4).
