import { THEMES, isThemeId } from "@lamina/contracts";

/** Nombre CSS de cada familia autoalojada (@fontsource). */
const CSS_FAMILY: Record<string, string> = {
  Literata: "Literata Variable",
  Fraunces: "Fraunces Variable",
  "Space Grotesk": "Space Grotesk Variable",
  "Atkinson Hyperlegible": "Atkinson Hyperlegible",
  "IBM Plex Sans": "IBM Plex Sans",
};

export function themeFontFamilies(themeId: string): string[] {
  const t = isThemeId(themeId) ? THEMES[themeId] : THEMES["lamina-claro"];
  return [...new Set([t.fonts.display, t.fonts.body])].map((f) => CSS_FAMILY[f] ?? f);
}

/** Espera a que las fuentes del tema (y las de KaTeX en uso) estén cargadas: así capturas y renderer miden con la tipografía final. */
export async function waitForThemeFonts(themeId: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const loads = themeFontFamilies(themeId).flatMap((f) => ["400", "500", "600", "700", "italic 400"].map((w) => document.fonts.load(`${w} 1em "${f}"`).catch(() => [])));
  await Promise.all(loads);
  await document.fonts.ready;
}
