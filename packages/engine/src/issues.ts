/**
 * Detección de problemas de render. Se ejecuta DENTRO de la página (Playwright) sobre un slide ya pintado en el canvas
 * 1920×1080 sin escala. Devuelve problemas con slot y gravedad.
 *
 * `message` está redactado para el docente; las medidas técnicas van en `detail`. `bbox` está en px del canvas (1920×1080)
 * y permite resaltar el elemento afectado. `ignored` lo fija el docente desde la revisión.
 */
export type SlideIssue = {
  slot: string | null;
  kind: "overflow" | "small_text" | "katex_error" | "empty_slot" | "component_error" | "latex_raw" | "overlap";
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
  col1: "la primera columna", col2: "la segunda columna", col3: "la tercera columna", context: "el contexto", caption: "la leyenda",
  steps: "los pasos", verdict: "la conclusión", side: "el recuadro lateral", aside: "la columna de notas", refs: "las referencias",
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
    : i.kind === "latex_raw" ? `Hay una fórmula sin dibujar (código LaTeX visible) en ${where}.`
    : i.kind === "overlap" ? `${cap(where)} se superpone con otra zona de la diapositiva.`
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
      if (c.closest(".katex-mathml") || c.closest("[clip-path]")) continue; // KaTeX accesible y trazos recortados por clip-path no se ven fuera
      // Interior de una fórmula: struts, \quad, \text y vlists sobresalen por diseño sin verse; solo se mide la fórmula completa.
      const kx = c.closest(".katex");
      if (kx && kx !== c) continue;
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
      // Los sub/superíndices de KaTeX son pequeños por diseño: se mide el tamaño base de la fórmula.
      const fs = parseFloat(getComputedStyle(p.closest(".katex") ?? p).fontSize);
      if (fs < MIN_FONT_PX) small++;
    }
    if (small > 0) issues.push({ slot, kind: "small_text", severity: "warning", message: `Hay texto demasiado pequeño para leerse al proyectar (en ${slotLabel(slot)}).`, detail: `Texto menor de ${MIN_FONT_PX}px.`, element: "texto", bbox: slotBbox });
    // LaTeX sin renderizar: comandos o entornos visibles como texto (fuera de KaTeX).
    const rawWalker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = rawWalker.nextNode(); n; n = rawWalker.nextNode()) {
      const p = n.parentElement;
      if (!p || p.closest(".katex, .katex-error") || p.closest("svg") || p.closest("pre, code")) continue;
      if (/\\(?:begin|end)\{|\\(?:times|cdot|alpha|beta|frac|sqrt|pm|leq|geq|sum|int|lambda|theta|pi)\b/.test(n.textContent ?? "")) {
        issues.push({ slot, kind: "latex_raw", severity: "warning", message: `Hay una fórmula sin dibujar (código LaTeX visible) en ${slotLabel(slot)}.`, detail: `Texto: «${(n.textContent ?? "").trim().slice(0, 80)}»`, element: "una fórmula", bbox: toCanvas(p.getBoundingClientRect()) });
        break;
      }
    }
    if (!el.textContent?.trim() && !el.querySelector("svg, img, canvas, iframe, table")) issues.push({ slot, kind: "empty_slot", severity: "warning", message: `${cap(slotLabel(slot))} está vacío.`, detail: "", element: "área vacía", bbox: slotBbox });
  }
  // Solape entre zonas (p. ej. el título invade el contenido). `full-visual` superpone el título a propósito.
  if (!root.matches(".lm-layout-full-visual") && !root.querySelector(".lm-layout-full-visual")) {
    const live = slots.filter((e) => e.dataset.lmHidden !== "1");
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
      const A = live[a]!, B = live[b]!;
      if (A.contains(B) || B.contains(A)) continue;
      const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
      const ox = (Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)) / scale;
      const oy = (Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)) / scale;
      if (ox > 12 && oy > 12) {
        const slot = A.dataset.lmSlot ?? null;
        issues.push({ slot, kind: "overlap", severity: "warning", message: `${cap(slotLabel(slot))} se superpone con ${slotLabel(B.dataset.lmSlot ?? null)}.`, detail: `Zonas solapadas ${Math.round(ox)}×${Math.round(oy)} px.`, element: "bloque", bbox: toCanvas(ra) });
      }
    }
  }
  return issues;
}
