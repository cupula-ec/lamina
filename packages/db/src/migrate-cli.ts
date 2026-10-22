import { createDb } from "./client";
import { runMigrations } from "./migrate";
import { seedInstitutions } from "./seed-institutions";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL requerido");
const { db, pool } = createDb(url, 1);
await runMigrations(db);
await seedInstitutions(db);
await pool.end();
console.log("migraciones aplicadas");
