import Link from "next/link";
import { Brand } from "./Brand";
import { LogoutButton } from "./LogoutButton";
import type { SessionUser } from "@/lib/session";

export function AppShell({ user, children, wide = false }: { user: SessionUser; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b-2 border-ink bg-paper">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-6">
            <Brand href="/dashboard" small />
            <nav className="flex items-center gap-4 text-sm font-bold" aria-label="Principal">
              <Link href="/dashboard" className="underline-offset-4 hover:underline">Mis presentaciones</Link>
              {user.role === "admin" && <Link href="/admin" className="underline-offset-4 hover:underline">Administración</Link>}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/cuenta" className="hidden text-ink-2 underline-offset-4 hover:underline sm:inline">{user.email}</Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className={`mx-auto px-5 py-8 ${wide ? "max-w-[1500px]" : "max-w-7xl"}`}>{children}</main>
    </div>
  );
}
