/** Aleatoriedad determinista: el mismo seed produce siempre el mismo dibujo (vista previa, publicada y capturas coinciden). */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export type Rand = { next: () => number; range: (a: number, b: number) => number; int: (a: number, b: number) => number; pick: <T>(xs: readonly T[]) => T; chance: (p: number) => boolean };

export function makeRand(seed: number): Rand {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: (xs) => xs[Math.floor(next() * xs.length)]!,
    chance: (p) => next() < p,
  };
}

/** Número con 1 decimal para que el SVG sea idéntico en servidor y cliente. */
export const n1 = (n: number) => String(Math.round(n * 10) / 10);

export function polyline(pts: [number, number][]): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${n1(p[0])},${n1(p[1])}`).join(" ");
}
