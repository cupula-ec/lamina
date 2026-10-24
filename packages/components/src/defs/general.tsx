import { z } from "zod";
import { Md } from "@lamina/engine";
import { defineComponent } from "../define";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ───── Image ───── */
export const Image = defineComponent({
  id: "Image",
  title: "Imagen",
  purpose: "Imagen de apoyo guardada en Lámina (nunca una URL externa), con texto alternativo obligatorio, recorte controlado y crédito opcional.",
  useCases: ["Fotografía de un fenómeno o lugar", "Esquema o diagrama real", "Retrato o contexto histórico"],
  constraints: ["assetId = id de una imagen ya guardada (la elige el sistema o el docente)", "alt obligatorio ≤ 300 caracteres", "caption ≤ 160 caracteres"],
  fitsSlots: ["visual", "main", "left", "right", "aside", "side", "col1", "col2", "col3"],
  schema: z.object({
    assetId: z.string().regex(UUID),
    alt: z.string().min(1).max(300),
    fit: z.enum(["cover", "contain"]).default("cover"),
    focal: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
    caption: z.string().max(160).optional(),
    showCredit: z.boolean().default(false),
    /** Texto de crédito (autor · licencia · fuente); se muestra solo con showCredit. */
    credit: z.string().max(200).optional(),
    /** URL resuelta por el servidor al mostrar (firmada, con caducidad); no se guarda en el deck. */
    src: z.string().max(400).regex(/^\/api\/assets\/[0-9a-f-]{36}(\?[A-Za-z0-9=&_-]+)?$/i).optional(),
  }),
  examples: [{ name: "figura", props: { assetId: "00000000-0000-4000-8000-000000000000", alt: "Célula animal vista al microscopio", caption: "Célula animal", fit: "cover", showCredit: false } }],
  Component: ({ props }) => (
    <figure className="lm-image" style={{ ["--lm-img-fit" as string]: props.fit, ...(props.focal ? { ["--lm-img-x" as string]: `${props.focal.x * 100}%`, ["--lm-img-y" as string]: `${props.focal.y * 100}%` } : {}) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={props.src ?? `/api/assets/${props.assetId}`} alt={props.alt} decoding="async" />
      {(props.caption || (props.showCredit && props.credit)) && (
        <figcaption>
          {props.caption && <Md inline>{props.caption}</Md>}
          {props.showCredit && props.credit && <span className="lm-image-credit">{props.credit}</span>}
        </figcaption>
      )}
    </figure>
  ),
});
