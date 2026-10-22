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

/** Preferencia de estilo guardada en `presentations.theme_id`: "tema" (acento a) o "tema:acento". */
export function formatStylePref(s: StyleChoice): string {
  return s.accent === "a" ? s.themeId : `${s.themeId}:${s.accent}`;
}
export function parseStylePref(v: string | null | undefined): StyleChoice | null {
  if (!v) return null;
  const [t, a = "a"] = v.split(":");
  if (!isThemeId(t) || !(ACCENT_IDS as readonly string[]).includes(a)) return null;
  return { themeId: t, accent: a as AccentId };
}

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
export function proposeStyle(input: { area?: string; subject?: string; topic?: string; level?: string; objective?: string }): StyleChoice {
  const hay = plain([input.area, input.subject, input.topic, input.objective].filter(Boolean).join(" · "));
  for (const [re, id] of STYLE_KEYWORDS) if (re.test(hay)) return { themeId: id, accent: "a" };
  const lvl = plain(input.level ?? "");
  for (const [re, id] of STYLE_KEYWORDS) if (id === "pizarra" && re.test(lvl)) return { themeId: id, accent: "a" };
  return { themeId: DEFAULT_THEME_ID, accent: "a" };
}

/** Catálogo de temas en texto para el prompt de elección de estilo. */
export function themesForPrompt(): string {
  return THEME_IDS.map((id) => {
    const t: ThemeSpec = THEMES[id];
    return `- ${id}: ${t.name} (${t.mode === "dark" ? "oscuro" : "claro"}; ${t.mood}). Ideal para: ${t.area}. Acentos: a=${t.accents[0]}, b=${t.accents[1]}, c=${t.accents[2]}.`;
  }).join("\n");
}
