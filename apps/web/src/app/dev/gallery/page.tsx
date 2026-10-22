import { notFound } from "next/navigation";
import { NATIVE_CATALOG, galleryDeck } from "@lamina/components";
import { ACCENT_IDS, LAYOUTS, THEME_IDS, isThemeId, type AccentId } from "@lamina/contracts";
import { GalleryClient } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Galería de estilos" };

type SP = { theme?: string; accent?: string; view?: string };

export default async function Gallery({ searchParams }: { searchParams: Promise<SP> }) {
  if (process.env.NODE_ENV === "production" && process.env.LAMINA_GALLERY !== "1") notFound();
  const sp = await searchParams;
  const themeId = isThemeId(sp.theme) ? sp.theme : THEME_IDS[0];
  const accent = ((ACCENT_IDS as readonly string[]).includes(sp.accent ?? "") ? sp.accent : "a") as AccentId;
  const view = sp.view === "components" || sp.view === "picker" ? sp.view : "layouts";
  const deck = galleryDeck({ themeId, accent });
  const components = NATIVE_CATALOG.flatMap((c) =>
    c.examples.map((ex, i) => {
      const slot = c.fitsSlots[0]!;
      const layout = slot === "main" ? "title-content" : (Object.values(LAYOUTS).find((l) => l.slots.some((s) => s.name === slot)) ?? LAYOUTS["title-content"]).id;
      const slots: Record<string, unknown> = {};
      for (const s of LAYOUTS[layout].slots) slots[s.name] = { componentId: "SectionHeader", version: "1.0.0", props: { title: `${c.title}`, kicker: "Galería" } };
      if (c.def.id === "Title") for (const k of Object.keys(slots)) delete slots[k];
      slots[slot] = { componentId: c.def.id, version: c.def.version, props: ex.props };
      return { id: `${c.def.id}-${i}`, layout, slots, notes: "", build: { steps: [] }, transition: "none" };
    }),
  );
  return <GalleryClient deck={deck} components={components as never} view={view} themeId={themeId} accent={accent} />;
}
