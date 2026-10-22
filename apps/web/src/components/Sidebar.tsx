"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Plug, UserRound, Shield, Menu, X } from "lucide-react";
import { Brand } from "./Brand";
import { LogoutButton } from "./LogoutButton";

type Item = { href: string; label: string; icon: typeof LayoutGrid; match: (p: string) => boolean; dot?: "on" | "off" };

export function Sidebar({ email, name, admin, mcpConnected }: { email: string; name: string; admin: boolean; mcpConnected: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const items: Item[] = [
    { href: "/dashboard", label: "Presentaciones", icon: LayoutGrid, match: (p) => p.startsWith("/dashboard") || p.startsWith("/presentations") },
    { href: "/conectar", label: "Conectar con IA", icon: Plug, match: (p) => p.startsWith("/conectar") || p.startsWith("/cuenta/conectar"), dot: mcpConnected ? "on" : "off" },
    { href: "/cuenta", label: "Mi cuenta", icon: UserRound, match: (p) => p.startsWith("/cuenta") && !p.startsWith("/cuenta/conectar") },
    ...(admin ? [{ href: "/admin", label: "Administración", icon: Shield, match: (p: string) => p.startsWith("/admin") }] : []),
  ];

  const nav = (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {items.map((it) => {
        const active = it.match(path);
        return (
          <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-md border-2 px-3 font-bold no-underline ${active ? "border-ink bg-mark" : "border-transparent hover:bg-paper-2"}`}>
            <it.icon size={18} aria-hidden />
            <span className="flex-1">{it.label}</span>
            {it.dot && <span className={`h-2.5 w-2.5 flex-none rounded-full border-2 border-ink ${it.dot === "on" ? "bg-ok" : "bg-paper"}`} title={it.dot === "on" ? "Conectada" : "Sin conectar"}><span className="sr-only">{it.dot === "on" ? "Conectada" : "Sin conectar"}</span></span>}
          </Link>
        );
      })}
    </nav>
  );

  const foot = (
    <div className="border-t-2 border-ink pt-4">
      <p className="truncate text-sm font-bold">{name}</p>
      <p className="truncate text-xs text-ink-2">{email}</p>
      <div className="mt-3"><LogoutButton /></div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 flex-none flex-col justify-between gap-6 border-r-2 border-ink bg-paper-2 p-4 lg:flex">
        <div className="space-y-8"><Brand href="/dashboard" small />{nav}</div>
        {foot}
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between border-b-2 border-ink bg-paper px-4 py-2 lg:hidden">
        <Brand href="/dashboard" small />
        <button type="button" className="btn btn-sm" aria-expanded={open} aria-controls="drawer" onClick={() => setOpen(true)}><Menu size={18} aria-hidden />Menú</button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Cerrar menú" className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <div id="drawer" role="dialog" aria-modal="true" aria-label="Menú" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between gap-6 border-r-2 border-ink bg-paper-2 p-4">
            <div className="space-y-6">
              <div className="flex items-center justify-between"><Brand href="/dashboard" small /><button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={18} aria-hidden /></button></div>
              {nav}
            </div>
            {foot}
          </div>
        </div>
      )}
    </>
  );
}
