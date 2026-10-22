import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";

const ICON = { info: Info, ok: CheckCircle2, warn: AlertTriangle, bad: OctagonAlert };

export function Callout({ tone = "info", title, children, className = "" }: { tone?: keyof typeof ICON; title?: string; children?: React.ReactNode; className?: string }) {
  const Icon = ICON[tone];
  return (
    <div className={`callout callout-${tone} ${className}`} role={tone === "bad" ? "alert" : "status"}>
      <Icon size={20} aria-hidden />
      <div>
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
    </div>
  );
}
