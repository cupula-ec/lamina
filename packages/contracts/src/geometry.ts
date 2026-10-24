export const CANVAS = { width: 1920, height: 1080 } as const;
export type Box = { x: number; y: number; w: number; h: number };

const PAD = 96;
const TITLE_H = 150;
const BODY_Y = 250;
const BODY_H = CANVAS.height - BODY_Y - 72;

/** Rectángulos (px del canvas) de cada slot por layout: el engine, el validador y el sandbox los comparten. */
export const SLOT_GEOMETRY: Record<string, Record<string, Box>> = {
  title: { main: { x: PAD, y: 180, w: 1728, h: 720 } },
  section: { main: { x: PAD, y: 300, w: 1728, h: 480 } },
  "title-content": {
    title: { x: PAD, y: 64, w: 1728, h: TITLE_H },
    main: { x: PAD, y: BODY_Y, w: 1728, h: BODY_H },
  },
  "two-column": {
    title: { x: PAD, y: 64, w: 1728, h: TITLE_H },
    left: { x: PAD, y: BODY_Y, w: 828, h: BODY_H },
    right: { x: PAD + 900, y: BODY_Y, w: 828, h: BODY_H },
  },
  "split-visual": {
    title: { x: PAD, y: 64, w: 1728, h: TITLE_H },
    text: { x: PAD, y: BODY_Y, w: 680, h: BODY_H },
    visual: { x: PAD + 740, y: BODY_Y, w: 988, h: BODY_H },
  },
  "formula-focus": {
    title: { x: PAD, y: 64, w: 1728, h: TITLE_H },
    main: { x: PAD, y: BODY_Y, w: 1728, h: 520 },
    note: { x: PAD, y: BODY_Y + 560, w: 1728, h: BODY_H - 560 },
  },
  "cover-branded": { main: { x: PAD, y: 230, w: 1728, h: 600 } },
  "hero-formula": {
    title: { x: PAD, y: 64, w: 1728, h: 120 },
    main: { x: PAD, y: 210, w: 1728, h: 560 },
    context: { x: PAD, y: 800, w: 1728, h: BODY_Y + BODY_H - 800 },
  },
  "full-visual": {
    visual: { x: 0, y: 0, w: CANVAS.width, h: CANVAS.height },
    title: { x: PAD, y: 56, w: 1100, h: 140 },
    caption: { x: PAD, y: 920, w: 1728, h: 112 },
  },
  "three-column": {
    title: { x: PAD, y: 64, w: 1728, h: TITLE_H },
    col1: { x: PAD, y: BODY_Y, w: 552, h: BODY_H },
    col2: { x: PAD + 588, y: BODY_Y, w: 552, h: BODY_H },
    col3: { x: PAD + 1176, y: BODY_Y, w: 552, h: BODY_H },
  },
  "steps-timeline": {
    title: { x: PAD, y: 64, w: 1728, h: TITLE_H },
    steps: { x: PAD, y: BODY_Y, w: 1728, h: 520 },
    note: { x: PAD, y: BODY_Y + 550, w: 1728, h: BODY_H - 550 },
  },
  comparison: {
    title: { x: PAD, y: 64, w: 1728, h: TITLE_H },
    main: { x: PAD, y: BODY_Y, w: 1728, h: 590 },
    verdict: { x: PAD, y: BODY_Y + 620, w: 1728, h: BODY_H - 620 },
  },
  "big-number": {
    title: { x: PAD, y: 64, w: 1728, h: TITLE_H },
    main: { x: PAD, y: BODY_Y, w: 820, h: BODY_H },
    text: { x: PAD + 884, y: BODY_Y, w: 844, h: BODY_H },
  },
  "quote-source": {
    main: { x: 192, y: 190, w: 1536, h: 560 },
    note: { x: 192, y: 780, w: 1536, h: 230 },
  },
  agenda: {
    title: { x: PAD, y: 64, w: 1728, h: TITLE_H },
    main: { x: PAD, y: BODY_Y, w: 1120, h: BODY_H },
    side: { x: PAD + 1184, y: BODY_Y, w: 544, h: BODY_H },
  },
  closing: {
    title: { x: PAD, y: 64, w: 1728, h: TITLE_H },
    main: { x: PAD, y: BODY_Y, w: 1100, h: 700 },
    refs: { x: PAD + 1164, y: BODY_Y, w: 564, h: 700 },
  },
  "sidebar-notes": {
    title: { x: PAD, y: 64, w: 1728, h: TITLE_H },
    main: { x: PAD, y: BODY_Y, w: 1236, h: BODY_H },
    aside: { x: PAD + 1308, y: BODY_Y, w: 420, h: BODY_H },
  },
};

export function slotBox(layout: string, slot: string): Box {
  const b = SLOT_GEOMETRY[layout]?.[slot];
  if (!b) throw new Error(`slot desconocido: ${layout}/${slot}`);
  return b;
}

/** Ajuste del docente sobre un slot: caja propia (px del canvas) y/o escala del contenido. Lo no indicado conserva el valor del layout. */
export type SlotFrame = Partial<Box> & { fontScale?: number };

/** Caja efectiva de un slot: la del layout con el ajuste del docente aplicado (siempre dentro del canvas). */
export function adjustedBox(layout: string, slot: string, adj?: SlotFrame): Box {
  const b = slotBox(layout, slot);
  if (!adj) return b;
  const w = Math.max(160, Math.min(adj.w ?? b.w, CANVAS.width)), h = Math.max(120, Math.min(adj.h ?? b.h, CANVAS.height));
  return { x: Math.max(0, Math.min(adj.x ?? b.x, CANVAS.width - w)), y: Math.max(0, Math.min(adj.y ?? b.y, CANVAS.height - h)), w, h };
}

/* ───── Zona reservada del logo persistente (V3 §5.7) ───── */
export type LogoZone = { corner: "tl" | "tr" | "bl" | "br"; count: number; height: number; width: number };
const LOGO_H = { s: 48, m: 64 } as const;
const LOGO_W = 200;
const LOGO_GAP = 16;

/** Zona del logo en diapositivas interiores. null = sin logo (sin spec, esquina «none» o ningún logo disponible). */
export function logoZone(logo: { corner: string; which?: string; size?: string } | undefined, avail: { institution: boolean; personal: boolean }): LogoZone | null {
  if (!logo || logo.corner === "none") return null;
  const which = logo.which ?? "both";
  const count = (which !== "personal" && avail.institution ? 1 : 0) + (which !== "institution" && avail.personal ? 1 : 0);
  if (!count) return null;
  const height = LOGO_H[(logo.size as "s" | "m") ?? "s"] ?? LOGO_H.s;
  return { corner: logo.corner as LogoZone["corner"], count, height, width: count * LOGO_W + (count - 1) * LOGO_GAP };
}

/** Los logos de esquina SUPERIOR le quitan ancho al título (el resto del contenido no se toca; abajo la banda del pie está libre). */
export function withLogoZone(box: Box, slot: string, zone: LogoZone | null): Box {
  if (!zone || slot !== "title" || (zone.corner !== "tl" && zone.corner !== "tr")) return box;
  const reserve = zone.width + 32;
  if (box.w - reserve < 400) return box;
  return zone.corner === "tr" ? { ...box, w: box.w - reserve } : { ...box, x: box.x + reserve, w: box.w - reserve };
}
