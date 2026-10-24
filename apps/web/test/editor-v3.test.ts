import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { galleryDeck } from "@lamina/components";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock("@/actions/presentations", () => ({ saveSlideEditAction: async () => ({ ok: true }) }));

describe("editor simplificado", () => {
  it("dibuja la diapositiva con un botón por elemento y el panel contextual vacío", async () => {
    const { SlideEditorV3 } = await import("../src/app/presentations/[id]/edit/[slideId]/editor-v3");
    const deck = galleryDeck({ themeId: "lamina-claro" });
    const idx = deck.slides.findIndex((s) => s.layout === "split-visual");
    const html = renderToStaticMarkup(createElement(SlideEditorV3, { presentationId: "p", baseVersionId: "v", deck, slideIndex: idx, prov: [], stage: "design_review", backHref: "/x", chatOn: false, imagesOn: false }));
    expect(html).toContain("Haz clic en un elemento");
    expect((html.match(/aria-label="Editar: /g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Elige un elemento en la diapositiva");
    expect(html).not.toContain("Modo avanzado"); // plegado hasta elegir un elemento
  });
});
