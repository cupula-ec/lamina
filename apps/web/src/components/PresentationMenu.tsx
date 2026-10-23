"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { deletePresentationAction, duplicatePresentationAction, renamePresentationAction } from "@/actions/presentations";

/** Menú ⋯ de una tarjeta del dashboard: renombrar y eliminar (con confirmación). */
export function PresentationMenu({ id, title, busy }: { id: string; title: string; busy: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "rename" | "delete">("menu");
  const [name, setName] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) close(); };
    window.addEventListener("keydown", onKey); window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [open]);
  useEffect(() => { setName(title); }, [title]);
  const close = () => { setOpen(false); setMode("menu"); setError(null); setName(title); };

  const rename = () => start(async () => {
    const r = await renamePresentationAction({ id, title: name });
    if (!r.ok) return setError(r.error ?? "No se pudo renombrar");
    toast.success("Presentación renombrada"); close(); router.refresh();
  });
  const duplicate = () => start(async () => {
    const r = await duplicatePresentationAction({ id });
    if (!r.ok) { setMode("menu"); return setError(r.error ?? "No se pudo duplicar"); }
    toast.success("Presentación duplicada: revisa el contenido de la copia"); close(); router.push(`/presentations/${r.data.id}/preview/information`);
  });
  /** Eliminación con deshacer: la tarjeta se oculta 8 s y solo entonces se borra de verdad (si cierras la página antes, no se borra nada). */
  const remove = () => {
    const card = box.current?.closest("li") as HTMLElement | null;
    let undone = false;
    const real = async () => {
      if (undone) return;
      const r = await deletePresentationAction({ id });
      if (!r.ok) { if (card) card.hidden = false; toast.error(r.error ?? "No se pudo eliminar"); return; }
      router.refresh();
    };
    if (card) card.hidden = true;
    toast(`«${title}» eliminada`, {
      duration: 8000,
      action: { label: "Deshacer", onClick: () => { undone = true; if (card) card.hidden = false; } },
      onAutoClose: () => void real(),
      onDismiss: () => void real(),
    });
    close();
  };

  return (
    <div ref={box} className="relative flex-none">
      <button type="button" className="btn btn-sm btn-ghost px-2" aria-expanded={open} aria-label={`Opciones de ${title}`} onClick={() => (open ? close() : setOpen(true))}>
        <MoreVertical size={18} aria-hidden />
      </button>
      {open && (
        <div className="sheet absolute right-0 z-20 mt-1 w-72 space-y-2 p-3 text-sm">
          {mode === "menu" && (
            <>
              <button type="button" className="btn btn-sm w-full justify-start" onClick={() => setMode("rename")}>Renombrar</button>
              <button type="button" className="btn btn-sm w-full justify-start" disabled={pending || busy} onClick={duplicate}>{pending ? "Duplicando…" : "Duplicar (contenido y fuentes)"}</button>
              {error && <p role="alert" className="text-pen">{error}</p>}
              <button type="button" className="btn btn-sm w-full justify-start text-pen" onClick={() => setMode("delete")}>Eliminar…</button>
            </>
          )}
          {mode === "rename" && (
            <form onSubmit={(e) => { e.preventDefault(); rename(); }} className="space-y-2">
              <label className="label" htmlFor={`rn-${id}`}>Nuevo nombre</label>
              <input id={`rn-${id}`} className="input w-full" value={name} maxLength={200} autoFocus onChange={(e) => setName(e.target.value)} />
              {error && <p role="alert" className="text-pen">{error}</p>}
              <div className="flex gap-2"><button className="btn btn-sm btn-primary" disabled={pending || !name.trim()}>Guardar</button><button type="button" className="btn btn-sm" onClick={close}>Cancelar</button></div>
            </form>
          )}
          {mode === "delete" && (
            <div className="space-y-2">
              <p className="font-bold">¿Eliminar «{title}»?</p>
              <p className="text-ink-2">Se borrarán sus versiones, fuentes y archivos. Tendrás 8 segundos para deshacer.</p>
              {busy && <p role="alert" className="text-pen">Se está procesando: espera a que termine para eliminarla.</p>}
              {error && <p role="alert" className="text-pen">{error}</p>}
              <div className="flex gap-2"><button className="btn btn-sm btn-primary" disabled={pending || busy} onClick={remove}>Sí, eliminar</button><button type="button" className="btn btn-sm" onClick={close}>Cancelar</button></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
