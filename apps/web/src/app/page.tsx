import Link from "next/link";
import { Brand } from "@/components/Brand";
import { HeroSlide } from "@/components/HeroSlide";
import { getSessionUser } from "@/lib/session";

const steps = [
  { t: "Cuéntale el tema", d: "Indica tema, nivel y objetivo. Si tienes apuntes, un PDF o enlaces, súbelos: Lámina los usa como fuente." },
  { t: "Revisa el contenido", d: "Recibes un borrador con secciones, fórmulas, ejemplos resueltos y las fuentes de cada afirmación. Lo editas y lo apruebas." },
  { t: "Revisa el diseño", d: "Con el contenido aprobado, Lámina arma las diapositivas con gráficas, derivaciones y diagramas. Pides cambios o apruebas." },
  { t: "Presenta", d: "Se publica una versión web para proyectar en pantalla completa, con notas del presentador. Tú decides si es privada, por enlace o pública." },
];

export const dynamic = "force-dynamic";

export default async function Landing() {
  const user = await getSessionUser();
  return (
    <div className="bg-graph">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Brand />
        <nav className="flex items-center gap-3">
          <a href="#como-funciona" className="hidden text-sm font-bold underline underline-offset-4 sm:inline">Cómo funciona</a>
          <Link href={user ? "/dashboard" : "/login"} className="btn btn-sm">{user ? "Mis presentaciones" : "Entrar"}</Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:pt-12">
          <div>
            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Tu clase, con fórmulas y gráficas, <span className="mark">lista para proyectar</span>.
            </h1>
            <p className="mt-6 max-w-[52ch] text-lg text-ink-2">
              Lámina investiga el tema, redacta el contenido y diseña las diapositivas de Cálculo, Álgebra, Matemática y Física. Tú revisas y apruebas cada etapa antes de seguir.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={user ? "/dashboard" : "/login"} className="btn btn-primary">{user ? "Ir a mis presentaciones" : "Entrar a Lámina"}</Link>
              <a href="#como-funciona" className="btn">Ver cómo funciona</a>
            </div>
            <p className="mt-5 text-sm text-ink-2">Gratis para docentes ecuatorianos. El acceso es por invitación mientras el servicio crece.</p>
          </div>
          <figure className="m-0">
            <div className="sheet overflow-hidden shadow-[6px_6px_0_var(--color-ink)]" aria-label="Ejemplo de diapositiva generada por Lámina">
              <HeroSlide />
            </div>
            <figcaption className="mt-3 text-sm text-ink-2">Una diapositiva real del motor de Lámina: la gráfica se calcula desde la función, no es una imagen.</figcaption>
          </figure>
        </section>

        <section id="como-funciona" className="border-y-2 border-ink bg-paper-2">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="max-w-[28ch] text-3xl font-bold">Cuatro pasos, y en dos de ellos decides tú</h2>
            <ol className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
              {steps.map((s, i) => (
                <li key={s.t} className="grid grid-cols-[3rem_1fr] gap-4">
                  <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink bg-mark font-display text-xl font-bold">{i + 1}</span>
                  <div>
                    <h3 className="text-xl font-bold">{s.t}</h3>
                    <p className="mt-1 max-w-[52ch] text-ink-2">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-12 px-5 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold">Lo que Lámina verifica, y lo que te avisa</h2>
            <p className="mt-3 max-w-[56ch] text-ink-2">
              Las fórmulas se comprueban con KaTeX y las igualdades y derivadas se contrastan numéricamente. Cuando algo no se puede verificar, lo ves marcado en el borrador: no se da por bueno en silencio.
            </p>
            <p className="mt-3 max-w-[56ch] text-ink-2">
              Cada afirmación de la investigación apunta a su fuente. Si la búsqueda web no está disponible, Lámina lo dice en vez de inventar referencias.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-bold">Abierto, y con tus datos a la vista</h2>
            <p className="mt-3 max-w-[56ch] text-ink-2">
              Lámina es software libre (AGPL-3.0) de <a className="underline underline-offset-4" href="https://systems.cupula.com.ec">Cúpula Systems</a>. Usa modelos de IA gratuitos, que pueden retener los textos que envías: por eso te pedimos tu consentimiento y no debes subir datos de estudiantes. Lee la <Link className="underline underline-offset-4" href="/privacidad">política de privacidad</Link>.
            </p>
            <p className="mt-3"><a className="btn btn-sm" href="https://github.com/cupula-ec/lamina">Ver el código en GitHub</a></p>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-ink">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-ink-2">
          <span>© 2026 Cúpula Systems. Software libre bajo AGPL-3.0.</span>
          <span className="flex gap-5"><Link href="/privacidad" className="underline underline-offset-4">Privacidad</Link><Link href="/terminos" className="underline underline-offset-4">Términos</Link></span>
        </div>
      </footer>
    </div>
  );
}
