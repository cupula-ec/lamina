import Link from "next/link";
import { Brand } from "@/components/Brand";

export const metadata = { title: "Privacidad" };

export default function Privacidad() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <Brand />
      <article className="prose-lamina mt-8">
        <h1 className="text-3xl font-bold">Política de privacidad</h1>
        <p className="hint">Versión 2026-10. Lámina es operada por Cúpula Systems (Ecuador).</p>
        <h2>Qué datos tratamos</h2>
        <ul>
          <li>Tu nombre, correo y método de acceso (contraseña, Google o acceso Cúpula).</li>
          <li>Las presentaciones que creas: tema, contenido, versiones, diseño y comentarios.</li>
          <li>Los materiales que aportas (apuntes, PDF, DOCX, enlaces) y el texto extraído de ellos.</li>
          <li>Métricas mínimas de uso (etapa alcanzada, errores, tiempos) sin el contenido de tus presentaciones.</li>
        </ul>
        <h2>Proveedores de IA gratuitos</h2>
        <p>
          Para generar contenido, el texto de tu tema, de tus materiales y de las fuentes investigadas se envía a modelos de IA de terceros accesibles gratuitamente a través de OpenRouter. <strong>Esos proveedores pueden retener los textos y usarlos según sus propias políticas</strong>, incluido el entrenamiento de modelos. Por eso no debes subir datos personales de estudiantes ni material confidencial. Te pedimos tu consentimiento en el primer ingreso y al subir archivos.
        </p>
        <h2>PDF escaneados (OCR)</h2>
        <p>
          Si subes un PDF sin texto (un escaneo o fotos de apuntes), reconocemos el texto con Tesseract <strong>en nuestros propios servidores</strong>: las imágenes de las páginas se generan en una carpeta temporal privada y se borran al terminar; nunca se guardan en la base de datos ni en los registros. Solo se conserva el texto reconocido como fuente de tu presentación, marcado como «reconocido por OCR».
        </p>
        <p>
          Aparte, y <strong>solo si marcas la casilla específica</strong> al subir el PDF, las páginas que contengan fórmulas o salgan con poca nitidez se envían <strong>como imagen</strong> a un modelo de visión gratuito (a través de OpenRouter) para transcribir las fórmulas a LaTeX. Ese proveedor puede retener la imagen según sus propias políticas. Si no marcas la casilla, ninguna imagen sale de nuestros servidores. De cada página solo guardamos metadatos (número, motor usado, confianza), nunca su contenido; el límite es de 30 páginas con visión por día y de 40 páginas de OCR por documento.
        </p>
        <h2>Búsqueda web</h2>
        <p>Las consultas de investigación se hacen contra un buscador propio (SearXNG) y, como respaldo, contra Tavily. Las páginas encontradas se descargan desde nuestros servidores.</p>
        <h2>Privacidad de tus presentaciones</h2>
        <p>Son privadas por defecto. Solo tú las ves hasta que las publiques; puedes compartirlas por un enlace revocable o hacerlas públicas, y despublicarlas cuando quieras.</p>
        <h2>Retención y eliminación</h2>
        <ul>
          <li>Al eliminar una presentación se borran sus versiones, fuentes, archivos subidos y capturas.</li>
          <li>Los registros de trabajos y de llamadas a la IA (sin contenido) se purgan a los 90 días.</li>
          <li>Puedes eliminar tu cuenta y todos tus datos desde el panel de la cuenta.</li>
        </ul>
        <h2>Cookies</h2>
        <p>Usamos únicamente una cookie de sesión necesaria para mantenerte conectado/a. No usamos cookies de publicidad ni analítica de terceros.</p>
        <h2>Contacto</h2>
        <p>Cúpula Systems — <a href="https://systems.cupula.com.ec" className="underline">systems.cupula.com.ec</a>. El código es abierto (AGPL-3.0): <a className="underline" href="https://github.com/cupula-ec/lamina">github.com/cupula-ec/lamina</a>.</p>
        <p><Link href="/" className="underline">Volver al inicio</Link></p>
      </article>
    </div>
  );
}
