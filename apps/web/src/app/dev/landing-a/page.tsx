import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoA } from "@/components/landing/DemoA";
import "@/components/landing/landing-a.css";

export const metadata = { title: "Landing A · propuesta editorial" };

const facts = [
  { n: "i", t: "Gráficas calculadas", d: "Cada curva se evalúa desde la función; si cambias la fórmula, cambia el dibujo." },
  { n: "ii", t: "Fuentes por afirmación", d: "El borrador cita de dónde sale cada dato, y tú lo revisas antes de seguir." },
  { n: "iii", t: "Tú apruebas cada etapa", d: "Contenido y diseño pasan por ti. Nada se publica sin tu visto bueno." },
];

export default function LandingA() {
  if (process.env.NODE_ENV === "production" && process.env.LAMINA_GALLERY !== "1") notFound();
  return (
    <div className="la">
      <div className="la-wrap">
        <header className="la-mast">
          <Link href="/" className="la-mast-brand serif" aria-label="Lámina, inicio"><span>Lámina</span></Link>
          <p className="la-mast-meta">Presentaciones de clase · Cúpula Systems</p>
          <nav aria-label="Principal">
            <a href="#demo" className="la-link hidden sm:inline">Probar los temas</a>
            <Link href="/login" className="la-link">Entrar</Link>
          </nav>
        </header>

        <main>
          <section className="la-hero" aria-labelledby="la-h1">
            <div>
              <p className="la-kicker la-rise">Para docentes de Cálculo, Álgebra y Física</p>
              <h1 id="la-h1" className="la-h1 serif la-rise la-d1">
                Tu clase de matemática, <em>compuesta</em> como <span className="la-u">un buen libro</span>.
              </h1>
              <p className="la-lede la-rise la-d2">
                Lámina investiga el tema, redacta el borrador y diseña las diapositivas con fórmulas, gráficas y derivaciones. Tú revisas y apruebas cada etapa antes de proyectar.
              </p>
              <div className="la-cta la-rise la-d3">
                <Link href="/login" className="la-btn">Entrar a Lámina</Link>
                <a href="#demo" className="la-link">Cambiar el tema en vivo ↓</a>
              </div>
              <p className="la-note la-rise la-d4">Gratis para docentes ecuatorianos. El acceso es por invitación mientras el servicio crece.</p>
            </div>

            <div className="la-rise la-d2">
              <DemoA />
            </div>
          </section>

          <svg className="la-draw" viewBox="0 0 600 300" fill="none" aria-hidden>
            <g stroke="#17140f" strokeOpacity=".35" strokeWidth="1"><path d="M20 150H580M300 10V290" /></g>
            <path className="curve" d="M60 270C140 -40 210 330 300 150S470 -50 560 40" stroke="#8c2f1b" strokeWidth="2.5" strokeLinecap="round" />
            <path className="tan" d="M330 70 480 -10" stroke="#17140f" strokeWidth="1.5" strokeDasharray="5 5" />
            <circle cx="405" cy="30" r="5" fill="#8c2f1b" />
          </svg>

          <section className="la-facts" aria-label="Lo que hace distinto a Lámina">
            {facts.map((f) => (
              <div key={f.t} className="la-fact">
                <span className="n serif" aria-hidden>{f.n}.</span>
                <b className="serif">{f.t}</b>
                <p>{f.d}</p>
              </div>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}
