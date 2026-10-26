import React from "react";

type Modo = "cuatro" | "circunferencia" | "elipse" | "parabola" | "hiperbola";
type Props = { modo: Modo; titulo?: string };
type Pt = [number, number];
type Caso = { nombre: string; nota: string; beta: number; d: number };

const CASOS: Record<string, Caso> = {
  circunferencia: { nombre: "Circunferencia", nota: "plano ⟂ al eje", beta: 0, d: 0.5 },
  elipse: { nombre: "Elipse", nota: "inclinación < generatriz", beta: 25, d: 0.35 },
  parabola: { nombre: "Parábola", nota: "plano ∥ a una generatriz", beta: 45, d: 0.4 },
  hiperbola: { nombre: "Hipérbola", nota: "corta las dos hojas", beta: 70, d: 0.25 },
};
const ORDEN = ["circunferencia", "elipse", "parabola", "hiperbola"];
const RAD = Math.PI / 180;
const AZ = -38 * RAD;
const EL = 22 * RAD;

// Proyección ortográfica del punto (x, y, z): el eje del cono es z.
function proj(x: number, y: number, z: number): Pt {
  const xr = x * Math.cos(AZ) - y * Math.sin(AZ);
  const yr = x * Math.sin(AZ) + y * Math.cos(AZ);
  return [xr, -(z * Math.cos(EL) + yr * Math.sin(EL))];
}

function curva(beta: number, d: number): Pt[][] {
  const b = beta * RAD;
  const segs: Pt[][] = [];
  let cur: Pt[] = [];
  let primero = false;
  let ultimo = false;
  const N = 360;
  for (let i = 0; i <= N; i++) {
    const t = (-180 + i) * RAD;
    const den = Math.sin(b) * Math.cos(t) + Math.cos(b);
    const z = Math.abs(den) < 1e-6 ? 99 : d / den;
    if (Math.abs(z) <= 1) {
      if (cur.length === 0 && i === 0) primero = true;
      cur.push(proj(z * Math.cos(t), z * Math.sin(t), z));
      if (i === N) ultimo = true;
    } else if (cur.length > 0) { segs.push(cur); cur = []; }
  }
  if (cur.length > 0) segs.push(cur);
  if (segs.length > 1 && primero && ultimo) {
    const a = segs.pop() as Pt[];
    segs[0] = a.concat(segs[0] as Pt[]);
  }
  return segs;
}

function circulo(z: number): Pt[] {
  const r = Math.abs(z);
  const out: Pt[] = [];
  for (let i = 0; i <= 72; i++) out.push(proj(r * Math.cos(i * 5 * RAD), r * Math.sin(i * 5 * RAD), z));
  return out;
}

function plano(beta: number, d: number): Pt[] {
  const b = beta * RAD;
  const c: [number, number, number] = [d * Math.sin(b), 0, d * Math.cos(b)];
  const u: [number, number, number] = [Math.cos(b), 0, -Math.sin(b)];
  const E = 1.25;
  const W = 1.05;
  return [[-E, -W], [E, -W], [E, W], [-E, W]].map((p) => proj(c[0] + u[0] * p[0], c[1] + p[1], c[2] + u[2] * p[0]));
}

const path = (pts: Pt[], T: (p: Pt) => Pt) => pts.map((p, i) => { const q = T(p); return `${i === 0 ? "M" : "L"}${q[0].toFixed(1)},${q[1].toFixed(1)}`; }).join(" ");

function Panel({ clave, x, y, w, h, grande }: { clave: string; x: number; y: number; w: number; h: number; grande: boolean }) {
  const caso = CASOS[clave] as Caso;
  const alto = 26 + 12;
  const area = { w: w, h: h - alto * (grande ? 2 : 1) - 8 };
  const niveles = [-1, -0.75, -0.5, -0.25, 0.25, 0.5, 0.75, 1];
  const aros = niveles.map((z) => circulo(z));
  const gen: Pt[][] = [];
  for (let i = 0; i < 8; i++) {
    const t = i * 45 * RAD;
    gen.push([proj(Math.cos(t), Math.sin(t), 1), proj(-Math.cos(t), -Math.sin(t), -1)]);
  }
  const pl = plano(caso.beta, caso.d);
  const segs = curva(caso.beta, caso.d);
  const todos: Pt[] = [...circulo(1), ...circulo(-1), ...pl];
  const xs = todos.map((p) => p[0]);
  const ys = todos.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = Math.min(area.w / (x1 - x0), area.h / (y1 - y0)) * 0.94;
  const T = (p: Pt): Pt => [area.w / 2 + (p[0] - (x0 + x1) / 2) * k, area.h / 2 + (p[1] - (y0 + y1) / 2) * k];
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={0} y={0} width={w} height={h} rx={14} fill="var(--lm-panel)" stroke="var(--lm-rule)" strokeWidth={2} />
      <g transform={`translate(0,${4})`}>
        {aros.map((a, i) => <path key={`a${i}`} d={path(a, T)} fill="none" stroke="var(--lm-rule)" strokeWidth={1.5} opacity={0.7} />)}
        {gen.map((g, i) => <path key={`g${i}`} d={path(g, T)} fill="none" stroke="var(--lm-rule)" strokeWidth={1.5} opacity={0.7} />)}
        <path d={path(circulo(1), T)} fill="none" stroke="var(--lm-ink)" strokeWidth={2.5} />
        <path d={path(circulo(-1), T)} fill="none" stroke="var(--lm-ink)" strokeWidth={2.5} />
        <path d={`${path(pl, T)} Z`} fill="var(--lm-accent)" fillOpacity={0.2} stroke="var(--lm-accent)" strokeWidth={3} />
        {segs.map((s, i) => <path key={`c${i}`} d={path(s, T)} fill="none" stroke="var(--lm-pen)" strokeWidth={grande ? 7 : 6} strokeLinecap="round" strokeLinejoin="round" />)}
      </g>
      <text x={w / 2} y={h - 14 - (grande ? alto - 6 : 0)} textAnchor="middle" fontSize={grande ? 34 : 30} fontWeight={700} fill="var(--lm-ink)" style={{ fontFamily: "var(--lm-font-display)" }}>{caso.nombre}</text>
      {grande ? <text x={w / 2} y={h - 14} textAnchor="middle" fontSize={26} fill="var(--lm-ink)" opacity={0.8} style={{ fontFamily: "var(--lm-font-body)" }}>{caso.nota}</text> : null}
    </g>
  );
}

export default function Component({ props, size }: { props: Props; size: { width: number; height: number } }) {
  const W = size.width;
  const H = size.height;
  const pedido: string = props.modo;
  const modo: string = pedido === "cuatro" || CASOS[pedido] ? pedido : "cuatro";
  const titulo = props.titulo && props.titulo.length > 0 ? props.titulo : modo === "cuatro" ? "Las cuatro cónicas" : (CASOS[modo] as Caso).nombre;
  const cab = 56;
  const m = 14;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${titulo}: cono de doble hoja cortado por un plano`}>
      <text x={W / 2} y={38} textAnchor="middle" fontSize={34} fontWeight={700} fill="var(--lm-ink)" style={{ fontFamily: "var(--lm-font-display)" }}>{titulo}</text>
      {modo === "cuatro"
        ? ORDEN.map((c, i) => {
            const pw = (W - m * 3) / 2;
            const ph = (H - cab - m * 2) / 2;
            return <Panel key={c} clave={c} x={m + (i % 2) * (pw + m)} y={cab + Math.floor(i / 2) * (ph + m)} w={pw} h={ph} grande={false} />;
          })
        : <Panel clave={modo} x={m} y={cab} w={W - m * 2} h={H - cab - m} grande={true} />}
    </svg>
  );
}
