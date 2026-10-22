import Link from "next/link";
import { THEMES, type ThemeId } from "@lamina/contracts";
import { DemoA } from "@/components/landing/DemoA";
import { getSessionUser } from "@/lib/session";
import "@/components/landing/landing-a.css";

export const metadata = { title: "Lámina · presentaciones de clase para docentes de matemática y física" };
export const dynamic = "force-dynamic";

const facts = [
  { n: "i", t: "Gráficas calculadas", d: "Cada curva se evalúa desde la función; si cambias la fórmula, cambia el dibujo." },
  { n: "ii", t: "Fuentes por afirmación", d: "El borrador cita de dónde sale cada dato, y tú lo revisas antes de seguir." },
  { n: "iii", t: "Tú apruebas cada etapa", d: "Contenido y diseño pasan por ti. Nada se publica sin tu visto bueno." },
];

const steps = [
  { t: "Cuéntale el tema", d: "Indica tema, nivel y objetivo. Si tienes apuntes, un PDF o enlaces, súbelos: Lámina los usa como fuente." },
  { t: "Revisa el contenido", d: "Recibes un borrador con secciones, fórmulas, ejemplos resueltos y las fuentes de cada afirmación. Lo editas y lo apruebas." },
  { t: "Revisa el diseño", d: "Con el contenido aprobado, Lámina arma las diapositivas con gráficas, derivaciones y diagramas. Pides cambios o apruebas." },
  { t: "Presenta", d: "Se publica una versión web para proyectar en pantalla completa, con notas del presentador. Tú decides si es privada, por enlace o pública." },
];

const themeIds = Object.keys(THEMES) as ThemeId[];

export default async function Landing() {
  const user = await getSessionUser();
  const href = user ? "/dashboard" : "/login";
  const cta = user ? "Ir a mis presentaciones" : "Entrar a Lámina";
  return (
    <div className="la">
      <div className="la-wrap">
        <header className="la-mast">
          <Link href="/" className="la-mast-brand serif" aria-label="Lámina, inicio"><span>Lámina</span></Link>
          <p className="la-mast-meta">Presentaciones de clase · Cúpula Systems</p>
          <nav aria-label="Principal">
            <a href="#como-funciona" className="la-link hidden sm:inline">Cómo funciona</a>
            <Link href={href} className="la-link">{user ? "Mis presentaciones" : "Entrar"}</Link>
          </nav>
        </header>

        <main>
          <section className="la-hero" aria-labelledby="la-h1">
            <div>
              <p className="la-kicker la-rise">Para docentes de Cálculo, Álgebra, Matemática y Física</p>
              <h1 id="la-h1" className="la-h1 serif la-rise la-d1">
                Tu clase de matemática, <em>compuesta</em> como <span className="la-u">un buen libro</span>.
              </h1>
              <p className="la-lede la-rise la-d2">
                Lámina investiga el tema, redacta el borrador y diseña las diapositivas con fórmulas, gráficas y derivaciones. Tú revisas y apruebas cada etapa antes de proyectar.
              </p>
              <div className="la-cta la-rise la-d3">
                <Link href={href} className="la-btn">{cta}</Link>
                <a href="#demo" className="la-link">Cambiar el tema en vivo ↓</a>
              </div>
              <p className="la-note la-rise la-d4">Gratis para docentes ecuatorianos. El acceso es por invitación mientras el servicio crece.</p>
            </div>
            <div className="la-rise la-d2"><DemoA /></div>
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

          <section id="como-funciona" className="la-sec" aria-labelledby="la-h-flujo">
            <h2 id="la-h-flujo" className="la-sec-h serif">Cuatro pasos, y en dos de ellos <em>decides tú</em></h2>
            <ol className="la-steps">
              {steps.map((s, i) => (
                <li key={s.t} className="la-step">
                  <span className="n serif" aria-hidden>{i + 1}.</span>
                  <h3 className="serif">{s.t}</h3>
                  <p>{s.d}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="la-sec" aria-labelledby="la-h-temas">
            <h2 id="la-h-temas" className="la-sec-h serif">Un estilo para cada <em>materia</em></h2>
            <p className="la-sec-p">Lámina propone un tema según el contenido y tú lo cambias cuando quieras, sin rehacer nada. Cada uno tiene variantes de color y varios diseños de diapositiva.</p>
            <ul className="la-themes" aria-label="Temas disponibles">
              {themeIds.map((id) => <li key={id}>{THEMES[id].name}</li>)}
            </ul>
          </section>

          <section className="la-sec" aria-labelledby="la-h-marca">
            <div className="la-split">
              <div>
                <h2 id="la-h-marca" className="la-sec-h serif">Tu universidad, <em>tu marca</em></h2>
                <p className="la-sec-p">Al entrar eliges tu institución o subes tu propio logo. La portada lleva ambos, más la materia, el período y el grupo, y los datos se recuerdan para la próxima presentación.</p>
              </div>
              <div>
                <h2 className="la-sec-h serif">¿Solo tienes <em>un escaneo</em>?</h2>
                <p className="la-sec-p">Sube un PDF escaneado de tus apuntes o de un libro. Lámina reconoce el texto con OCR y, para las fórmulas, puede usar un modelo de visión gratuito, solo si lo autorizas para esa presentación. El resultado se revisa como cualquier otra fuente.</p>
              </div>
            </div>
          </section>

          <section className="la-sec" aria-labelledby="la-h-mcp">
            <div className="la-split">
              <div>
                <h2 id="la-h-mcp" className="la-sec-h serif">Conecta <em>tu propia IA</em></h2>
                <p className="la-sec-p">Si ya usas un asistente compatible con MCP, como Claude, puedes conectarlo a tu cuenta desde «Conectar con IA». Él redacta el contenido y las diapositivas; tú sigues aprobando todo en Lámina antes de publicar.</p>
                <p className="la-sec-p">La conexión se autoriza con tu cuenta y puedes revocarla cuando quieras.</p>
              </div>
              <div>
                <h2 className="la-sec-h serif">Lo que Lámina <em>verifica</em>, y lo que te avisa</h2>
                <ul className="la-list">
                  <li>Las fórmulas se comprueban con KaTeX; igualdades y derivadas se contrastan numéricamente.</li>
                  <li>Lo que no se puede verificar queda marcado en el borrador, no se da por bueno en silencio.</li>
                  <li>Si la búsqueda web no está disponible, Lámina lo dice en vez de inventar referencias.</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="la-sec" aria-labelledby="la-h-abierto">
            <div className="la-split">
              <div>
                <h2 id="la-h-abierto" className="la-sec-h serif">Abierto, y con tus datos <em>a la vista</em></h2>
                <p className="la-sec-p">
                  Lámina es software libre (AGPL-3.0) de <a className="la-link" href="https://systems.cupula.com.ec">Cúpula Systems</a>. Usa modelos de IA gratuitos, que pueden retener los textos que envías: por eso te pedimos tu consentimiento y no debes subir datos de estudiantes. Lee la <Link className="la-link" href="/privacidad">política de privacidad</Link>.
                </p>
                <p className="la-sec-p"><a className="la-link" href="https://github.com/cupula-ec/lamina">Ver el código en GitHub</a></p>
              </div>
              <div className="la-final">
                <h2 className="la-sec-h serif">Prepara tu próxima clase <em>hoy</em></h2>
                <div className="la-cta"><Link href={href} className="la-btn">{cta}</Link></div>
                <p className="la-note">Gratis para docentes ecuatorianos. El acceso es por invitación mientras el servicio crece.</p>
              </div>
            </div>
          </section>
        </main>

        <footer className="la-foot">
          <span>© 2026 Cúpula Systems. Software libre bajo AGPL-3.0.</span>
          <nav aria-label="Legal"><Link href="/privacidad" className="la-link">Privacidad</Link><Link href="/terminos" className="la-link">Términos</Link></nav>
        </footer>
      </div>
    </div>
  );
}
