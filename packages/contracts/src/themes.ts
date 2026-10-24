import type { AreaId } from "./areas";

/** Fuente de verdad de los temas visuales: la consumen el engine (CSS), la IA (prompt) y la UI (galería). */
export type ThemeSpec = {
  id: string;
  name: string;
  /** Área/materia a la que mejor encaja. */
  area: string;
  mode: "light" | "dark";
  /** Tono visual en pocas palabras (lo lee la IA al proponer estilo). */
  mood: string;
  description: string;
  fonts: { display: string; body: string };
  /** Etiquetas de las 3 variantes de acento (a, b, c). */
  accents: readonly [string, string, string];
  /** Tema de V3: solo se propone/ofrece a la IA con el flag de áreas (la galería manual sí lo muestra). */
  v3?: boolean;
  /** Áreas de conocimiento a las que encaja (V3). */
  areas?: readonly AreaId[];
};

export const THEMES = {
  "lamina-claro": {
    id: "lamina-claro",
    name: "Lámina claro",
    area: "general",
    mode: "light",
    mood: "neutro, limpio, de lectura cómoda",
    description: "Papel claro, serif de lectura; el tema base.",
    fonts: { display: "Literata", body: "Atkinson Hyperlegible" },
    accents: ["Azul", "Ámbar", "Verde"],
  },
  "lamina-oscuro": {
    id: "lamina-oscuro",
    name: "Lámina oscuro",
    area: "general",
    mode: "dark",
    mood: "sobrio, de alto contraste, para salas con poca luz",
    description: "Fondo oscuro de alto contraste para salas con poca luz.",
    fonts: { display: "Literata", body: "Atkinson Hyperlegible" },
    accents: ["Azul", "Ámbar", "Verde"],
  },
  "calculo-editorial": {
    id: "calculo-editorial",
    name: "Cálculo editorial",
    area: "cálculo y análisis",
    mode: "light",
    mood: "editorial, cálido, de libro de texto clásico",
    description: "Papel cálido, serif de display, filetes finos y familias de curvas con notación al margen.",
    fonts: { display: "Fraunces", body: "Atkinson Hyperlegible" },
    accents: ["Granate", "Azul tinta", "Verde bosque"],
  },
  "algebra-grafito": {
    id: "algebra-grafito",
    name: "Álgebra grafito",
    area: "álgebra, álgebra lineal y matemática discreta",
    mode: "dark",
    mood: "técnico, preciso, de cuaderno de ingeniería",
    description: "Gris grafito con acento ámbar y rejilla técnica de ejes.",
    fonts: { display: "Space Grotesk", body: "IBM Plex Sans" },
    accents: ["Ámbar", "Turquesa", "Coral"],
  },
  "fisica-aurora": {
    id: "fisica-aurora",
    name: "Física aurora",
    area: "física y ondas",
    mode: "dark",
    mood: "profundo, energético, de laboratorio nocturno",
    description: "Azul profundo y teal con líneas de campo y ondas.",
    fonts: { display: "Space Grotesk", body: "Atkinson Hyperlegible" },
    accents: ["Teal", "Azul hielo", "Violeta"],
  },
  "geometria-compas": {
    id: "geometria-compas",
    name: "Geometría compás",
    area: "geometría y trigonometría",
    mode: "light",
    mood: "clásico, euclidiano, de regla y compás",
    description: "Crema y azul marino con trazos de compás y construcciones.",
    fonts: { display: "Literata", body: "IBM Plex Sans" },
    accents: ["Azul marino", "Burdeos", "Verde azulado"],
  },
  "estadistica-datos": {
    id: "estadistica-datos",
    name: "Estadística datos",
    area: "estadística, probabilidad y ciencia de datos",
    mode: "light",
    mood: "limpio, analítico, con paleta apta para daltonismo",
    description: "Fondo blanco y paleta categórica segura para daltonismo con puntos de datos.",
    fonts: { display: "IBM Plex Sans", body: "IBM Plex Sans" },
    accents: ["Azul", "Naranja", "Violeta"],
  },
  "quimica-laboratorio": {
    id: "quimica-laboratorio",
    name: "Química laboratorio",
    area: "química y ciencias de la vida",
    mode: "light",
    mood: "fresco, científico, de laboratorio",
    description: "Verdes y teal con hexágonos moleculares sutiles.",
    fonts: { display: "Space Grotesk", body: "Atkinson Hyperlegible" },
    accents: ["Teal", "Verde", "Naranja"],
  },
  "institucional-sobrio": {
    id: "institucional-sobrio",
    name: "Institucional sobrio",
    area: "humanidades, gestión, derecho y clases institucionales",
    mode: "light",
    mood: "formal, discreto, deja el protagonismo a la marca de la institución",
    description: "Neutro y formal; adopta el color de la institución en los acentos de marca.",
    fonts: { display: "Literata", body: "IBM Plex Sans" },
    accents: ["Azul institucional", "Vino", "Verde"],
  },
  pizarra: {
    id: "pizarra",
    name: "Pizarra",
    area: "educación básica, bachillerato y clases introductorias",
    mode: "dark",
    mood: "cercano, didáctico, de aula con tiza",
    description: "Verde pizarra con tiza y trazos a mano alzada.",
    fonts: { display: "Fraunces", body: "Atkinson Hyperlegible" },
    accents: ["Tiza amarilla", "Azul tiza", "Durazno"],
  },
  "institucional-marca": {
    id: "institucional-marca",
    name: "Institucional con tu marca",
    area: "cualquier materia en clases con identidad institucional",
    mode: "light",
    mood: "formal y limpio, con los colores de tu institución en acentos y filetes",
    description: "Neutro y legible; toma los colores de la institución del docente y los ajusta para que siempre se lean bien.",
    fonts: { display: "Literata", body: "IBM Plex Sans" },
    accents: ["Color de la institución", "Color secundario", "Neutro"],
    v3: true,
    areas: ["math", "programming", "humanities", "natsci", "general"],
  },
  "programacion-terminal": {
    id: "programacion-terminal",
    name: "Programación terminal",
    area: "programación, computación e ingeniería de software",
    mode: "dark",
    mood: "técnico, de editor de código y terminal, verde fósforo sobre carbón",
    description: "Fondo carbón con acentos verde y celeste; pensado para código, consola y diagramas.",
    fonts: { display: "Space Grotesk", body: "IBM Plex Sans" },
    accents: ["Verde terminal", "Celeste", "Ámbar"],
    v3: true,
    areas: ["programming"],
  },
  "humanidades-editorial": {
    id: "humanidades-editorial",
    name: "Humanidades editorial",
    area: "humanidades, sociales, derecho y letras",
    mode: "light",
    mood: "editorial, de lectura pausada, con citas y casos",
    description: "Papel cálido con serif de display y acento granate; da protagonismo a citas y textos.",
    fonts: { display: "Fraunces", body: "Atkinson Hyperlegible" },
    accents: ["Granate", "Azul tinta", "Verde bosque"],
    v3: true,
    areas: ["humanities"],
  },
  "biologia-natural": {
    id: "biologia-natural",
    name: "Biología natural",
    area: "biología, ecología, ciencias de la vida y ambientales",
    mode: "light",
    mood: "orgánico, fresco, de cuaderno de campo",
    description: "Verdes suaves y formas redondeadas; ideal para esquemas, ciclos e imágenes de la naturaleza.",
    fonts: { display: "Literata", body: "Atkinson Hyperlegible" },
    accents: ["Verde hoja", "Turquesa", "Terracota"],
    v3: true,
    areas: ["natsci"],
  },
  "educacion-calido": {
    id: "educacion-calido",
    name: "Educación cálido",
    area: "educación, pedagogía, formación docente y clases introductorias",
    mode: "light",
    mood: "cercano, amable, de aula con color",
    description: "Tonos cálidos, bordes redondeados y acentos terracota; transmite cercanía sin perder claridad.",
    fonts: { display: "Fraunces", body: "Atkinson Hyperlegible" },
    accents: ["Terracota", "Azul petróleo", "Verde oliva"],
    v3: true,
    areas: ["humanities", "general"],
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

export type StyleChoice = { themeId: ThemeId; accent: AccentId };

/**
 * Preferencia de estilo guardada en `presentations.theme_id`: "tema" (acento a) o "tema:acento" = ELECCIÓN del docente.
 * Con `proposed` se marca como PROPUESTA de la IA ("tema:acento:ia"): se reutiliza al rediseñar pero la UI no la presenta como elegida.
 */
export function formatStylePref(s: StyleChoice, proposed = false): string {
  if (proposed) return `${s.themeId}:${s.accent}:ia`;
  return s.accent === "a" ? s.themeId : `${s.themeId}:${s.accent}`;
}
export function parseStylePref(v: string | null | undefined): StyleChoice | null {
  if (!v) return null;
  const [t, a = "a", flag] = v.split(":");
  if (!isThemeId(t) || !(ACCENT_IDS as readonly string[]).includes(a) || (flag !== undefined && flag !== "ia")) return null;
  return { themeId: t, accent: a as AccentId };
}
/** true si el valor guardado es una propuesta de la IA y no una elección del docente. */
export const isStyleProposal = (v: string | null | undefined): boolean => !!v && parseStylePref(v) !== null && v.endsWith(":ia");

const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Palabras clave → tema. El orden importa: gana la primera coincidencia. */
const STYLE_KEYWORDS: [RegExp, ThemeId][] = [
  [/calcul|derivad|integral|limite|serie|diferencial|analisis matem|sucesion/, "calculo-editorial"],
  [/algebra|matri[cz]|vector|ecuacion|lineal|polinom|discret|logica|conjunto|grafo/, "algebra-grafito"],
  [/fisica|mecanica|cinematic|dinamica|electro|magnet|onda|optica|termodinam|energia|movimiento|gravit|cuantic/, "fisica-aurora"],
  [/geometr|trigonom|triangulo|circunferencia|poligono|angulo|topolog/, "geometria-compas"],
  [/estadist|probabilid|datos|regresion|muestre|inferencia|econometr/, "estadistica-datos"],
  [/quimic|molecul|reaccion|atomo|organic|bioquim|biolog|celula|genetic|farmac/, "quimica-laboratorio"],
  [/derecho|jurid|gestion|administr|contab|econom|histori|filosof|etica|sociolog|politic|liderazgo|marketing|institucion/, "institucional-sobrio"],
  [/bachillerato|colegio|secundaria|escuela|basica|primaria|introduccion|iniciacion/, "pizarra"],
];

/** Propuesta determinista de estilo (respaldo cuando la IA no responde y sugerencia inicial en la UI). */
export function proposeStyle(input: { area?: string; subject?: string; topic?: string; level?: string; objective?: string }, opts: { v3?: boolean } = {}): StyleChoice {
  if (opts.v3) {
    const byArea = v3ThemeFor(input);
    if (byArea) return { themeId: byArea, accent: "a" };
  }
  const hay = plain([input.area, input.subject, input.topic, input.objective].filter(Boolean).join(" · "));
  for (const [re, id] of STYLE_KEYWORDS) if (re.test(hay)) return { themeId: id, accent: "a" };
  const lvl = plain(input.level ?? "");
  for (const [re, id] of STYLE_KEYWORDS) if (id === "pizarra" && re.test(lvl)) return { themeId: id, accent: "a" };
  return { themeId: DEFAULT_THEME_ID, accent: "a" };
}

/** V3: tema propio del área cuando el tema o la materia no activan una palabra clave más específica (matemáticas y física conservan las suyas). */
const V3_AREA_KEYWORDS: [RegExp, ThemeId][] = [
  [/program|codigo|algoritm|software|python|java|datos estructur|estructura de datos|computacion|informatica|base de datos|redes|sistemas operativos|web/, "programacion-terminal"],
  [/biolog|ecolog|genetic|celula|fotosint|anatom|botanic|zoolog|ambient|natural/, "biologia-natural"],
  [/pedagog|didact|educacion|docente|ensenanza|aprendizaje|curricul/, "educacion-calido"],
  [/literatur|historia|filosof|sociolog|psicolog|antropolog|linguist|derecho|juridic|politic|comunicacion|humanid/, "humanidades-editorial"],
];
function v3ThemeFor(input: { area?: string; subject?: string; topic?: string; objective?: string }): ThemeId | null {
  const hay = plain([input.area, input.subject, input.topic, input.objective].filter(Boolean).join(" · "));
  for (const [re, id] of V3_AREA_KEYWORDS) if (re.test(hay)) return id;
  return null;
}

/** Catálogo de temas en texto para el prompt de elección de estilo (los temas v3 solo con `v3: true`). */
export function themesForPrompt(opts: { v3?: boolean } = {}): string {
  return THEME_IDS.filter((id) => opts.v3 || !(THEMES[id] as ThemeSpec).v3).map((id) => {
    const t: ThemeSpec = THEMES[id];
    return `- ${id}: ${t.name} (${t.mode === "dark" ? "oscuro" : "claro"}; ${t.mood}). Ideal para: ${t.area}. Acentos: a=${t.accents[0]}, b=${t.accents[1]}, c=${t.accents[2]}.`;
  }).join("\n");
}

/* ───── Contraste del color institucional (--lm-brand) ───── */
const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (h: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]; return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
/** Razón de contraste WCAG entre dos colores #RRGGBB. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
/** Contraste mínimo del color institucional sobre el fondo del tema (texto grande y filetes: WCAG 3:1). */
export const BRAND_MIN_CONTRAST = 3;
/** Temas que pintan con `--lm-brand` (texto, filete, decoración): fondo y acentos a/b/c (verificado contra su CSS en engine/test/themes.test.ts). */
export const BRAND_THEMES: Partial<Record<ThemeId, { bg: string; accents: readonly [string, string, string] }>> = {
  "institucional-sobrio": { bg: "#f8f8f6", accents: ["#1f3a5f", "#6b1f2a", "#1d5a4a"] },
};
/**
 * Color institucional a aplicar como `--lm-brand`: el primario si contrasta ≥ 3:1 con el fondo del tema; si no, `undefined`
 * (el CSS cae al acento del tema). Los temas que no usan la marca lo reciben tal cual.
 */
export function brandColorFor(themeId: string | undefined, primary: string | undefined): string | undefined {
  if (!primary || !/^#[0-9a-fA-F]{6}$/.test(primary)) return undefined;
  const t = isThemeId(themeId) ? BRAND_THEMES[themeId] : undefined;
  if (!t) return primary;
  return contrastRatio(primary, t.bg) >= BRAND_MIN_CONTRAST ? primary : undefined;
}

/* ───── Tema institucional automático (V3 §5.7): acentos derivados de los colores de la institución ───── */
type Lch = { l: number; c: number; h: number };
const toLinear = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const fromLinear = (v: number) => { const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, c)) * 255); };
function hexToOklch(hex: string): Lch {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16))) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
}
function oklchToHex({ l, c, h }: Lch): string {
  const A = c * Math.cos(h), B = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3, m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3, s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_];
  return `#${rgb.map((v) => fromLinear(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Superficies del tema institucional-marca (deben coincidir con su CSS; lo verifica engine/test/themes.test.ts). */
export const BRAND_THEME_SURFACES = { bg: "#f8f8f6", panel: "#ecece8" } as const;
export const BRAND_ACCENT_MIN_CONTRAST = 4.5;
export type InstitutionalAccents = { accent: string; accent2: string; adjusted: boolean };

/** Oscurece (en OKLCH, conservando matiz y croma) un color hasta que contraste ≥ `min` con fondo y panel. */
function ensureContrast(hex: string, min: number): { hex: string; moved: number } {
  const start = hexToOklch(hex);
  let cur = { ...start };
  const ok = (h: string) => contrastRatio(h, BRAND_THEME_SURFACES.bg) >= min && contrastRatio(h, BRAND_THEME_SURFACES.panel) >= min;
  let out = hex;
  for (let i = 0; i < 80 && !ok(out); i++) { cur = { ...cur, l: Math.max(0, cur.l - 0.01), c: cur.c * 0.99 }; out = oklchToHex(cur); }
  if (!ok(out)) out = "#1a1d21"; // último recurso: tinta del tema
  return { hex: out, moved: Math.abs(hexToOklch(out).l - start.l) };
}

/**
 * Acentos del tema institucional-marca a partir de los colores de la institución: el primario pasa a ser el acento y el secundario
 * (o un matiz desplazado del primario) el acento 2, ambos ajustados en OKLCH hasta contrastar ≥ 4.5:1 con las superficies.
 * `adjusted` indica que el color de marca tuvo que cambiar de forma apreciable (se avisa al docente).
 */
export function institutionalAccents(primary: string | undefined, secondary?: string): InstitutionalAccents | null {
  if (!primary || !/^#[0-9a-fA-F]{6}$/.test(primary)) return null;
  const p = ensureContrast(primary.toLowerCase(), BRAND_ACCENT_MIN_CONTRAST);
  const sec = secondary && /^#[0-9a-fA-F]{6}$/.test(secondary) ? secondary.toLowerCase() : oklchToHex({ ...hexToOklch(primary), h: hexToOklch(primary).h + 2.6 });
  const s = ensureContrast(sec, BRAND_ACCENT_MIN_CONTRAST);
  return { accent: p.hex, accent2: s.hex, adjusted: p.moved > 0.04 };
}
