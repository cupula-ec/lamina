/** Geometría de curvas para los componentes de matemáticas ampliadas (V3 §5.3). Puro y determinista. */
export type Bounds = { xMin: number; xMax: number; yMin: number; yMax: number };
export type Pt = [number, number];
export type Seg = [number, number, number, number];

/** Contorno f(x, y) = 0 por marching squares (segmentos en coordenadas del dominio). */
export function implicitContours(f: (x: number, y: number) => number, b: Bounds, res = 90): Seg[] {
  const n = Math.max(8, Math.min(240, Math.floor(res)));
  const dx = (b.xMax - b.xMin) / n, dy = (b.yMax - b.yMin) / n;
  const v: number[][] = [];
  for (let j = 0; j <= n; j++) {
    const row: number[] = [];
    for (let i = 0; i <= n; i++) { let z = NaN; try { z = f(b.xMin + i * dx, b.yMin + j * dy); } catch { /* fuera de dominio */ } row.push(z); }
    v.push(row);
  }
  const lerp = (a: number, c: number) => (a === c ? 0.5 : a / (a - c));
  const out: Seg[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = v[j]![i]!, bb = v[j]![i + 1]!, c = v[j + 1]![i + 1]!, d = v[j + 1]![i]!;
    if (![a, bb, c, d].every(Number.isFinite)) continue;
    const idx = (a > 0 ? 8 : 0) | (bb > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const x0 = b.xMin + i * dx, y0 = b.yMin + j * dy;
    const top: Pt = [x0 + lerp(a, bb) * dx, y0], right: Pt = [x0 + dx, y0 + lerp(bb, c) * dy], bottom: Pt = [x0 + lerp(d, c) * dx, y0 + dy], left: Pt = [x0, y0 + lerp(a, d) * dy];
    const seg = (p: Pt, q: Pt) => out.push([p[0], p[1], q[0], q[1]]);
    switch (idx) {
      case 1: case 14: seg(left, bottom); break;
      case 2: case 13: seg(bottom, right); break;
      case 3: case 12: seg(left, right); break;
      case 4: case 11: seg(top, right); break;
      case 5: seg(left, top); seg(bottom, right); break;
      case 6: case 9: seg(top, bottom); break;
      case 7: case 8: seg(left, top); break;
      case 10: seg(top, right); seg(left, bottom); break;
    }
  }
  return out;
}

export function sampleParam(fx: (t: number) => number, fy: (t: number) => number, range: [number, number], n = 360): (Pt | null)[] {
  const pts: (Pt | null)[] = [];
  for (let i = 0; i <= n; i++) {
    const t = range[0] + ((range[1] - range[0]) * i) / n;
    let x = NaN, y = NaN;
    try { x = fx(t); y = fy(t); } catch { /* fuera de dominio */ }
    pts.push(Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null);
  }
  return pts;
}

/** Cota de los puntos finitos (con margen) para encuadrar una curva. */
export function boundsOf(pts: (Pt | null)[], pad = 0.1): Bounds {
  const f = pts.filter((p): p is Pt => !!p);
  if (!f.length) return { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
  let xMin = Math.min(...f.map((p) => p[0])), xMax = Math.max(...f.map((p) => p[0])), yMin = Math.min(...f.map((p) => p[1])), yMax = Math.max(...f.map((p) => p[1]));
  xMin = Math.min(xMin, 0); xMax = Math.max(xMax, 0); yMin = Math.min(yMin, 0); yMax = Math.max(yMax, 0);
  if (xMax - xMin < 1e-9) { xMin -= 1; xMax += 1; }
  if (yMax - yMin < 1e-9) { yMin -= 1; yMax += 1; }
  const px = (xMax - xMin) * pad, py = (yMax - yMin) * pad;
  return { xMin: xMin - px, xMax: xMax + px, yMin: yMin - py, yMax: yMax + py };
}

/** Escala con la misma proporción en x e y, centrada en el área útil. */
export function equalScale(b: Bounds, w: number, h: number, m: { l: number; r: number; t: number; b: number }) {
  const aw = w - m.l - m.r, ah = h - m.t - m.b;
  const s = Math.min(aw / (b.xMax - b.xMin), ah / (b.yMax - b.yMin));
  const ox = m.l + (aw - s * (b.xMax - b.xMin)) / 2, oy = m.t + (ah - s * (b.yMax - b.yMin)) / 2;
  return { s, sx: (x: number) => ox + (x - b.xMin) * s, sy: (y: number) => oy + (b.yMax - y) * s, ox, oy, aw: s * (b.xMax - b.xMin), ah: s * (b.yMax - b.yMin) };
}

export const pathOf = (pts: (Pt | null)[], sx: (x: number) => number, sy: (y: number) => number): string[] => {
  const out: string[] = [];
  let cur = "";
  for (const p of pts) {
    if (!p) { if (cur) out.push(cur); cur = ""; continue; }
    cur += `${cur ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`;
  }
  if (cur) out.push(cur);
  return out;
};

/** "lhs = rhs" → "(lhs) - (rhs)"; sin "=" se toma como f(x, y) = 0. */
export function toImplicit(eq: string): string {
  const parts = eq.split("=");
  if (parts.length === 1) return eq;
  if (parts.length !== 2) throw new Error("la ecuación debe tener un solo signo =");
  return `(${parts[0]}) - (${parts[1]})`;
}
