// Se ejecuta DENTRO del contenedor aislado (gVisor, sin red, rootfs de solo lectura, /work en tmpfs).
// Entrada: LAMINA_INPUT (base64 JSON). Salida: una línea "LAMINA_RESULT:<json>" por stdout.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import ts from "typescript";
import * as esbuild from "esbuild";
import { checkComponentSource } from "./astcheck.mjs";

const require = createRequire(import.meta.url);
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, ...(detail ? { detail: String(detail).slice(0, 600) } : {}) });
const NONCE = process.env.LAMINA_NONCE ?? "";
const out = (o) => { fs.writeSync(1, "LAMINA_RESULT:" + NONCE + ":" + JSON.stringify(o) + "\n"); process.exit(0); };

const input = JSON.parse(Buffer.from(process.env.LAMINA_INPUT ?? "", "base64").toString("utf8") || "{}");

// ───── Modo sonda: verifica que el aislamiento del contenedor funciona (usado en pruebas de seguridad) ─────
if (input.mode === "probe") {
  const res = {};
  const tryit = async (k, f) => { try { res[k] = await Promise.race([f(), new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 4000))]); } catch (e) { res[k] = "BLOQUEADO: " + (e.code || e.message); } };
  const net = await import("node:net");
  const tcp = (host, port) => new Promise((ok, no) => { const s = net.connect({ host, port, timeout: 3000 }, () => { s.destroy(); ok("CONECTÓ"); }); s.on("error", no); s.on("timeout", () => no(new Error("timeout"))); });
  await tryit("red_internet", () => tcp("1.1.1.1", 443));
  await tryit("red_metadata", () => tcp("169.254.169.254", 80));
  await tryit("dns", async () => (await import("node:dns/promises")).resolve4("example.com"));
  await tryit("escribir_rootfs", async () => { fs.writeFileSync("/etc/lamina-probe", "x"); return "ESCRIBIÓ"; });
  await tryit("escribir_app", async () => { fs.writeFileSync("/app/probe", "x"); return "ESCRIBIÓ"; });
  await tryit("leer_docker_sock", async () => { fs.statSync("/var/run/docker.sock"); return "VISIBLE"; });
  await tryit("leer_host_secret", async () => fs.readFileSync("/opt/lamina/.env", "utf8").slice(0, 10));
  res.env_keys = Object.keys(process.env).filter((k) => !["PATH", "NODE_VERSION", "YARN_VERSION", "HOSTNAME", "HOME", "NODE_ENV", "LAMINA_INPUT"].includes(k));
  res.uid = process.getuid?.();
  res.work_writable = (() => { try { fs.writeFileSync("/work/ok", "1"); return true; } catch { return false; } })();
  out({ probe: res });
}

const { id, source, fixtures, size } = input;
delete process.env.LAMINA_NONCE;
const work = "/work";
const fail = (name, detail) => { check(name, false, detail); out({ ok: false, checks }); };

// 1) análisis estático (segunda copia del control del worker)
const issues = checkComponentSource(source);
if (issues.length) fail("Análisis estático (AST)", issues.slice(0, 5).map((i) => `L${i.line}: ${i.message}`).join(" | "));
check("Análisis estático (AST)", true);

fs.writeFileSync(path.join(work, "Component.tsx"), source);

// 2) typecheck estricto contra el SDK
{
  const cfg = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, strict: true, noEmit: true, skipLibCheck: true, types: [], lib: ["lib.es2022.d.ts", "lib.dom.d.ts"], baseUrl: "/app", typeRoots: ["/app/node_modules/@types"], paths: { react: ["node_modules/@types/react"], "react/*": ["node_modules/@types/react/*"], "d3-scale": ["node_modules/@types/d3-scale"], "d3-shape": ["node_modules/@types/d3-shape"] } };
  const host = ts.createCompilerHost(cfg);
  const prog = ts.createProgram([path.join(work, "Component.tsx"), "/app/sdk/types.d.ts"], cfg, host);
  const diags = ts.getPreEmitDiagnostics(prog).filter((d) => d.file && d.file.fileName.endsWith("Component.tsx"));
  if (diags.length) fail("Typecheck (TypeScript estricto)", diags.slice(0, 4).map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")).join(" | "));
  check("Typecheck (TypeScript estricto)", true);
}

// 3) bundle IIFE (React incluido) con el SDK
const wrapper = `
import React from "react";
import { createRoot } from "react-dom/client";
import Component from "/work/Component.tsx";
try { for (const P of [Function.prototype, Object.getPrototypeOf(async function(){}), Object.getPrototypeOf(function*(){})]) Object.defineProperty(P, "constructor", { value: undefined, configurable: false }); } catch (e) {}
let root;
window.__laminaMount = (el, props) => { root = root || createRoot(el); root.render(React.createElement(Component, { props, size: { width: el.clientWidth || ${size?.width ?? 988}, height: el.clientHeight || ${size?.height ?? 750} } })); };
`;
let bundle;
try {
  const r = await esbuild.build({
    stdin: { contents: wrapper, resolveDir: work, loader: "tsx" }, bundle: true, write: false, format: "iife", platform: "browser", target: "es2020", minify: true, jsx: "automatic",
    alias: { "@lamina/sdk": "/app/sdk/index.tsx" }, nodePaths: ["/app/node_modules"], define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent", legalComments: "none", banner: { js: '"use strict";' },
  });
  bundle = r.outputFiles[0].text;
} catch (e) { fail("Bundle (esbuild)", e.message); }
if (bundle.length > 900_000) fail("Tamaño del bundle", `${bundle.length} bytes (máx. 900 000)`);
check("Bundle (esbuild)", true, `${(bundle.length / 1024).toFixed(0)} KB`);

// 4) render de fixtures en un DOM simulado: sin errores de consola, con contenido, sin elementos peligrosos
const { Window } = await import("happy-dom");
for (const [i, fx] of fixtures.entries()) {
  const errors = [];
  const w = new Window({ width: size?.width ?? 988, height: size?.height ?? 750, settings: { disableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, handleDisabledFileLoadingAsSuccess: true } });
  w.console.error = (...a) => errors.push(a.join(" ")); w.console.warn = (...a) => { const m = a.join(" "); if (!/quirks mode/.test(m)) errors.push("warn: " + m); };
  w.document.write(`<!doctype html><html><head></head><body><div id="root" style="width:${size?.width ?? 988}px;height:${size?.height ?? 750}px"></div></body></html>`);
  try {
    w.eval(bundle);
    w.__laminaMount(w.document.getElementById("root"), w.JSON.parse(JSON.stringify(fx)));
    await new Promise((r) => setTimeout(r, 150));
    await w.happyDOM.waitUntilComplete();
  } catch (e) { errors.push("excepción: " + e.message); }
  const html = w.document.getElementById("root").innerHTML;
  const danger = /<script|<iframe|<object|<embed|\son[a-z]+=|javascript:|<img|<a\s/i.test(html);
  check(`Fixture ${i + 1}: render sin errores`, errors.length === 0, errors.slice(0, 2).join(" | "));
  check(`Fixture ${i + 1}: produce contenido`, html.length > 40, `${html.length} bytes de HTML`);
  check(`Fixture ${i + 1}: sin elementos peligrosos`, !danger);
  await w.happyDOM.close();
}
const ok = checks.every((c) => c.ok);
out({ ok, checks, bundle: ok ? bundle : undefined, bundleHash: ok ? createHash("sha256").update(bundle).digest("hex") : undefined, bytes: bundle.length });
