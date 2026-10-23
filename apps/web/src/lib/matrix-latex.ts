/** Edición visual de matrices: separa un LaTeX en trozos de texto y matrices (celdas), y lo vuelve a armar. */
export type MatrixEnv = "pmatrix" | "bmatrix" | "Bmatrix" | "vmatrix" | "Vmatrix" | "matrix";
export type Piece = { t: "text"; v: string } | { t: "matrix"; env: MatrixEnv; rows: string[][] };

const RE = /\\begin\{(p|b|B|v|V)?matrix\}([\s\S]*?)\\end\{\1?matrix\}/g;

export function parseMatrices(latex: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const m of latex.matchAll(RE)) {
    if (m.index > last) out.push({ t: "text", v: latex.slice(last, m.index) });
    // Solo se descarta la fila final vacía (`\\` de cierre): una fila a medio escribir en el editor no debe desaparecer.
    const raw = m[2]!.split(/\\\\/).map((r) => r.trim());
    while (raw.length > 1 && raw[raw.length - 1] === "") raw.pop();
    const cells = raw.map((r) => r.split("&").map((c) => c.trim()));
    const width = Math.max(...cells.map((r) => r.length));
    const rows = cells.map((r) => [...r, ...Array(width - r.length).fill("")]);
    out.push({ t: "matrix", env: `${m[1] ?? ""}matrix` as MatrixEnv, rows });
    last = m.index + m[0].length;
  }
  if (last < latex.length || !out.length) out.push({ t: "text", v: latex.slice(last) });
  return out;
}

export function serializeMatrices(pieces: Piece[]): string {
  return pieces.map((p) => (p.t === "text" ? p.v : `\\begin{${p.env}}${p.rows.map((r) => r.join(" & ")).join(" \\\\ ")}\\end{${p.env}}`)).join("");
}

export const hasMatrix = (latex: string) => parseMatrices(latex).some((p) => p.t === "matrix");

/** Normaliza a rectangular (rellena con "0") tras añadir/quitar filas o columnas. */
export function resize(rows: string[][], r: number, c: number): string[][] {
  return Array.from({ length: Math.max(1, r) }, (_, i) => Array.from({ length: Math.max(1, c) }, (_, j) => rows[i]?.[j] ?? "0"));
}

export type InstructionResult = { ok: true; latex: string; summary: string } | { ok: false; error: string };

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** `a12` también se escribe a_{12} o a_12 en LaTeX. */
function variants(tok: string): string[] {
  const m = /^([A-Za-z])(\d{1,2})$/.exec(tok);
  return m ? [`${m[1]}_{${m[2]}}`, `${m[1]}_${m[2]}`, tok] : [tok];
}
const subscripted = (tok: string) => { const m = /^([A-Za-z])(\d{1,2})$/.exec(tok); return m ? `${m[1]}_{${m[2]}}` : tok; };

/**
 * Corrección en lenguaje natural, sin IA (determinista y gratuita). Entiende:
 * «cambia a12 por a13» · «cambia la fila 2 columna 3 por 5» · «agrega una fila/columna» · «quita la última fila/columna».
 */
export function applyInstruction(latex: string, raw: string): InstructionResult {
  const text = raw.trim().replace(/[«»"“”]/g, "").replace(/\.$/, "");
  const pieces = parseMatrices(latex);
  const mi = pieces.findIndex((p) => p.t === "matrix");

  // «por/a/con» solo como palabra completa (si no, «cambiala» daría «mbiala»).
  const SEP = "(?:.*?\\s(?:por|a|con)\\s+|\\s*[=:]\\s*)";
  const cell = new RegExp(`(?:fila|f)\\s*(\\d+)\\s*(?:,|y)?\\s*(?:columna|col|c)\\s*(\\d+)${SEP}(\\S.*)$`, "i").exec(text)
    ?? new RegExp(`(?:elemento|celda|posici[oó]n)\\s*\\(?\\s*(\\d+)\\s*[,;]\\s*(\\d+)\\s*\\)?${SEP}(\\S.*)$`, "i").exec(text);
  if (cell) {
    if (mi < 0) return { ok: false, error: "Esta fórmula no tiene una matriz con celdas." };
    const [r, c, val] = [Number(cell[1]) - 1, Number(cell[2]) - 1, cell[3]!.trim()];
    const m = pieces[mi]!;
    if (m.t !== "matrix" || r < 0 || c < 0 || r >= m.rows.length || c >= m.rows[0]!.length) return { ok: false, error: `La matriz no tiene fila ${r + 1}, columna ${c + 1}.` };
    const rows = m.rows.map((row, ri) => row.map((x, ci) => (ri === r && ci === c ? val : x)));
    return { ok: true, latex: serializeMatrices(pieces.map((p, i) => (i === mi ? { ...m, rows } : p))), summary: `Fila ${r + 1}, columna ${c + 1} → ${val}` };
  }

  const add = /(?:agrega|a[ñn]ade|inserta)\s+(?:una\s+)?(fila|columna)/i.exec(text);
  const del = /(?:quita|elimina|borra)\s+(?:la\s+)?(?:[uú]ltima\s+)?(fila|columna)/i.exec(text);
  if (add || del) {
    if (/\d|primer|princip|inicio|medio|antes|despu[eé]s/i.test(text)) return { ok: false, error: "Solo puedo agregar o quitar al final de la matriz. Para otra posición usa las celdas o los botones + fila / − fila." };
    if (mi < 0) return { ok: false, error: "Esta fórmula no tiene una matriz." };
    const m = pieces[mi]! as Extract<Piece, { t: "matrix" }>;
    const isRow = (add ?? del)![1]!.toLowerCase() === "fila";
    const [R, C] = [m.rows.length, m.rows[0]!.length];
    if (del && ((isRow && R < 2) || (!isRow && C < 2))) return { ok: false, error: "La matriz no puede quedar vacía." };
    const rows = resize(m.rows, R + (isRow ? (add ? 1 : -1) : 0), C + (isRow ? 0 : add ? 1 : -1));
    return { ok: true, latex: serializeMatrices(pieces.map((p, i) => (i === mi ? { ...m, rows } : p))), summary: `${add ? "Se agregó" : "Se quitó"} una ${isRow ? "fila" : "columna"}` };
  }

  const sub = /(?:cambia|reemplaza|sustituye|corrige|pon)\s+(\S+)\s+(?:por|con|a)\s+(\S+)$/i.exec(text);
  if (sub) {
    const [from, to] = [sub[1]!, sub[2]!];
    const subs = variants(from).some((v) => v !== from);
    let out = latex, hits = 0;
    for (const v of variants(from)) {
      out = out.replace(new RegExp(`(?<![A-Za-z0-9_\\\\])${esc(v)}(?![A-Za-z0-9_])`, "g"), () => { hits++; return subs ? subscripted(to) : to; });
    }
    if (!hits) return { ok: false, error: `No encontré «${from}» en la fórmula.` };
    return { ok: true, latex: out, summary: `«${from}» → «${to}» (${hits} ${hits === 1 ? "vez" : "veces"})` };
  }
  return { ok: false, error: "No entendí el cambio. Prueba: «cambia a12 por a13», «cambia fila 2 columna 3 por 5» o «agrega una fila»." };
}
