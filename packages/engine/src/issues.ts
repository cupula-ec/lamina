/**
 * Detección de problemas de render. Se ejecuta DENTRO de la página (Playwright) sobre un slide ya pintado en el canvas
 * 1920×1080 sin escala. Devuelve problemas con slot y gravedad.
 *
 * `message` está redactado para el docente; las medidas técnicas van en `detail`. `bbox` está en px del canvas (1920×1080)
 * y permite resaltar el elemento afectado. `ignored` lo fija el docente desde la revisión.
 */
export type SlideIssue = {
  slot: string | null;
  kind: "overflow" | "small_text" | "katex_error" | "empty_slot" | "component_error";
  severity: "error" | "warning";
  message: string;
  detail?: string;
  element?: string;
  bbox?: { x: number; y: number; w: number; h: number };
  ignored?: boolean;
};

const SLOT_LABEL: Record<string, string> = {
  title: "el título", main: "el contenido principal", left: "la columna izquierda", right: "la columna derecha",
  text: "el texto", visual: "el recurso visual", note: "la nota",
};
export const slotLabel = (slot: string | null) => (slot ? SLOT_LABEL[slot] ?? `el área «${slot}»` : "la diapositiva");
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Texto para el docente de cualquier issue, incluidos los guardados antes de que existiera `detail` (mensaje técnico). */
export function describeIssue(i: SlideIssue): { text: string; detail?: string } {
  if (i.detail !== undefined) return { text: i.message, detail: i.detail || undefined };
  const where = slotLabel(i.slot);
  const text = i.kind === "overflow" ? `El contenido de ${where} no cabe y se corta.`
    : i.kind === "small_text" ? `Hay texto demasiado pequeño para leerse al proyectar (en ${where}).`
    : i.kind === "katex_error" ? `Una fórmula de ${where} no se pudo dibujar.`
    : i.kind === "empty_slot" ? `${cap(where)} está vacío.`
    : `Un componente de ${where} falló al mostrarse.`;
  return { text, detail: i.message };
}

export const MIN_FONT_PX = 26;

function elementLabel(n: Element): string {
  if (n.closest(".mtable") || n.querySelector(".mtable")) return "la matriz";
  if (n.closest(".katex") || n.querySelector(".katex")) return "una fórmula";
  if (n.closest("table") || n.querySelector("table")) return "la tabla";
  if (n.closest("svg") || n.querySelector("svg")) return "la gráfica";
  return "un bloque de texto";
}

export function detectSlideIssues(root: HTMLElement): SlideIssue[] {
  const issues: SlideIssue[] = [];
  const slots = Array.from(root.querySelectorAll<HTMLElement>("[data-lm-slot]"));
  const rootBox = root.getBoundingClientRect();
  const scale = rootBox.width / 1920 || 1;
  const toCanvas = (r: DOMRect) => ({ x: Math.round((r.left - rootBox.left) / scale), y: Math.round((r.top - rootBox.top) / scale), w: Math.round(r.width / scale), h: Math.round(r.height / scale) });
  for (const el of slots) {
    const slot = el.dataset.lmSlot ?? null;
    if (el.dataset.lmHidden === "1") continue;
    const box = el.getBoundingClientRect();
    const slotBbox = toCanvas(box);
    const err = el.querySelector<HTMLElement>("[data-lamina-error]");
    if (err) {
      issues.push({ slot, kind: "component_error", severity: "error", message: `Un componente de ${slotLabel(slot)} falló al mostrarse.`, detail: `Componente con error (${err.dataset.laminaError}): ${(err.textContent ?? "").slice(0, 120)}`, element: "un componente", bbox: slotBbox });
      continue;
    }
    // Desborde: un único issue por slot (scroll del slot + elementos internos que sobresalen).
    const scrolled = el.scrollHeight > el.clientHeight + 4 || el.scrollWidth > el.clientWidth + 4;
    let worst: { c: HTMLElement; over: number } | null = null;
    const dirs = new Set<string>();
    for (const c of Array.from(el.querySelectorAll<HTMLElement>("*")).slice(0, 800)) {
      if (c.closest(".katex-mathml")) continue;
      const r = c.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const tol = 6 * scale;
      const right = r.right - box.right, bottom = r.bottom - box.bottom, left = box.left - r.left;
      if (right > tol) dirs.add("derecha");
      if (bottom > tol) dirs.add("abajo");
      if (left > tol) dirs.add("izquierda");
      const over = Math.max(right, bottom, left);
      if (over > tol && (!worst || over > worst.over)) worst = { c, over };
    }
    if (scrolled || worst) {
      if (!dirs.size) dirs.add(el.scrollHeight > el.clientHeight + 4 ? "abajo" : "derecha");
      const element = worst ? elementLabel(worst.c) : elementLabel(el);
      const side = [...dirs].map((d) => (d === "abajo" ? "abajo" : `la ${d}`)).join(" y ");
      issues.push({
        slot, kind: "overflow", severity: "error",
        message: `${cap(element)} de ${slotLabel(slot)} se sale de la diapositiva por ${side}.`,
        detail: `El contenido mide ${el.scrollWidth}×${el.scrollHeight} y el área disponible es ${el.clientWidth}×${el.clientHeight}.`,
        element,
        bbox: worst ? toCanvas(worst.c.getBoundingClientRect()) : slotBbox,
      });
    }
    if (el.querySelector(".katex-error")) issues.push({ slot, kind: "katex_error", severity: "error", message: `Una fórmula de ${slotLabel(slot)} no se pudo dibujar.`, detail: "Error de render de KaTeX.", element: "una fórmula", bbox: slotBbox });
    // Texto demasiado pequeño
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let small = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent ?? "").trim();
      const p = n.parentElement;
      if (!t || !p || p.closest(".katex-mathml") || p.closest("svg") || p.closest("[data-lm-allow-small]")) continue;
      const fs = parseFloat(getComputedStyle(p).fontSize);
      if (fs < MIN_FONT_PX) small++;
    }
    if (small > 0) issues.push({ slot, kind: "small_text", severity: "warning", message: `Hay texto demasiado pequeño para leerse al proyectar (en ${slotLabel(slot)}).`, detail: `Texto menor de ${MIN_FONT_PX}px.`, element: "texto", bbox: slotBbox });
    if (!el.textContent?.trim() && !el.querySelector("svg, img, canvas, iframe, table")) issues.push({ slot, kind: "empty_slot", severity: "warning", message: `${cap(slotLabel(slot))} está vacío.`, detail: "", element: "área vacía", bbox: slotBbox });
  }
  return issues;
}
