import type { Db } from "@lamina/db";
import type { AiClient } from "@lamina/ai";
import type { ImageProvider, SearchProvider } from "@lamina/research";
import type { Boss } from "@lamina/jobs";
import type { Env } from "./env";

export type Ctx = {
  env: Env;
  db: Db;
  boss: Boss;
  ai: AiClient;
  search: SearchProvider[];
  /** Proveedores de imágenes (V3 §5.5); ausente = sin imágenes. */
  images?: ImageProvider[];
  log: (msg: string, extra?: Record<string, unknown>) => void;
};
