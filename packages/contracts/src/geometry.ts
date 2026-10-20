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
