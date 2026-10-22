/** Set pequeño de iconos SVG propios (trazo, sin red ni fuentes de iconos). */
export const ICON_NAMES = ["lupa", "lampara", "advertencia", "check", "flecha", "integral", "vector", "funcion"] as const;
export type IconName = (typeof ICON_NAMES)[number];

const PATHS: Record<IconName, string[]> = {
  lupa: ["M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z", "M15.4 15.4 21 21"],
  lampara: ["M9 18h6", "M10 21h4", "M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2.2h5.2c0-1 .4-1.7 1-2.2A6 6 0 0 0 12 3z"],
  advertencia: ["M12 3.5 2.8 19.5h18.4L12 3.5z", "M12 10v4.5", "M12 17.2v.1"],
  check: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M7.6 12.6l3 3 5.8-6.4"],
  flecha: ["M4 12h15", "M13 6l6 6-6 6"],
  integral: ["M15.5 5c0-1.2-.8-2-1.9-2-1.7 0-2.2 1.3-2.4 3.2L10.6 18c-.2 2-.8 3-2.4 3-1 0-1.7-.7-1.7-1.8"],
  vector: ["M4.5 19.5 19 5", "M10.5 5H19v8.5"],
  funcion: ["M3 3v18h18", "M5.5 17c4 0 4.5-10 8-10 2.6 0 3.2 5 5.5 5"],
};

export function Icon({ name, size = 40, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`lm-icon ${className ?? ""}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
