import Link from "next/link";

export function Brand({ href = "/", small = false }: { href?: string; small?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-baseline gap-2 no-underline" aria-label="Lámina, inicio">
      <span className={`font-display font-bold tracking-tight ${small ? "text-xl" : "text-2xl"}`}><span className="mark">Lámina</span></span>
      <span className="hidden text-xs text-ink-2 sm:inline">de Cúpula Systems</span>
    </Link>
  );
}
