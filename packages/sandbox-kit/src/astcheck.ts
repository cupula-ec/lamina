import ts from "typescript";

/**
 * Análisis estático del TSX generado por IA (primera barrera; la segunda es el contenedor aislado y la tercera el iframe).
 * Solo se permiten imports de "react" y "@lamina/sdk" y se prohíben identificadores/propiedades de acceso a red, global, DOM o eval.
 */
export const ALLOWED_IMPORTS = new Set(["react", "react/jsx-runtime", "@lamina/sdk"]);
const FORBIDDEN_IDENTS = new Set([
  "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "eval", "Function", "window", "document", "globalThis", "self", "top", "parent", "frames",
  "localStorage", "sessionStorage", "indexedDB", "navigator", "location", "history", "require", "process", "module", "exports", "importScripts",
  "Worker", "SharedWorker", "ServiceWorker", "postMessage", "setTimeout", "setInterval", "requestAnimationFrame", "queueMicrotask", "Proxy", "Reflect",
  "WebAssembly", "Atomics", "SharedArrayBuffer", "Image", "Audio", "open", "alert", "confirm", "prompt", "constructor", "__proto__", "prototype",
  "location", "href", "assign", "replace", "origin", "cookie", "opener", "contentWindow", "contentDocument", "innerHTML", "outerHTML", "srcdoc",
]);
/**
 * Nombres que solo son peligrosos como GLOBALES del navegador (`top.location`, `open(...)`, `new Image()`). Si el código los declara él mismo
 * (`const origin = {x:0,y:0}`, un parámetro `top`, una función `replace`) el identificador se resuelve a una variable local y es inofensivo.
 * Se decide con el binder de TypeScript sin librerías (`noLib`): un identificador sin declaración en el archivo es un global.
 */
const SOFT_IDENTS = new Set(["top", "parent", "frames", "self", "open", "origin", "replace", "assign", "location", "history", "alert", "confirm", "prompt", "Image", "Audio", "href", "cookie", "opener", "name"]);

function localResolver(sf: ts.SourceFile) {
  const host: ts.CompilerHost = {
    getSourceFile: (f) => (f === sf.fileName ? sf : undefined), getDefaultLibFileName: () => "lib.d.ts", writeFile: () => {}, getCurrentDirectory: () => "/",
    getCanonicalFileName: (f) => f, useCaseSensitiveFileNames: () => true, getNewLine: () => "\n", fileExists: (f) => f === sf.fileName, readFile: () => undefined,
  };
  const program = ts.createProgram([sf.fileName], { noLib: true, noResolve: true, types: [], jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }, host);
  const checker = program.getTypeChecker();
  return (id: ts.Identifier): boolean => {
    const sym = ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id ? checker.getShorthandAssignmentValueSymbol(id.parent) : checker.getSymbolAtLocation(id);
    return !!sym?.declarations?.length && sym.declarations.every((d) => d.getSourceFile() === sf);
  };
}

/** Clave de acceso por corchetes permitida: número, identificador o aritmética sin cadenas (`values[i + 1]`). */
function isSafeIndex(a: ts.Expression): boolean {
  if (ts.isNumericLiteral(a) || ts.isIdentifier(a)) return true;
  if (ts.isParenthesizedExpression(a)) return isSafeIndex(a.expression);
  if (ts.isPrefixUnaryExpression(a)) return isSafeIndex(a.operand);
  if (ts.isBinaryExpression(a)) return [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken].includes(a.operatorToken.kind) && isSafeIndex(a.left) && isSafeIndex(a.right);
  return false;
}

const FORBIDDEN_JSX_TAGS = new Set(["script", "iframe", "object", "embed", "link", "meta", "base", "form", "a", "img", "video", "audio", "source", "style", "foreignObject", "use", "image"]);
const FORBIDDEN_ATTRS = new Set(["dangerouslySetInnerHTML", "href", "src", "srcSet", "srcDoc", "action", "formAction", "xlinkHref", "ref"]);

export type AstIssue = { line: number; message: string };

export function checkComponentSource(source: string): AstIssue[] {
  const issues: AstIssue[] = [];
  if (source.length > 40_000) return [{ line: 1, message: "El componente supera 40 000 caracteres" }];
  const sf = ts.createSourceFile("Component.tsx", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const bad = (n: ts.Node, message: string) => issues.push({ line: at(n), message });
  let hasDefault = false;
  let resolver: ((id: ts.Identifier) => boolean) | undefined;
  const isLocal = (id: ts.Identifier) => (resolver ??= localResolver(sf))(id);

  const visit = (n: ts.Node): void => {
    if (n.kind === ts.SyntaxKind.ThisKeyword) {
      let p: ts.Node | undefined = n.parent, inClass = false;
      while (p) { if (ts.isClassLike(p)) { inClass = true; break; } p = p.parent; }
      if (!inClass) bad(n, "`this` no permitido (usa funciones puras con parámetros)");
    } else if (ts.isComputedPropertyName(n)) bad(n, "Nombres de propiedad computados no permitidos");
    else if (ts.isPropertyAccessExpression(n) && FORBIDDEN_IDENTS.has(n.name.text) && !["top", "left", "right", "bottom", "replace", "assign", "origin"].includes(n.name.text) ) bad(n, `Acceso a propiedad prohibido: .${n.name.text}`);
    else if (ts.isImportDeclaration(n)) {
      const spec = (n.moduleSpecifier as ts.StringLiteral).text;
      if (!ALLOWED_IMPORTS.has(spec)) bad(n, `Import no permitido: "${spec}" (solo "react" y "@lamina/sdk")`);
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier) bad(n, "re-export de módulos no permitido");
    else if (ts.isImportEqualsDeclaration(n)) bad(n, "import = no permitido");
    else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) bad(n, "import() dinámico no permitido");
    else if (ts.isIdentifier(n) && FORBIDDEN_IDENTS.has(n.text) && !(SOFT_IDENTS.has(n.text) && isLocal(n))) {
      // permite nombres de propiedad de objetos propios (p. ej. { top: 10 }) y de acceso (a.top) pero no usos libres
      const p = n.parent;
      const isPropName = (ts.isPropertyAssignment(p) && p.name === n && !["location", "href", "constructor", "__proto__", "prototype"].includes(n.text)) || (ts.isPropertyAccessExpression(p) && p.name === n && !["constructor", "prototype", "__proto__"].includes(n.text)) || (ts.isShorthandPropertyAssignment(p) && false)
        || (ts.isPropertySignature(p) && p.name === n) || (ts.isJsxAttribute(p) && p.name === n) || (ts.isTypeReferenceNode(p)) || (ts.isParameter(p) && p.name === n && false);
      if (!isPropName || ["constructor", "__proto__", "prototype"].includes(n.text)) bad(n, `Identificador prohibido: ${n.text}`);
    } else if (ts.isElementAccessExpression(n)) {
      const a = n.argumentExpression;
      if (ts.isStringLiteralLike(a)) bad(n, FORBIDDEN_IDENTS.has(a.text) ? `Acceso por cadena prohibido: ["${a.text}"]` : "Acceso por cadena no permitido: usa la propiedad directa");
      else if (!isSafeIndex(a)) bad(n, "Acceso computado no permitido (el índice debe ser un número o una operación aritmética)");
    } else if (ts.isTemplateExpression(n) && n.parent && ts.isElementAccessExpression(n.parent)) bad(n, "Acceso computado por plantilla no permitido");
    else if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText(sf);
      if (FORBIDDEN_JSX_TAGS.has(tag)) bad(n, `Elemento JSX prohibido: <${tag}>`);
      for (const a of n.attributes.properties) {
        if (ts.isJsxSpreadAttribute(a)) { bad(a, "spread de atributos JSX no permitido"); continue; }
        const name = a.name.getText(sf);
        if (FORBIDDEN_ATTRS.has(name)) bad(a, `Atributo prohibido: ${name}`);
        if (/^on[A-Z]/.test(name)) bad(a, `Manejadores de eventos no permitidos (${name}): los componentes son estáticos`);
      }
    } else if (ts.isTaggedTemplateExpression(n) && ts.isIdentifier(n.tag) && FORBIDDEN_IDENTS.has(n.tag.text)) bad(n, "plantilla etiquetada prohibida");
    else if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && ["Function", "Worker", "WebSocket", "Proxy"].includes(n.expression.text)) bad(n, `new ${n.expression.text} prohibido`);
    else if (ts.isExportAssignment(n) && !n.isExportEquals) hasDefault = true;
    else if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) hasDefault = true;
    else if (ts.isStringLiteralLike(n) && /^\s*(https?:|\/\/|data:|javascript:)/i.test(n.text)) bad(n, "URLs en cadenas no permitidas");
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!hasDefault) issues.push({ line: 1, message: "Falta `export default function Component(...)`" });
  return issues;
}
