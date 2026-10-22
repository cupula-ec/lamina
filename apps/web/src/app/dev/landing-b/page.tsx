import Link from "next/link";
import { notFound } from "next/navigation";
import { LAYOUT_IDS, THEME_IDS } from "@lamina/contracts";
import { MockB } from "@/components/landing/MockB";
import "@/components/landing/landing-b.css";

export const metadata = { title: "Landing B · propuesta producto" };

const stats = [
  { b: "4", s: "etapas, y decides en dos" },
  { b: String(THEME_IDS.length), s: "temas visuales con variantes de color" },
  { b: String(LAYOUT_IDS.length), s: "composiciones de diapositiva" },
  { b: "AGPL", s: "código abierto, auditable" },
];

export default function LandingB() {
  if (process.env.NODE_ENV === "production" && process.env.LAMINA_GALLERY !== "1") notFound();
  return (
    <div className="lb">
      <div className="lb-wrap">
        <header className="lb-nav">
          <Link href="/" className="lb-logo" aria-label="Lámina, inicio"><i aria-hidden>Λ</i>Lámina</Link>
          <nav aria-label="Principal">
            <a href="#producto" className="lb-navlink hidden sm:inline">Producto</a>
            <Link href="/login" className="lb-pill-btn">Entrar</Link>
          </nav>
        </header>

        <main id="producto">
          <section className="lb-hero" aria-labelledby="lb-h1">
            <div>
              <p className="lb-badge lb-rise"><b>Invitación</b>Acceso por invitación mientras el servicio crece</p>
              <h1 id="lb-h1" className="lb-h1 lb-rise lb-d1">Del tema a la clase, <span className="lb-grad">sin perder el control</span>.</h1>
              <p className="lb-lede lb-rise lb-d2">Lámina redacta el borrador, calcula las gráficas y diseña las diapositivas de Cálculo, Álgebra y Física. Tú revisas y apruebas cada etapa antes de proyectar.</p>
              <div className="lb-cta lb-rise lb-d3">
                <Link href="/login" className="lb-btn lb-btn-p">Entrar a Lámina</Link>
                <a href="#producto" className="lb-btn lb-btn-g">Ver cómo funciona</a>
              </div>
              <p className="lb-note lb-rise lb-d3">Gratis para docentes ecuatorianos.</p>
            </div>
            <div className="lb-rise lb-d2"><MockB /></div>
          </section>

          <section className="lb-stats" aria-label="Lámina en cifras">
            {stats.map((s) => (<div key={s.s} className="lb-stat"><b>{s.b}</b><span>{s.s}</span></div>))}
          </section>
        </main>
      </div>
    </div>
  );
}
