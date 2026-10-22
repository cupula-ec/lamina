import { createDb } from "./client";
import { seedInstitutions } from "./seed-institutions";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL requerido");
const { db, pool } = createDb(url, 1);
await seedInstitutions(db);
await pool.end();
console.log("instituciones sembradas");
