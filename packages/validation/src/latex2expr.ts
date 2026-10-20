/** Conversión de un subconjunto de LaTeX a sintaxis mathjs. Devuelve null si algo no es convertible con seguridad. */

function matchBrace(s: string, i: number): number {
  let d = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === "{") d++;
    else if (s[k] === "}" && --d === 0) return k;
  }
  return -1;
}

function conv(s: string): string | null {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "\\") {
      const m = s.slice(i).match(/^\\([A-Za-z]+|.)/);
      if (!m) return null;
      const name = m[1]!;
      i += m[0].length;
      const group = (): string | null => {
        while (s[i] === " ") i++;
        if (s[i] !== "{") return null;
        const j = matchBrace(s, i);
        if (j < 0) return null;
        const inner = conv(s.slice(i + 1, j));
        i = j + 1;
        return inner;
      };
      switch (name) {
        case "left": case "right": case ",": case ";": case "!": case " ": case "quad": case "qquad": case "displaystyle": break;
        case "cdot": case "times": out += "*"; break;
        case "frac": case "dfrac": { const a = group(), b = group(); if (a == null || b == null) return null; out += `((${a})/(${b}))`; break; }
        case "sqrt": {
          if (s[i] === "[") { const j = s.indexOf("]", i); if (j < 0) return null; const n = conv(s.slice(i + 1, j)); i = j + 1; const a = group(); if (n == null || a == null) return null; out += `nthRoot(${a},${n})`; }
          else { const a = group(); if (a == null) return null; out += `sqrt(${a})`; }
          break;
        }
        case "sin": case "cos": case "tan": case "sec": case "csc": case "cot": case "sinh": case "cosh": case "tanh": case "exp": out += name; break;
        case "arcsin": out += "asin"; break;
        case "arccos": out += "acos"; break;
        case "arctan": out += "atan"; break;
        case "ln": out += "log"; break;
        case "pi": out += "pi"; break;
        case "(": case ")": case "{": case "}": case "|": break;
        default: return null; // \lim, \int, \sum, \log (ambiguo), \infty…
      }
      continue;
    }
    if (c === "{") {
      const j = matchBrace(s, i);
      if (j < 0) return null;
      const inner = conv(s.slice(i + 1, j));
      if (inner == null) return null;
      out += `(${inner})`;
      i = j + 1;
      continue;
    }
    if (c === "^" || c === "_") {
      if (c === "_") return null;
      out += "^";
      i++;
      continue;
    }
    if (c === "|") { return null; }
    if (/[0-9a-zA-Z.+\-*/() ]/.test(c)) { out += c; i++; continue; }
    return null;
  }
  return out;
}

export function latexToExpr(latex: string): string | null {
  const r = conv(latex.trim());
  if (r == null) return null;
  const t = r.replace(/\s+/g, " ").trim();
  if (!t || /[a-zA-Z]{2,}/.test(t.replace(/\b(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|exp|log|sqrt|nthRoot|pi|asin|acos|atan)\b/g, ""))) return null;
  // Variable permitida: solo x
  const vars = t.replace(/\b(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|exp|log|sqrt|nthRoot|pi|asin|acos|atan)\b/g, "").match(/[a-zA-Z]/g) ?? [];
  if (vars.some((v) => v !== "x" && v !== "e")) return null;
  return t;
}

/** Divide por "=" de nivel superior (fuera de llaves/paréntesis). */
export function splitTopLevelEquals(latex: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (let i = 0; i < latex.length; i++) {
    const c = latex[i]!;
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    if (c === "=" && depth === 0 && latex[i - 1] !== "\\" && !/[<>!\\]/.test(latex[i - 1] ?? "")) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim());
}
