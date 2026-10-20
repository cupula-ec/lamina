/** Uso: pnpm --filter @lamina/web tsx scripts/create-user.ts correo@dominio.ec "Nombre" [clave] [rol] — alta manual (desarrollo / emergencias). */
import { eq } from "drizzle-orm";
import { schema } from "@lamina/db";
import { getAuth, adminCreate } from "../src/lib/auth";
import { getDb } from "../src/lib/db";

const [email, name, pw, role] = process.argv.slice(2);
if (!email || !name) throw new Error("uso: create-user <correo> <nombre> [clave] [rol]");
const password = pw ?? `Temp-${Math.random().toString(36).slice(2, 10)}!x`;
const res = await adminCreate.run({ allowed: true }, () =>
  getAuth().api.createUser({ body: { email, password, name, role: (role ?? "teacher") as "admin" } }),
);
await getDb().update(schema.userProfiles).set({ mustChangePassword: false, consentAt: new Date(), consentVersion: "dev" }).where(eq(schema.userProfiles.userId, res.user.id));
console.log(`creado ${email} clave: ${password}`);
process.exit(0);
