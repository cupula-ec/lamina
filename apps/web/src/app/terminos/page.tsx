import Link from "next/link";
import { Brand } from "@/components/Brand";

export const metadata = { title: "Términos de uso" };

export default function Terminos() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <Brand />
      <article className="prose-lamina mt-8">
        <h1 className="text-3xl font-bold">Términos de uso</h1>
        <p className="hint">Versión 2026-10.</p>
        <h2>El servicio</h2>
        <p>Lámina es un servicio gratuito, ofrecido por Cúpula Systems a docentes ecuatorianos, que ayuda a preparar presentaciones con IA. Se ofrece “tal cual”, con límites de uso diarios y sin garantía de disponibilidad.</p>
        <h2>Tu responsabilidad sobre el contenido</h2>
        <p>La IA puede equivocarse. Lámina verifica fórmulas y algunos resultados, y te avisa cuando no puede, pero <strong>eres tú quien revisa y aprueba</strong> el contenido y el diseño antes de usarlos con tus estudiantes. Verifica las fuentes citadas.</p>
        <h2>Uso aceptable</h2>
        <ul>
          <li>No subas datos personales de estudiantes ni material sobre el que no tengas derechos.</li>
          <li>No intentes eludir los límites de uso, atacar el servicio ni acceder a presentaciones ajenas.</li>
          <li>Cúpula Systems puede bloquear cuentas que incumplan estas reglas.</li>
        </ul>
        <h2>Licencia</h2>
        <p>El código de Lámina es software libre bajo AGPL-3.0. Las presentaciones que creas son tuyas.</p>
        <p><Link href="/privacidad" className="underline">Política de privacidad</Link> · <Link href="/" className="underline">Inicio</Link></p>
      </article>
    </div>
  );
}
