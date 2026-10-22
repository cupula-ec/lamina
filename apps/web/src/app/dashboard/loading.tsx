export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-10" role="status" aria-label="Cargando">
      <div className="skeleton h-9 w-64" />
      <div className="skeleton mt-3 h-5 w-96 max-w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="skeleton h-28" /><div className="skeleton h-28" /><div className="skeleton h-28" /><div className="skeleton h-28" /></div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
