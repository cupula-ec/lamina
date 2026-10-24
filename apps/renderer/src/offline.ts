import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");

/** Entrada del reproductor autónomo: lee el deck embebido en el HTML y monta el mismo DeckPlayer del visor (sin red). */
const ENTRY = `
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { DeckPlayer } from "@lamina/engine";
import { jsonSchemaToZod, nativeResolver } from "@lamina/components";
import "@lamina/engine/engine.css";

const data = JSON.parse(document.getElementById("lamina-data").textContent);
const sandboxed = new Map(data.prov.map((p) => {
  let propsSchema;
  try { propsSchema = jsonSchemaToZod(p.propsJsonSchema); } catch { propsSchema = undefined; }
  return [p.id + "@" + p.version, { kind: "sandboxed", bundle: p.bundle, bundleHash: p.bundleHash, propsSchema }];
}));
const resolver = (ref) => nativeResolver(ref) ?? sandboxed.get(ref.componentId + "@" + ref.version);
document.title = data.deck.meta.title;
createRoot(document.getElementById("root")).render(h(DeckPlayer, { deck: data.deck, resolver }));
`;

let cached: Promise<{ js: string; css: string }> | null = null;

/** Reproductor autónomo (JS + CSS con fuentes incrustadas). Se compila una vez por proceso. */
export function buildPlayer(): Promise<{ js: string; css: string }> {
  return (cached ??= (async () => {
    const r = await esbuild.build({
      stdin: { contents: ENTRY, resolveDir: path.join(repo, "apps/renderer/src"), loader: "tsx", sourcefile: "offline-entry.tsx" },
      bundle: true, write: false, outdir: "out", format: "iife", platform: "browser", target: "es2020", minify: true, jsx: "automatic", legalComments: "none",
      define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
      loader: { ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl", ".otf": "dataurl" },
    });
    const js = r.outputFiles.find((f) => f.path.endsWith(".js"))?.text;
    const css = r.outputFiles.find((f) => f.path.endsWith(".css"))?.text;
    if (!js || !css) throw new Error("No se pudo compilar el reproductor offline");
    return { js, css };
  })().catch((e) => { cached = null; throw e; }));
}

const EXT: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg" };
const INTERNAL = /^\/api\/(assets|branding)\//;

/**
 * Descarga cada imagen interna del deck (con la URL firmada que trae) y la sustituye por una ruta relativa `assets/<n>.<ext>`.
 * Devuelve el deck reescrito y los archivos para el ZIP. Nada del resultado referencia el servidor.
 */
export async function localizeAssets(deck: unknown, fetchAsset: (url: string) => Promise<{ body: Uint8Array; type: string } | null>): Promise<{ deck: unknown; files: Record<string, Uint8Array>; missing: number }> {
  const files: Record<string, Uint8Array> = {};
  const seen = new Map<string, Promise<string>>();
  let missing = 0;
  const localize = async (v: string): Promise<string> => {
    const got = await fetchAsset(v).catch(() => null);
    if (!got) { missing++; return ""; }
    const name = `assets/${Object.keys(files).length + 1}.${EXT[got.type] ?? "bin"}`;
    files[name] = got.body;
    return name;
  };
  const walk = async (v: unknown): Promise<unknown> => {
    if (typeof v === "string" && INTERNAL.test(v)) {
      // La promesa se guarda ANTES de esperar: la misma imagen usada en varios sitios (en paralelo) se descarga una sola vez.
      if (!seen.has(v)) seen.set(v, localize(v));
      return seen.get(v);
    }
    if (Array.isArray(v)) return Promise.all(v.map(walk));
    if (v && typeof v === "object") return Object.fromEntries(await Promise.all(Object.entries(v).map(async ([k, x]) => [k, await walk(x)])));
    return v;
  };
  return { deck: await walk(deck), files, missing };
}

/** `index.html` autocontenido: estilos, reproductor y datos embebidos (abre con doble clic, sin red). */
export function offlineHtml(player: { js: string; css: string }, data: unknown): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, " ");
  const js = player.js.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Presentación</title>
<style>html,body{margin:0;height:100%;background:#0b0d12}#root{position:fixed;inset:0}${player.css}</style></head>
<body><div id="root"></div><script id="lamina-data" type="application/json">${json}</script><script>${js}</script></body></html>`;
}

const README = (title: string) => `${title}
Presentación sin conexión generada por Lámina.

Cómo usarla
1. Descomprime esta carpeta completa (no abras el archivo desde dentro del ZIP).
2. Abre index.html con tu navegador (doble clic). No necesita internet.
3. Flechas ← → para avanzar, F para pantalla completa.

No muevas index.html fuera de la carpeta: las imágenes están en assets/.
`;

export async function buildOfflineZip(opts: { title: string; deck: unknown; prov: unknown[]; fetchAsset: (url: string) => Promise<{ body: Uint8Array; type: string } | null> }): Promise<{ zip: Uint8Array; missing: number }> {
  const player = await buildPlayer();
  const { deck, files, missing } = await localizeAssets(opts.deck, opts.fetchAsset);
  const html = offlineHtml(player, { deck, prov: opts.prov });
  const zip = zipSync({ "index.html": strToU8(html), "LEAME.txt": strToU8(README(opts.title)), ...files }, { level: 6 });
  return { zip, missing };
}

