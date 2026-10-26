import React from 'react';

interface NodeData {
  id: string;
  label: string;
  probability?: number;
  branches?: BranchData[];
}

interface BranchData {
  label?: string;
  probability?: number;
  child: NodeData;
}

interface Props {
  root: NodeData;
  orientation?: 'horizontal' | 'vertical';
  showProbabilities?: boolean;
  showLabels?: boolean;
  nodeRadius?: number;
  fontSize?: number;
  highlightPath?: string[];
}

type Laid = { node: NodeData; depth: number; cross: number; branch?: BranchData; from?: Laid; leaf: boolean };

const CHAR = 0.56; // ancho medio de un carácter, relativo al tamaño de fuente

const fmt = (p: number) => (Math.round(p * 1000) / 1000).toString();

export default function ProbabilityTree({ props, size }: { props: Props; size: { width: number; height: number } }) {
  const {
    root,
    orientation = 'horizontal',
    showProbabilities = true,
    showLabels = true,
    nodeRadius = 14,
    fontSize = 24,
    highlightPath = []
  } = props;
  const { width, height } = size;
  const horizontal = orientation === 'horizontal';
  const hl = new Set(highlightPath);

  // 1) Estructura: hojas repartidas por igual en el eje transversal; cada padre centrado sobre sus hijos.
  const items: Laid[] = [];
  let leafIndex = 0;
  let maxDepth = 0;
  const visit = (node: NodeData, depth: number, branch?: BranchData, from?: Laid, seen: Set<NodeData> = new Set()): Laid => {
    const me: Laid = { node, depth, cross: 0, branch, from, leaf: true };
    items.push(me);
    maxDepth = Math.max(maxDepth, depth);
    const kids = depth < 8 && !seen.has(node) ? node.branches ?? [] : [];
    if (kids.length === 0) {
      me.cross = leafIndex++;
      return me;
    }
    me.leaf = false;
    const next = new Set(seen).add(node);
    const laid = kids.map((b) => visit(b.child, depth + 1, b, me, next));
    const cs = laid.map((l) => l.cross);
    me.cross = (Math.min(...cs) + Math.max(...cs)) / 2;
    return me;
  };
  visit(root, 0);
  const leaves = Math.max(1, leafIndex);

  // 2) Geometría: se ajusta al tamaño disponible (nada de longitudes fijas que se salgan del lienzo).
  const labelFs = fontSize;
  const smallFs = fontSize * 0.78;
  const leafTexts = items.filter((i) => i.leaf);
  const leafW = Math.max(0, ...leafTexts.map((i) => (showLabels ? i.node.label.length * labelFs * CHAR : 0)));
  const pad = 24;
  const r = nodeRadius;
  const mainStart = pad + r;
  const mainEnd = horizontal ? width - pad - r - (showLabels ? leafW + r + 12 : 0) : height - pad - r - (showLabels ? labelFs * 2.6 : 0);
  const crossStart = pad + r + (horizontal ? 0 : leafW / 2);
  const crossEnd = (horizontal ? height : width) - pad - r - (horizontal ? 0 : leafW / 2);
  const mainStep = maxDepth === 0 ? 0 : Math.max(10, (mainEnd - mainStart) / maxDepth);
  const crossStep = leaves === 1 ? 0 : (crossEnd - crossStart) / (leaves - 1);
  const pos = (i: Laid) => {
    const m = mainStart + i.depth * mainStep;
    const c = leaves === 1 ? (crossStart + crossEnd) / 2 : crossStart + i.cross * crossStep;
    return horizontal ? { x: m, y: c } : { x: c, y: m };
  };

  const edges: React.ReactNode[] = [];
  const edgeTexts: React.ReactNode[] = [];
  const nodes: React.ReactNode[] = [];

  items.forEach((it, idx) => {
    const p = pos(it);
    const on = hl.has(it.node.id);
    if (it.from) {
      const q = pos(it.from);
      const onEdge = on && hl.has(it.from.node.id);
      edges.push(
        <line key={`e${idx}`} x1={q.x} y1={q.y} x2={p.x} y2={p.y}
          stroke={onEdge ? 'var(--lm-accent)' : 'var(--lm-ink)'} strokeWidth={onEdge ? 5 : 2.5} strokeLinecap="round" opacity={onEdge || hl.size === 0 ? 1 : 0.55} />
      );
      const parts: string[] = [];
      if (showLabels && it.branch?.label) parts.push(it.branch.label);
      if (showProbabilities && it.branch?.probability !== undefined) parts.push(`p = ${fmt(it.branch.probability)}`);
      if (parts.length) {
        const mx = (q.x + p.x) / 2;
        const my = (q.y + p.y) / 2;
        const text = parts.join(' · ');
        const w = text.length * smallFs * CHAR + 14;
        // etiqueta sobre la rama: en horizontal, arriba de la línea; en vertical, al costado
        const tx = horizontal ? mx : mx + (p.x >= q.x ? 1 : -1) * (w / 2 + 6);
        const ty = horizontal ? my - smallFs * 0.9 : my;
        edgeTexts.push(
          <g key={`t${idx}`}>
            <rect x={tx - w / 2} y={ty - smallFs * 0.85} width={w} height={smallFs * 1.4} rx={6} fill="var(--lm-bg)" opacity={0.92} />
            <text x={tx} y={ty + smallFs * 0.25} textAnchor="middle" fontSize={smallFs} fill="var(--lm-ink)" style={{ fontFamily: 'var(--lm-font-body)' }}>{text}</text>
          </g>
        );
      }
    }
    nodes.push(<circle key={`n${idx}`} cx={p.x} cy={p.y} r={it.leaf ? r : r * 0.8} fill={on ? 'var(--lm-accent)' : it.leaf ? 'var(--lm-plot1)' : 'var(--lm-bg)'} stroke={on ? 'var(--lm-accent2)' : 'var(--lm-ink)'} strokeWidth={2.5} />);
    if (showLabels) {
      // hoja: etiqueta a la derecha (o debajo); nodo interno: encima del punto
      const lx = it.leaf ? (horizontal ? p.x + r + 12 : p.x) : p.x;
      const ly = it.leaf ? (horizontal ? p.y + labelFs * 0.1 : p.y + r + labelFs * 1.1) : p.y - r - 10;
      nodes.push(
        <text key={`l${idx}`} x={lx} y={ly} textAnchor={it.leaf && horizontal ? 'start' : 'middle'} fontSize={labelFs} fontWeight={on ? 700 : 500} fill="var(--lm-ink)" style={{ fontFamily: 'var(--lm-font-display)' }}>
          {it.node.label}
        </text>
      );
    }
    if (showProbabilities && it.node.probability !== undefined && it.leaf) {
      const lx = horizontal ? p.x + r + 12 : p.x;
      const ly = horizontal ? p.y + labelFs * 0.1 + smallFs * 1.2 : p.y + r + labelFs * 1.1 + smallFs * 1.2;
      nodes.push(
        <text key={`p${idx}`} x={lx} y={ly} textAnchor={horizontal ? 'start' : 'middle'} fontSize={smallFs} fill="var(--lm-accent)" fontWeight={600} style={{ fontFamily: 'var(--lm-font-body)' }}>
          P = {fmt(it.node.probability)}
        </text>
      );
    }
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`Árbol de probabilidades: ${root.label}`} style={{ background: 'var(--lm-bg)', fontFamily: 'var(--lm-font-body)' }}>
      <g>{edges}</g>
      <g>{edgeTexts}</g>
      <g>{nodes}</g>
    </svg>
  );
}
