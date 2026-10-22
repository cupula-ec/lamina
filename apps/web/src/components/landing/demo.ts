import { previewDeck } from "@lamina/components";
import type { AccentId, Branding, DeckDocument, ThemeId } from "@lamina/contracts";

const svg = (body: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80">${body}</svg>`)}`;

/** Marcas inventadas solo para la demostración (no son de ninguna institución real). */
export const DEMO_BRANDING: Branding = {
  institution: {
    name: "Universidad de Ejemplo",
    short: "UEJ",
    logoUrl: svg(`<g fill="none" stroke="#1f3d6e" stroke-width="5"><path d="M14 66V28l26-16 26 16v38"/><path d="M27 66V38h26v28"/></g><text x="84" y="40" font-family="Georgia,serif" font-weight="700" font-size="26" fill="#1f3d6e">Universidad</text><text x="84" y="64" font-family="Georgia,serif" font-size="20" fill="#1f3d6e">de Ejemplo</text>`),
  },
  personalLogoUrl: svg(`<g fill="none" stroke="#8c2f1b" stroke-width="5"><circle cx="40" cy="40" r="24"/><path d="M24 52c10-30 22 8 32-24"/></g><text x="82" y="48" font-family="Georgia,serif" font-weight="700" font-size="26" fill="#8c2f1b">M. Torres</text>`),
  teacher: "Prof. Mariana Torres",
  subject: "Cálculo I",
  period: "Abr–Ago 2026",
  group: "Grupo 2",
};

export const DEMO_THEMES: { id: ThemeId; label: string; accent?: AccentId }[] = [
  { id: "calculo-editorial", label: "Cálculo editorial" },
  { id: "algebra-grafito", label: "Álgebra grafito" },
  { id: "fisica-aurora", label: "Física aurora" },
  { id: "pizarra", label: "Pizarra" },
  { id: "lamina-claro", label: "Lámina claro" },
];

export function demoDeck(themeId: ThemeId, accent?: AccentId): DeckDocument {
  return previewDeck({ themeId, ...(accent ? { accent } : {}), topic: "La derivada", branding: DEMO_BRANDING });
}
