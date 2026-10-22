"use client";
import { useEffect, useState } from "react";
import { SlideThumb } from "@lamina/engine";
import { nativeResolver } from "@lamina/components";
import { demoDeck } from "./demo";

const main = demoDeck("algebra-grafito");
const aux = demoDeck("fisica-aurora");

/** Mockup de la interfaz de Lámina (etapa de diseño) con diapositivas reales del motor. */
export function MockB() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const skel = <div style={{ aspectRatio: "16/9", background: "#14172a" }} />;
  return (
    <div className="lb-scene">
      <div className="lb-win" role="img" aria-label="Maqueta de la pantalla de revisión de diseño de Lámina con una diapositiva de derivadas en el tema Álgebra grafito">
        <div className="lb-bar" aria-hidden><i /><i /><i /><span className="lb-url">lamina · presentaciones / la-derivada / diseño</span></div>
        <div className="lb-stages" aria-hidden>
          <span className="lb-stage done">✓ Información</span>
          <span className="lb-stage done">✓ Contenido</span>
          <span className="lb-stage now">● Diseño</span>
          <span className="lb-stage">Presentar</span>
        </div>
        <div className="lb-body" aria-hidden>
          <div className="lb-rail">
            {ready ? [0, 1].map((i) => <div key={i} className={i === 1 ? "on" : ""}><SlideThumb deck={main} index={i} resolver={nativeResolver} /></div>) : null}
          </div>
          <div className="lb-main">{ready ? <SlideThumb deck={main} index={1} resolver={nativeResolver} /> : skel}</div>
        </div>
        <p className="lb-cap" aria-hidden><span>Pedir cambios · Aprobar diseño</span></p>
      </div>
      <div className="lb-float lb-f1" aria-hidden>{ready ? <SlideThumb deck={aux} index={0} resolver={nativeResolver} /> : null}</div>
      <div className="lb-float lb-f2" aria-hidden><span className="ok">✓</span><span>Fórmulas validadas<small>antes de proyectar</small></span></div>
    </div>
  );
}
