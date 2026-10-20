import { env } from "./env";

const REPO = process.env.GITHUB_REPO ?? "cupula-ec/lamina";

async function gh(path: string, init: RequestInit = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN no configurado");
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json", "user-agent": "lamina-bot", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

/** Abre un PR con los archivos del componente promovido. Devuelve la URL del PR. */
export async function openComponentPr(opts: { id: string; version: string; files: Record<string, string>; purpose: string; presentation?: string }): Promise<string> {
  const base = (await gh("/git/ref/heads/main")).object.sha as string;
  const branch = `componente/${opts.id.toLowerCase()}-${opts.version}-${Date.now().toString(36)}`;
  await gh("/git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base }) });
  for (const [name, content] of Object.entries(opts.files)) {
    await gh(`/contents/community/components/${opts.id}/${name}`, {
      method: "PUT", body: JSON.stringify({ message: `feat(componentes): ${opts.id} v${opts.version} (${name})`, content: Buffer.from(content).toString("base64"), branch }),
    });
  }
  const pr = await gh("/pulls", {
    method: "POST",
    body: JSON.stringify({
      title: `Componente ${opts.id} v${opts.version} (propuesto desde Lámina)`, head: branch, base: "main",
      body: `Componente generado por el especialista de Lámina y aprobado por un administrador (${env().APP_URL}).\n\n**Propósito:** ${opts.purpose}\n\nIncluye el código fuente (TSX, ejecutado en iframe aislado), el manifest con el JSON Schema de props y los fixtures usados en las pruebas. Revisa antes de fusionar; la aprobación humana y las pruebas automáticas preceden a su uso general.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`,
    }),
  });
  return pr.html_url as string;
}
