export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {children && <div className="max-w-[56ch] text-ink-2">{children}</div>}
      {action}
    </div>
  );
}
