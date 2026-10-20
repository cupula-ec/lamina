import katex from "katex";

/** Devuelve null si el LaTeX es válido para KaTeX, o el mensaje de error. */
export function checkLatex(latex: string): string | null {
  try {
    katex.renderToString(latex, { throwOnError: true, strict: "ignore", trust: false, displayMode: true, maxExpand: 200, maxSize: 20 });
    return null;
  } catch (e) {
    return (e as Error).message.replace(/^KaTeX parse error: /, "").slice(0, 200);
  }
}

export function renderLatex(latex: string, displayMode = true): string {
  return katex.renderToString(latex, { throwOnError: false, strict: "ignore", trust: false, displayMode, output: "htmlAndMathml", maxExpand: 200 });
}
