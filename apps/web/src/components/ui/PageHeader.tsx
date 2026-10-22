import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PageHeader({ title, lead, back, actions, children }: { title: React.ReactNode; lead?: React.ReactNode; back?: { href: string; label: string }; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-8">
      {back && <Link href={back.href} className="back-link inline-flex items-center gap-1"><ArrowLeft size={14} aria-hidden />{back.label}</Link>}
      <div className={`flex flex-wrap items-end justify-between gap-4 ${back ? "mt-3" : ""}`}>
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold">{title}</h1>
          {lead && <p className="mt-1 max-w-[62ch] text-ink-2">{lead}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
