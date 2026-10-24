import { z } from "zod";
import { defineComponent } from "../define";

/* ───── resaltado ligero (sin eval ni dependencias): comentarios, cadenas, números, palabras clave ───── */
const KEYWORDS = new Set([
  "if", "else", "elif", "for", "while", "do", "return", "function", "def", "class", "const", "let", "var", "int", "float", "double", "char", "bool", "boolean", "void", "string", "String",
  "true", "false", "True", "False", "null", "None", "nil", "new", "import", "from", "export", "public", "private", "static", "in", "is", "not", "and", "or", "async", "await", "try", "catch", "except",
  "finally", "throw", "raise", "switch", "case", "break", "continue", "print", "console", "self", "this", "struct", "enum", "interface", "extends", "implements", "lambda", "yield", "with", "as", "pass", "SELECT", "FROM", "WHERE", "INSERT", "UPDATE", "DELETE", "JOIN", "ORDER", "BY", "GROUP",
]);
type Tok = { t: "kw" | "str" | "num" | "com" | "txt"; v: string };
function tokenizeLine(line: string): Tok[] {
  const out: Tok[] = [];
  const re = /(\/\/.*|#.*|--\s.*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+|.)/g;
  for (const m of line.matchAll(re)) {
    if (m[1]) out.push({ t: "com", v: m[1] });
    else if (m[2]) out.push({ t: "str", v: m[2] });
    else if (m[3]) out.push({ t: "num", v: m[3] });
    else if (m[4]) out.push({ t: KEYWORDS.has(m[4]) ? "kw" : "txt", v: m[4] });
    else out.push({ t: "txt", v: m[5]! });
  }
  return out;
}
const CodeLines = ({ code, active, dim = false }: { code: string; active?: number[]; dim?: boolean }) => (
  <pre className="lm-code-pre" data-dim={dim || undefined}>
    {code.split("\n").map((ln, i) => (
      <div key={i} className="lm-code-line" data-active={active?.includes(i + 1) ? "1" : undefined}>
        <span className="lm-code-n" aria-hidden="true">{i + 1}</span>
        <code>{tokenizeLine(ln).map((tk, k) => <span key={k} className={`lm-tok-${tk.t}`}>{tk.v}</span>)}{ln === "" ? " " : null}</code>
      </div>
    ))}
  </pre>
);

const FIT = ["visual", "main", "right", "left", "text"];
const CodeStr = z.string().min(1).max(1500);

/* ───── CodeBlock ───── */
export const CodeBlock = defineComponent({
  id: "CodeBlock",
  title: "Bloque de código",
  purpose: "Código fuente con resaltado de sintaxis, numeración y líneas destacadas.",
  useCases: ["Mostrar una función o algoritmo", "Resaltar las líneas clave", "Comparar con la salida"],
  constraints: ["code ≤ 1500 caracteres y ≤ 25 líneas legibles", "highlight = números de línea (desde 1) a destacar", "language solo informativo (python, js, java, c, sql…)"],
  fitsSlots: FIT, areas: ["programming"],
  schema: z.object({ code: CodeStr, language: z.string().max(20).default("text"), highlight: z.array(z.number().int().min(1).max(200)).max(12).default([]), title: z.string().max(80).optional(), caption: z.string().max(200).optional() }),
  examples: [{ name: "python", props: { code: "def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)", language: "python", highlight: [2, 3], title: "factorial.py" } }],
  Component: ({ props }) => (
    <figure className="lm-code">
      {props.title && <figcaption className="lm-code-title">{props.title}<span>{props.language}</span></figcaption>}
      <CodeLines code={props.code} active={props.highlight} />
      {props.caption && <p className="lm-code-caption">{props.caption}</p>}
    </figure>
  ),
});

/* ───── CodeTrace ───── */
export const CodeTrace = defineComponent({
  id: "CodeTrace",
  title: "Traza de ejecución paso a paso",
  purpose: "Muestra el código con la línea activa y el estado de las variables y la salida en cada paso, revelando un paso por avance.",
  useCases: ["Seguir un bucle", "Entender la recursión", "Depurar mentalmente un algoritmo"],
  constraints: ["Máx. 10 pasos; cada paso: line (desde 1), vars {nombre: valor}, output opcional, note ≤ 140", "stepwise=true revela un paso por avance (necesita build.steps con tantos pasos como steps.length)"],
  fitsSlots: FIT, areas: ["programming"],
  schema: z.object({
    code: CodeStr, language: z.string().max(20).default("text"),
    steps: z.array(z.object({ line: z.number().int().min(1).max(200), vars: z.record(z.string().max(30), z.union([z.string().max(60), z.number(), z.boolean()])).default({}), output: z.string().max(120).optional(), note: z.string().max(140).optional() })).min(1).max(10),
    stepwise: z.boolean().default(false),
  }),
  examples: [{ name: "suma", props: { code: "total = 0\nfor i in range(3):\n    total += i\nprint(total)", language: "python", steps: [{ line: 1, vars: { total: 0 } }, { line: 3, vars: { i: 0, total: 0 }, note: "i vale 0" }, { line: 3, vars: { i: 1, total: 1 } }, { line: 4, vars: { total: 3 }, output: "3" }], stepwise: false } }],
  Component: ({ props, ctx }) => {
    const n = props.steps.length;
    const shown = props.stepwise && ctx.revealCount != null ? Math.max(1, Math.min(n, ctx.revealCount + 1)) : n;
    const cur = props.steps[shown - 1]!;
    return (
      <div className="lm-trace">
        <CodeLines code={props.code} active={[cur.line]} />
        <aside className="lm-trace-state" aria-live="polite">
          <h4>Paso {shown} de {n}</h4>
          <dl>{Object.entries(cur.vars).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>
          {cur.output !== undefined && <pre className="lm-trace-out">{cur.output}</pre>}
          {cur.note && <p>{cur.note}</p>}
        </aside>
      </div>
    );
  },
});

/* ───── ConsoleOutput ───── */
export const ConsoleOutput = defineComponent({
  id: "ConsoleOutput",
  title: "Consola / salida",
  purpose: "Simula una terminal con comandos y su salida.",
  useCases: ["Resultado de ejecutar un programa", "Comandos de git o shell", "Errores típicos"],
  constraints: ["Máx. 12 líneas de ≤ 120 caracteres; kind: in (comando) | out | err"],
  fitsSlots: FIT, areas: ["programming"],
  schema: z.object({ lines: z.array(z.object({ text: z.string().max(120), kind: z.enum(["in", "out", "err"]).default("out") })).min(1).max(12), prompt: z.string().max(20).default("$"), title: z.string().max(60).optional() }),
  examples: [{ name: "python", props: { lines: [{ text: "python factorial.py", kind: "in" }, { text: "120", kind: "out" }], prompt: "$" } }],
  Component: ({ props }) => (
    <div className="lm-console" role="img" aria-label={props.title ?? "Salida de consola"}>
      {props.title && <div className="lm-console-title">{props.title}</div>}
      {props.lines.map((l, i) => <div key={i} className={`lm-console-line lm-console-${l.kind}`}>{l.kind === "in" ? <span className="lm-console-prompt">{props.prompt} </span> : null}{l.text}</div>)}
    </div>
  ),
});

/* ───── Flowchart ───── */
type FNode = { id: string; label: string; kind: "start" | "process" | "decision" | "end" };
type FEdge = { from: string; to: string; label?: string };
function layers(nodes: FNode[], edges: FEdge[]): string[][] {
  const depth = new Map<string, number>();
  const first = nodes.find((n) => n.kind === "start")?.id ?? nodes[0]!.id;
  depth.set(first, 0);
  const q = [first];
  while (q.length) {
    const id = q.shift()!;
    for (const e of edges) if (e.from === id && !depth.has(e.to)) { depth.set(e.to, depth.get(id)! + 1); q.push(e.to); }
  }
  let extra = Math.max(0, ...depth.values()) + 1;
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, extra++);
  const out: string[][] = [];
  for (const n of nodes) { const d = depth.get(n.id)!; (out[d] ??= []).push(n.id); }
  return out.filter(Boolean);
}
export const Flowchart = defineComponent({
  id: "Flowchart",
  title: "Diagrama de flujo",
  purpose: "Diagrama de flujo con inicio, procesos, decisiones y fin, ordenado automáticamente de arriba hacia abajo.",
  useCases: ["Algoritmo con condicionales", "Proceso de negocio", "Lógica de un programa"],
  constraints: ["Máx. 9 nodos y 12 flechas; label ≤ 36 caracteres; kind: start | process | decision | end", "Las ramas de una decisión llevan label (Sí/No)"],
  fitsSlots: FIT, areas: ["programming", "general", "humanities"],
  schema: z.object({
    nodes: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9_]{1,20}$/), label: z.string().min(1).max(36), kind: z.enum(["start", "process", "decision", "end"]).default("process") })).min(2).max(9),
    edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().max(16).optional() })).max(12),
  }).refine((p) => p.edges.every((e) => p.nodes.some((n) => n.id === e.from) && p.nodes.some((n) => n.id === e.to)), { message: "toda flecha debe unir nodos existentes" }),
  examples: [{ name: "par", props: { nodes: [{ id: "a", label: "Inicio", kind: "start" }, { id: "b", label: "¿n es par?", kind: "decision" }, { id: "c", label: "Imprimir «par»", kind: "process" }, { id: "d", label: "Imprimir «impar»", kind: "process" }, { id: "e", label: "Fin", kind: "end" }], edges: [{ from: "a", to: "b" }, { from: "b", to: "c", label: "Sí" }, { from: "b", to: "d", label: "No" }, { from: "c", to: "e" }, { from: "d", to: "e" }] } }],
  Component: ({ props, ctx }) => {
    const W = ctx.width, H = ctx.height;
    const L = layers(props.nodes, props.edges);
    const rowH = H / L.length, nw = Math.min(300, W / Math.max(...L.map((r) => r.length)) - 40), nh = Math.min(96, rowH * 0.55);
    const pos = new Map<string, { x: number; y: number }>();
    L.forEach((row, r) => row.forEach((id, c) => pos.set(id, { x: (W * (c + 0.5)) / row.length, y: rowH * (r + 0.5) })));
    const byId = new Map(props.nodes.map((n) => [n.id, n]));
    return (
      <svg className="lm-flow" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Diagrama de flujo: ${props.nodes.map((n) => n.label).join(", ")}`}>
        <defs><marker id={`ah-${ctx.slot}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--lm-ink)" /></marker></defs>
        {props.edges.map((e, i) => {
          const a = pos.get(e.from)!, b = pos.get(e.to)!;
          const back = b.y <= a.y;
          const y1 = a.y + (back ? 0 : nh / 2), y2 = b.y - (back ? 0 : nh / 2);
          const d = back ? `M${a.x + nw / 2},${a.y} C${a.x + nw},${a.y} ${b.x + nw},${b.y} ${b.x + nw / 2},${b.y}` : `M${a.x},${y1} L${b.x},${y2}`;
          return <g key={i}><path d={d} className="lm-flow-edge" markerEnd={`url(#ah-${ctx.slot})`} />{e.label && <text className="lm-plot-label" x={(a.x + b.x) / 2 + 10} y={(y1 + y2) / 2 - 6}>{e.label}</text>}</g>;
        })}
        {props.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const shape = n.kind === "decision" ? <polygon points={`${p.x},${p.y - nh / 2} ${p.x + nw / 2},${p.y} ${p.x},${p.y + nh / 2} ${p.x - nw / 2},${p.y}`} /> : <rect x={p.x - nw / 2} y={p.y - nh / 2} width={nw} height={nh} rx={n.kind === "process" ? 10 : nh / 2} />;
          return <g key={n.id} className={`lm-flow-node lm-flow-${n.kind}`}>{shape}<text x={p.x} y={p.y + 9} textAnchor="middle">{byId.get(n.id)!.label}</text></g>;
        })}
      </svg>
    );
  },
});

/* ───── DataStructure ───── */
const Cell = ({ x, y, w, h, text, sub, hi }: { x: number; y: number; w: number; h: number; text: string; sub?: string; hi?: boolean }) => (
  <g className="lm-ds-cell" data-hi={hi || undefined}><rect x={x} y={y} width={w} height={h} rx={8} /><text x={x + w / 2} y={y + h / 2 + 10} textAnchor="middle">{text}</text>{sub !== undefined && <text className="lm-ds-sub" x={x + w / 2} y={y + h + 34} textAnchor="middle">{sub}</text>}</g>
);
export const DataStructure = defineComponent({
  id: "DataStructure",
  title: "Estructura de datos",
  purpose: "Dibuja arreglos, pilas, colas, listas enlazadas, árboles binarios y grafos con sus elementos.",
  useCases: ["Explicar push/pop de una pila", "Lista enlazada", "Árbol binario de búsqueda", "Grafo y sus aristas"],
  constraints: [
    "kind: array | stack | queue | list | tree | graph; items ≤ 10 textos de ≤ 8 caracteres",
    "tree: items en orden por niveles (heap), usa \"\" para un hijo vacío; máx. 15 posiciones",
    "graph: items = nombres de nodos y edges = [[i, j], …] con índices",
    "highlight = índice a resaltar",
  ],
  fitsSlots: FIT, areas: ["programming"],
  schema: z.object({
    kind: z.enum(["array", "stack", "queue", "list", "tree", "graph"]),
    items: z.array(z.string().max(8)).min(1).max(15),
    edges: z.array(z.tuple([z.number().int().min(0).max(14), z.number().int().min(0).max(14)])).max(24).default([]),
    highlight: z.number().int().min(0).max(14).optional(),
    caption: z.string().max(200).optional(),
  }),
  examples: [{ name: "pila", props: { kind: "stack", items: ["3", "7", "1"], edges: [], highlight: 2 } }, { name: "arbol", props: { kind: "tree", items: ["8", "3", "10", "1", "6", "", "14"], edges: [] } }],
  Component: ({ props, ctx }) => {
    const W = ctx.width, H = ctx.height - (props.caption ? 56 : 0), n = props.items.length;
    let body: React.ReactNode = null;
    if (props.kind === "array" || props.kind === "queue" || props.kind === "list") {
      const gap = props.kind === "list" ? 56 : 0, w = Math.min(130, (W - 80 - gap * (n - 1)) / n), h = 104, x0 = (W - (w * n + gap * (n - 1))) / 2, y = H / 2 - h / 2;
      body = <>{props.items.map((t, i) => <g key={i}><Cell x={x0 + i * (w + gap)} y={y} w={w} h={h} text={t} sub={props.kind === "array" ? String(i) : props.kind === "queue" && i === 0 ? "frente" : props.kind === "queue" && i === n - 1 ? "final" : undefined} hi={props.highlight === i} />{props.kind === "list" && i < n - 1 && <path className="lm-flow-edge" d={`M${x0 + i * (w + gap) + w},${y + h / 2} L${x0 + (i + 1) * (w + gap)},${y + h / 2}`} markerEnd="url(#ah-ds)" />}</g>)}</>;
    } else if (props.kind === "stack") {
      const w = 260, h = Math.min(88, (H - 120) / n), x = W / 2 - w / 2;
      body = <>{props.items.map((t, i) => <Cell key={i} x={x} y={H - 60 - h * (i + 1)} w={w} h={h - 6} text={t} sub={undefined} hi={props.highlight === i} />)}<text className="lm-ds-sub" x={x + w + 24} y={H - 60 - h * n + h / 2} >← tope</text></>;
    } else if (props.kind === "tree") {
      const depth = Math.floor(Math.log2(n)) + 1, pos = (i: number) => { const d = Math.floor(Math.log2(i + 1)), k = i + 1 - 2 ** d; return { x: (W * (k + 0.5)) / 2 ** d, y: 70 + ((H - 140) * d) / Math.max(1, depth - 1) }; };
      body = <>
        {props.items.map((t, i) => { if (!t || i === 0) return null; const par = Math.floor((i - 1) / 2); if (!props.items[par]) return null; const a = pos(par), b = pos(i); return <line key={`e${i}`} className="lm-flow-edge" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />; })}
        {props.items.map((t, i) => { if (!t) return null; const p = pos(i); return <g key={i} className="lm-ds-cell" data-hi={props.highlight === i || undefined}><circle cx={p.x} cy={p.y} r={36} /><text x={p.x} y={p.y + 10} textAnchor="middle">{t}</text></g>; })}
      </>;
    } else {
      const R = Math.min(W, H) / 2 - 80, pts = props.items.map((_, i) => ({ x: W / 2 + R * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), y: H / 2 + R * Math.sin((2 * Math.PI * i) / n - Math.PI / 2) }));
      body = <>
        {props.edges.filter(([a, b]) => pts[a] && pts[b]).map(([a, b], i) => <line key={`e${i}`} className="lm-flow-edge" x1={pts[a]!.x} y1={pts[a]!.y} x2={pts[b]!.x} y2={pts[b]!.y} />)}
        {props.items.map((t, i) => <g key={i} className="lm-ds-cell" data-hi={props.highlight === i || undefined}><circle cx={pts[i]!.x} cy={pts[i]!.y} r={38} /><text x={pts[i]!.x} y={pts[i]!.y + 10} textAnchor="middle">{t}</text></g>)}
      </>;
    }
    return (
      <figure className="lm-ds">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.caption ?? `${props.kind}: ${props.items.join(", ")}`}>
          <defs><marker id="ah-ds" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--lm-ink)" /></marker></defs>
          {body}
        </svg>
        {props.caption && <figcaption>{props.caption}</figcaption>}
      </figure>
    );
  },
});
