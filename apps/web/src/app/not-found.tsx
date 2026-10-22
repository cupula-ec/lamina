import Link from "next/link";
import { Brand } from "@/components/Brand";

export const metadata = { title: "No encontrada" };

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-5 py-20">
      <Brand />
      <div className="sheet card-hard mt-8 p-6 sm:p-8">
        <p className="font-display text-5xl font-bold"><span className="mark">404</span></p>
        <h1 className="mt-3 font-display text-2xl font-bold">No encontramos esta página</h1>
        <p className="mt-2 text-ink-2">Puede que el enlace esté mal escrito, que la presentación ya no sea pública o que no tengas acceso.</p>
        <Link href="/dashboard" className="btn btn-primary mt-5">Ir a mis presentaciones</Link>
      </div>
    </main>
  );
}
