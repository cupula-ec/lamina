/** Fuente de verdad de los temas visuales: la consumen el engine (CSS), la IA (prompt) y la UI (galería). */
export type ThemeSpec = {
  id: string;
  name: string;
  /** Área/materia a la que mejor encaja. */
  area: string;
  mode: "light" | "dark";
  description: string;
  fonts: { display: string; body: string };
  /** Etiquetas de las 3 variantes de acento (a, b, c). */
  accents: readonly [string, string, string];
};

export const THEMES = {
  "lamina-claro": {
    id: "lamina-claro",
    name: "Lámina claro",
    area: "general",
    mode: "light",
    description: "Papel claro, serif de lectura; el tema base.",
    fonts: { display: "Literata", body: "Atkinson Hyperlegible" },
    accents: ["Ámbar", "Azul", "Verde"],
  },
  "lamina-oscuro": {
    id: "lamina-oscuro",
    name: "Lámina oscuro",
    area: "general",
    mode: "dark",
    description: "Fondo oscuro de alto contraste para salas con poca luz.",
    fonts: { display: "Literata", body: "Atkinson Hyperlegible" },
    accents: ["Ámbar", "Azul", "Verde"],
  },
} as const satisfies Record<string, ThemeSpec>;

export type ThemeId = keyof typeof THEMES;
export const THEME_IDS = Object.keys(THEMES) as [ThemeId, ...ThemeId[]];
export const DEFAULT_THEME_ID: ThemeId = "lamina-claro";
export const ACCENT_IDS = ["a", "b", "c"] as const;
export type AccentId = (typeof ACCENT_IDS)[number];

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && Object.hasOwn(THEMES, v);
}
