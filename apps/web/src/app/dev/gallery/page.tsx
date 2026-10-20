import { notFound } from "next/navigation";
import { NATIVE_CATALOG } from "@lamina/components";
import { LAYOUTS } from "@lamina/contracts";
import { GalleryClient } from "./client";

export const dynamic = "force-dynamic";

export default function Gallery() {
  if (process.env.NODE_ENV === "production" && process.env.LAMINA_GALLERY !== "1") notFound();
  const slides = NATIVE_CATALOG.flatMap((c) =>
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
  return <GalleryClient slides={slides as any} />;
}
