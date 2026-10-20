import { createElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import katex from "katex";

export const renderLatex = (tex: string, display = true) =>
  katex.renderToString(tex, { throwOnError: false, strict: "ignore", trust: false, displayMode: display, output: "htmlAndMathml", maxExpand: 200 });

/** Fórmula KaTeX. La salida de KaTeX con trust:false es segura para inyectar. */
export function Latex({ tex, display = true, className }: { tex: string; display?: boolean; className?: string }) {
  return createElement("span", { className: `lm-latex ${className ?? ""}`, dangerouslySetInnerHTML: { __html: renderLatex(tex, display) } });
}

const safeUrl = (u: string) => (/^(https?:|mailto:|#)/i.test(u) ? u : "");

/**
 * Markdown saneado: react-markdown NO renderiza HTML crudo (no se usa rehype-raw), los enlaces se limitan a http(s)/mailto
 * y las imágenes no se admiten. Soporta $inline$ y $$display$$ con KaTeX.
 */
export function Md({ children, className, inline }: { children: string; className?: string; inline?: boolean }) {
  return createElement(
    inline ? "span" : "div",
    { className: `lm-md ${inline ? "lm-md-inline" : ""} ${className ?? ""}` },
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, [remarkMath, { singleDollarTextMath: true }]],
        rehypePlugins: [[rehypeKatex, { throwOnError: false, strict: "ignore", trust: false, output: "htmlAndMathml" }]],
        urlTransform: safeUrl,
        disallowedElements: ["img", "script", "iframe", "style"],
        unwrapDisallowed: true,
        components: inline ? { p: ({ children }: { children?: ReactNode }) => createElement("span", null, children) } : undefined,
      } as any,
      children,
    ),
  );
}

export function ErrorCard({ kind, title, detail }: { kind: "props" | "render" | "missing" | "sandbox"; title: string; detail?: ReactNode }) {
  return createElement(
    "div",
    { className: "lm-error", "data-lamina-error": kind, role: "alert" },
    createElement("strong", null, title),
    detail ? createElement("div", { className: "lm-error-detail" }, detail) : null,
  );
}
