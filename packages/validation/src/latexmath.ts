/**
 * LaTeX → sintaxis mathjs para el verificador de igualdades: escalares con varias variables, subíndices y matrices.
 * Convención de nombres (ver `symbolKind` en math.ts): mayúscula = matriz, `vec_u` = vector columna, minúscula = escalar.
 * Devuelve null ante cualquier notación no soportada (límites, integrales, sumatorias, valores absolutos…): nunca se adivina.
 */
const FUNCS = new Set(["sin", "cos", "tan", "sec", "csc", "cot", "sinh", "cosh", "tanh", "exp", "log", "sqrt", "nthRoot", "asin", "acos", "atan", "det", "inv", "transpose", "trace"]);
const GREEK = new Set(["alpha", "beta", "gamma", "delta", "epsilon", "theta", "lambda", "mu", "sigma", "phi", "omega", "rho", "tau", "kappa"]);
/** Letras que en la práctica nombran funciones (f(x), g(x), h(x)). */
const CALLABLE = new Set(["f", "g", "h"]);
const BOLD = new Set(["mathbf", "boldsymbol", "bm", "vec", "overrightarrow"]);
const STYLE = new Set(["mathbb", "mathcal", "mathit", "mathrm", "operatorname", "text", "mathsf"]);

function matchBrace(s: string, i: number): number {
  let d = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === "{") d++;
    else if (s[k] === "}" && --d === 0) return k;
  }
  return -1;
}

const TRANSPOSE = /^(T|\\top|\\intercal|\\(?:mathsf|mathrm|text)\{T\})$/;

/** Tokens → texto, insertando `*` en las yuxtaposiciones (2a, ab, A(B+C), (A)(B), A^T B). */
function join(tokens: string[]): string | null {
  const isFn = (t: string) => FUNCS.has(t);
  const atomEnd = (t: string) => /^[0-9.]/.test(t) || (/^[A-Za-z_]/.test(t) && !isFn(t)) || t === ")";
  const atomStart = (t: string) => /^[0-9.]/.test(t) || /^[A-Za-z_]/.test(t) || t === "(";
  const out: string[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]!, prev = tokens[k - 1];
    if (prev !== undefined && isFn(prev) && t !== "(") return null;
    // f(a+b), \sigma(x): llamada a una función desconocida, no una multiplicación.
    if (prev !== undefined && t === "(" && (CALLABLE.has(prev) || GREEK.has(prev))) return null; // `\det A`, `\sin x` sin paréntesis: ambiguo
    if (prev !== undefined && atomEnd(prev) && atomStart(t)) out.push("*");
    out.push(t);
  }
  if (tokens.length && isFn(tokens[tokens.length - 1]!)) return null;
  return out.join(" ");
}

function conv(s: string): string[] | null {
  const out: string[] = [];
  let i = 0;
  const group = (): string[] | null => {
    while (s[i] === " ") i++;
    if (s[i] !== "{") return null;
    const j = matchBrace(s, i);
    if (j < 0) return null;
    const inner = conv(s.slice(i + 1, j));
    i = j + 1;
    return inner;
  };
  const rawGroup = (): string | null => {
    while (s[i] === " ") i++;
    if (s[i] !== "{") return null;
    const j = matchBrace(s, i);
    if (j < 0) return null;
    const inner = s.slice(i + 1, j).trim();
    i = j + 1;
    return inner;
  };
  while (i < s.length) {
    const c = s[i]!;
    if (c === "\\") {
      const m = s.slice(i).match(/^\\([A-Za-z]+|.)/);
      if (!m) return null;
      const name = m[1]!;
      i += m[0].length;
      if (name === "left" || name === "right") {
        // \left( \right) \left[ \right]: se tratan como paréntesis; \left| y similares no están soportados.
        const d = s[i];
        if (d === "(" || d === ")") { out.push(d); i++; }
        else if (d === "[") { out.push("("); i++; }
        else if (d === "]") { out.push(")"); i++; }
        else if (d === ".") i++;
        else return null;
        continue;
      }
      if (["," , ";", "!", " ", "quad", "qquad", "displaystyle", "limits"].includes(name)) continue;
      if (name === "cdot" || name === "times") { out.push("*"); continue; }
      if (name === "frac" || name === "dfrac") {
        const a = group(), b = group();
        if (!a || !b) return null;
        out.push("(", "(", ...a, ")", "/", "(", ...b, ")", ")");
        continue;
      }
      if (name === "sqrt") {
        if (s[i] === "[") {
          const j = s.indexOf("]", i);
          if (j < 0) return null;
          const n = conv(s.slice(i + 1, j));
          i = j + 1;
          const a = group();
          if (!n || !a) return null;
          out.push("nthRoot", "(", ...a, ",", ...n, ")");
        } else {
          const a = group();
          if (!a) return null;
          out.push("sqrt", "(", ...a, ")");
        }
        continue;
      }
      if (["sin", "cos", "tan", "sec", "csc", "cot", "sinh", "cosh", "tanh", "exp", "det"].includes(name)) { out.push(name); continue; }
      if (name === "arcsin") { out.push("asin"); continue; }
      if (name === "arccos") { out.push("acos"); continue; }
      if (name === "arctan") { out.push("atan"); continue; }
      if (name === "ln") { out.push("log"); continue; }
      if (name === "pi") { out.push("pi"); continue; }
      if (GREEK.has(name)) { out.push(name); continue; }
      if (name === "(" || name === ")" || name === "{" || name === "}") continue;
      if (BOLD.has(name) || STYLE.has(name)) {
        const g = rawGroup();
        if (g === null) return null;
        if (name === "operatorname" || name === "mathrm" || name === "text") {
          if (g === "det") { out.push("det"); continue; }
          if (g === "tr" || g === "trace") { out.push("trace"); continue; }
        }
        if (BOLD.has(name) && g === "0") { out.push("O"); continue; }
        if (/^[A-Za-z]$/.test(g)) {
          out.push(BOLD.has(name) && /[a-z]/.test(g) ? `vec_${g}` : g);
          continue;
        }
        return null;
      }
      if (name === "begin") {
        const em = s.slice(i).match(/^\{([bpBv]?matrix)\}/);
        if (!em) return null;
        const env = em[1]!;
        i += em[0].length;
        const endTag = `\\end{${env}}`;
        const j = s.indexOf(endTag, i);
        if (j < 0) return null;
        const body = s.slice(i, j);
        i = j + endTag.length;
        const rows = body.split(/\\\\/).map((r) => r.trim()).filter((r) => r.length > 0);
        if (!rows.length || rows.length > 6) return null;
        const cells: string[][] = [];
        for (const r of rows) {
          const cs = r.split("&").map((c) => c.trim());
          if (cs.length > 6) return null;
          const conv_: string[] = [];
          for (const cell of cs) {
            const t = conv(cell);
            const text = t && cell !== "" ? join(t) : null;
            if (!text) return null;
            conv_.push(text);
          }
          cells.push(conv_);
        }
        if (cells.some((r) => r.length !== cells[0]!.length)) return null;
        const lit = `[${cells.map((r) => `[${r.join(", ")}]`).join(", ")}]`;
        if (env.startsWith("v")) out.push("det", "(", lit, ")");
        else out.push("(", lit, ")");
        continue;
      }
      return null; // \lim, \int, \sum, \infty, \|…
    }
    if (c === "{") {
      const j = matchBrace(s, i);
      if (j < 0) return null;
      const inner = conv(s.slice(i + 1, j));
      if (!inner) return null;
      out.push("(", ...inner, ")");
      i = j + 1;
      continue;
    }
    if (c === "^") {
      let k = i + 1;
      while (s[k] === " ") k++;
      let inner: string, end: number;
      if (s[k] === "{") {
        const j = matchBrace(s, k);
        if (j < 0) return null;
        inner = s.slice(k + 1, j).trim(); end = j + 1;
      } else if (s[k] === "\\") {
        const mm = s.slice(k).match(/^\\[A-Za-z]+/);
        if (!mm) return null;
        inner = mm[0]; end = k + mm[0].length;
      } else { inner = s[k] ?? ""; end = k + 1; }
      if (TRANSPOSE.test(inner)) { out.push("^", "__T"); i = end; continue; }
      out.push("^");
      i++;
      continue;
    }
    if (c === "_") {
      let k = i + 1;
      while (s[k] === " ") k++;
      let sub: string, end: number;
      if (s[k] === "{") {
        const j = matchBrace(s, k);
        if (j < 0) return null;
        sub = s.slice(k + 1, j).trim(); end = j + 1;
      } else { sub = s[k] ?? ""; end = k + 1; }
      const last = out[out.length - 1];
      if (!last || !/^[A-Za-z][A-Za-z0-9_]*$/.test(last) || FUNCS.has(last) || !/^[A-Za-z0-9]{1,4}$/.test(sub)) return null;
      out[out.length - 1] = `${last}_${sub}`;
      i = end;
      continue;
    }
    if (/[0-9]/.test(c)) {
      const m = s.slice(i).match(/^[0-9]+(?:\.[0-9]+)?/)!;
      out.push(m[0]);
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z]/.test(c)) { out.push(c); i++; continue; }
    if (c === " ") { i++; continue; }
    if ("+-*/()".includes(c)) { out.push(c); i++; continue; }
    return null;
  }
  return out;
}

export function convertMath(latex: string): string | null {
  const tokens = conv(latex.trim());
  if (!tokens || !tokens.length) return null;
  return join(tokens);
}
