import type { Block, ContentDraft } from "./content";

/** Lo ya delimitado (`$…$`, `$$…$$`) y el código no se tocan. */
const SKIP = /(```[\s\S]*?```|`[^`\n]*`|\$\$[\s\S]+?\$\$|\$[^$]+?\$)/;
const ENV = /\\begin\{([a-zA-Z]+\*?)\}[\s\S]*?\\end\{\1\}/g;
const TRAIL = /[.,;:!?]+$/;
/** Comando LaTeX real: `\times`, `\alpha`… (`\$`, `\\`, `\n` o un `\` final son escapes de markdown, no matemática). */
const CMD = /\\[a-zA-Z]{2,}/;
/** Tokens sueltos que acompañan a un comando (`m\times n`): una letra (sin vocales ni «y», que son palabras en español), dígitos u operadores. */
const LETTER = /^[()[\]]*[b-df-hj-npqr-tv-xzA-Z0-9][()[\]]*$/;
const OPERATOR = /^[=+\-*/^<>|]+$/;
const EDGE = /^[*_~]+|[*_~]+$/g;

function wrapRuns(line: string): string {
  if (!CMD.test(line)) return line;
  const tokens = line.split(" ");
  const out: string[] = [];
  const mathy = (t: string, i: number) => LETTER.test(t) || (OPERATOR.test(t) && i > 0); // un operador al inicio de línea es una viñeta de lista
  let i = 0;
  while (i < tokens.length) {
    if (!CMD.test(tokens[i]!)) { out.push(tokens[i]!); i++; continue; }
    let start = out.length;
    while (start > 0 && mathy(out[start - 1]!, start - 1)) start--;
    let end = i;
    while (end + 1 < tokens.length && (CMD.test(tokens[end + 1]!) || mathy(tokens[end + 1]!, end + 1))) end++;
    let run = [...out.splice(start), ...tokens.slice(i, end + 1)].join(" ");
    // La puntuación y el énfasis de markdown (`**\alpha**`) quedan fuera de las `$`.
    const lead = /^[*_~]+/.exec(run)?.[0] ?? "";
    run = run.slice(lead.length);
    const trail = (TRAIL.exec(run)?.[0] ?? "") + (/[*_~]+$/.exec(run.replace(TRAIL, ""))?.[0] ?? "");
    const core = run.slice(0, run.length - trail.length);
    out.push(core ? `${lead}$${core}$${trail}` : `${lead}${run}`);
    i = end + 1;
  }
  return out.join(" ");
}

const unescapedDollars = (t: string) => (t.match(/(?<!\\)\$/g) ?? []).length;

/** Envuelve en `$…$` el LaTeX que la IA dejó sin delimitadores (matrices `\begin{pmatrix}`, `m\times n`, `\alpha`…). Idempotente; ante `$` desparejados no toca nada. */
export function wrapBareMath(text: string): string {
  if (!CMD.test(text) && !text.includes("\\begin{")) return text;
  if (unescapedDollars(text) % 2 === 1) return text;
  return text
    .split(SKIP)
    .map((seg, i) => {
      if (i % 2 === 1) return seg;
      const parts: string[] = [];
      let last = 0;
      for (const m of seg.matchAll(ENV)) {
        parts.push(seg.slice(last, m.index).split("\n").map(wrapRuns).join("\n"), `$${m[0]}$`);
        last = m.index + m[0].length;
      }
      parts.push(seg.slice(last).split("\n").map(wrapRuns).join("\n"));
      return parts.join("");
    })
    .join("");
}

/** Normaliza sin superar el máximo del esquema: si no cabe, se conserva el texto original. */
const W = (s: string, max = Infinity) => { const w = wrapBareMath(s); return w.length <= max ? w : s; };
const opt = (s: string | undefined, max: number) => (s === undefined ? s : W(s, max));

function normalizeBlock(b: Block): Block {
  switch (b.type) {
    case "text": return { ...b, md: W(b.md, 4000) };
    case "definition": return { ...b, md: W(b.md, 1200) };
    case "theorem": return { ...b, statement: W(b.statement, 1500), proofSketch: opt(b.proofSketch, 1500) };
    case "derivation": return { ...b, steps: b.steps.map((s) => ({ ...s, explanation: W(s.explanation, 600) })) };
    case "example": return { ...b, problem: W(b.problem, 1500), steps: b.steps.map((s) => ({ ...s, text: W(s.text, 600) })), answer: W(b.answer, 600) };
    case "table": return { ...b, headers: b.headers.map((h) => W(h, 120)), rows: b.rows.map((r) => r.map((c) => W(c, 200))), caption: opt(b.caption, 300) };
    case "formula": return { ...b, caption: opt(b.caption, 300) };
    case "graphSpec": return { ...b, caption: opt(b.caption, 300) };
    default: return b;
  }
}

/** Normaliza el texto de todos los bloques (los campos `latex` ya son LaTeX puro y no se tocan). */
export function normalizeDraftMath(draft: ContentDraft): ContentDraft {
  return {
    ...draft,
    sections: draft.sections.map((s) => ({ ...s, slidesHint: s.slidesHint.map((h) => ({ ...h, blocks: h.blocks.map(normalizeBlock) })) })),
  };
}
