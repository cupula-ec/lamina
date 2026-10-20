/**
 * Detección de problemas de render. Se ejecuta DENTRO de la página (Playwright) sobre un slide ya pintado en el canvas
 * 1920×1080 sin escala. Devuelve problemas con slot y gravedad.
 */
export type SlideIssue = {
  slot: string | null;
  kind: "overflow" | "small_text" | "katex_error" | "empty_slot" | "component_error";
  severity: "error" | "warning";
  message: string;
};

export const MIN_FONT_PX = 26;

export function detectSlideIssues(root: HTMLElement): SlideIssue[] {
  const issues: SlideIssue[] = [];
  const slots = Array.from(root.querySelectorAll<HTMLElement>("[data-lm-slot]"));
  for (const el of slots) {
    const slot = el.dataset.lmSlot ?? null;
    if (el.dataset.lmHidden === "1") continue;
    const err = el.querySelector<HTMLElement>("[data-lamina-error]");
    if (err) {
      issues.push({ slot, kind: "component_error", severity: "error", message: `Componente con error (${err.dataset.laminaError}): ${(err.textContent ?? "").slice(0, 120)}` });
      continue;
    }
    if (el.scrollHeight > el.clientHeight + 4 || el.scrollWidth > el.clientWidth + 4)
      issues.push({ slot, kind: "overflow", severity: "error", message: `El contenido desborda el área (${el.scrollWidth}×${el.scrollHeight} > ${el.clientWidth}×${el.clientHeight})` });
    // Elementos internos que sobresalen del slot
    const box = el.getBoundingClientRect();
    const scale = root.getBoundingClientRect().width / 1920 || 1;
    for (const c of Array.from(el.querySelectorAll<HTMLElement>("*")).slice(0, 800)) {
      if (c.closest(".katex-mathml")) continue;
      const r = c.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > box.right + 6 * scale || r.bottom > box.bottom + 6 * scale || r.left < box.left - 6 * scale) {
        issues.push({ slot, kind: "overflow", severity: "error", message: "Un elemento sobresale del área del slot" });
        break;
      }
    }
    if (el.querySelector(".katex-error")) issues.push({ slot, kind: "katex_error", severity: "error", message: "Fórmula LaTeX con error de render" });
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
    if (small > 0) issues.push({ slot, kind: "small_text", severity: "warning", message: `Texto menor de ${MIN_FONT_PX}px (ilegible en proyector)` });
    if (!el.textContent?.trim() && !el.querySelector("svg, img, canvas, iframe, table")) issues.push({ slot, kind: "empty_slot", severity: "warning", message: "El slot está vacío" });
  }
  return issues;
}
