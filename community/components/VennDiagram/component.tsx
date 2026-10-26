import React from 'react';

export default function VennDiagram({
  props,
  size
}: {
  props: {
    setA: string;
    setB: string;
    onlyA: number;
    onlyB: number;
    intersection: number;
    neither: number;
  };
  size: { width: number; height: number };
}) {
  const { setA, setB, onlyA, onlyB, intersection, neither } = props;
  const { width, height } = size;
  const total = onlyA + onlyB + intersection + neither;

  // Universo (rectángulo) con el círculo A y B dentro; abajo se muestra el «fuera de ambos».
  const pad = 20;
  const box = { x: pad, y: pad, w: width - pad * 2, h: height - pad * 2 };
  const radius = Math.min(box.w * 0.3, box.h * 0.3);
  const cy = box.y + box.h * 0.52;
  const offset = radius * 0.6; // mitad de la distancia entre centros
  const ax = width / 2 - offset;
  const bx = width / 2 + offset;

  const fontSize = Math.max(24, Math.min(width, height) * 0.05);
  const setFs = Math.max(20, Math.min(width, height) * 0.038);
  const labelMax = offset * 3 - 40; // cada nombre se desplaza hacia fuera: ancho útil por lado sin pisar al otro
  const wrap = (txt: string): string[] => {
    const words = txt.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && next.length * setFs * 0.6 > labelMax) { lines.push(cur); cur = w; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  };

  // Centros de las regiones: parte exclusiva de cada círculo y lente de la intersección.
  const onlyAX = ax - (radius - offset);
  const onlyBX = bx + (radius - offset);

  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)} %` : '');
  const subFs = fontSize * 0.5;

  const Count = ({ x, y, n, bold }: { x: number; y: number; n: number; bold?: boolean }) => (
    <g>
      <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fontWeight={bold ? 700 : 600} fill="var(--lm-ink)" style={{ fontFamily: 'var(--lm-font-display)' }}>{n}</text>
      {total > 0 ? (
        <text x={x} y={y + fontSize * 0.85} textAnchor="middle" dominantBaseline="middle" fontSize={subFs} fill="var(--lm-muted)" style={{ fontFamily: 'var(--lm-font-body)' }}>{pct(n)}</text>
      ) : null}
    </g>
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ background: 'var(--lm-bg)', fontFamily: 'var(--lm-font-body)' }}
      role="img"
      aria-label={`Diagrama de Venn: ${setA} (solo ${onlyA}), ${setB} (solo ${onlyB}), ambos ${intersection}, ninguno ${neither}`}
    >
      {/* Universo */}
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={14} fill="none" stroke="var(--lm-rule)" strokeWidth={2.5} />
      <text x={box.x + 16} y={box.y + box.h - 18} fontSize={fontSize * 0.7} fill="var(--lm-muted)" style={{ fontFamily: 'var(--lm-font-body)' }}>
        Fuera de ambos:
      </text>
      <text x={box.x + box.w - 16} y={box.y + box.h - 18} textAnchor="end" fontSize={fontSize} fontWeight={700} fill="var(--lm-ink)" style={{ fontFamily: 'var(--lm-font-display)' }}>
        {neither}
      </text>

      {/* Círculos */}
      <circle cx={ax} cy={cy} r={radius} fill="var(--lm-plot1)" fillOpacity={0.3} stroke="var(--lm-plot1)" strokeWidth={3.5} />
      <circle cx={bx} cy={cy} r={radius} fill="var(--lm-plot2)" fillOpacity={0.3} stroke="var(--lm-plot2)" strokeWidth={3.5} />

      {/* Nombres de los conjuntos (en varias líneas si hace falta) */}
      {[{ t: setA, x: ax - offset * 0.5 }, { t: setB, x: bx + offset * 0.5 }].map(({ t, x }, k) => {
        const lines = wrap(t);
        return (
          <text key={k} x={x} y={cy - radius - 14 - (lines.length - 1) * setFs * 1.15} textAnchor="middle" fontSize={setFs} fontWeight={700} fill="var(--lm-ink)" style={{ fontFamily: 'var(--lm-font-display)' }}>
            {lines.map((l, i) => <tspan key={i} x={x} dy={i === 0 ? 0 : setFs * 1.15}>{l}</tspan>)}
          </text>
        );
      })}

      {/* Regiones */}
      <Count x={onlyAX} y={cy} n={onlyA} />
      <Count x={width / 2} y={cy} n={intersection} bold />
      <Count x={onlyBX} y={cy} n={onlyB} />
    </svg>
  );
}
