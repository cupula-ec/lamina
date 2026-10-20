import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

export type ChangelogEntry = { date: string; title: string; body: string; file: string };

function dir() {
  const candidates = [env().CHANGELOG_DIR, path.resolve(process.cwd(), "content/changelog"), path.resolve(process.cwd(), "../../content/changelog")].filter(Boolean) as string[];
  return candidates.find((d) => fs.existsSync(d));
}

export function loadChangelog(): ChangelogEntry[] {
  const d = dir();
  if (!d) return [];
  const out: ChangelogEntry[] = [];
  for (const f of fs.readdirSync(d).filter((f) => f.endsWith(".md"))) {
    const raw = fs.readFileSync(path.join(d, f), "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) continue;
    const meta = Object.fromEntries(m[1]!.split("\n").map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
    if (!meta.date || !meta.title) continue;
    out.push({ date: meta.date, title: meta.title, body: m[2]!.trim(), file: f });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
