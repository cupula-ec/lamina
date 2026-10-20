import { z, type ZodType } from "zod";

/** Subconjunto de JSON Schema → Zod, para validar props de componentes provisionales (sandboxed). Lanza si usa algo no soportado. */
export function jsonSchemaToZod(s: any, depth = 0): ZodType {
  if (depth > 6 || s === null || typeof s !== "object") throw new Error("schema demasiado profundo o inválido");
  for (const k of ["$ref", "oneOf", "anyOf", "allOf", "not", "patternProperties", "if"]) if (k in s) throw new Error(`JSON Schema: "${k}" no soportado`);
  if (s.enum) {
    if (!Array.isArray(s.enum) || s.enum.length === 0 || s.enum.length > 50) throw new Error("enum inválido");
    return z.union(s.enum.map((v: unknown) => z.literal(v as string | number | boolean)) as [ZodType, ZodType]);
  }
  const t = Array.isArray(s.type) ? s.type.find((x: string) => x !== "null") : s.type;
  const nullable = Array.isArray(s.type) && s.type.includes("null");
  let out: ZodType;
  switch (t) {
    case "string": {
      let z0 = z.string().max(Math.min(s.maxLength ?? 2000, 5000));
      if (s.minLength) z0 = z0.min(s.minLength);
      out = z0;
      break;
    }
    case "number":
    case "integer": {
      let z0 = t === "integer" ? z.number().int() : z.number();
      if (typeof s.minimum === "number") z0 = z0.min(s.minimum);
      if (typeof s.maximum === "number") z0 = z0.max(s.maximum);
      out = z0;
      break;
    }
    case "boolean": out = z.boolean(); break;
    case "array": {
      let z0 = z.array(s.items ? jsonSchemaToZod(s.items, depth + 1) : z.unknown()).max(Math.min(s.maxItems ?? 100, 200));
      if (s.minItems) z0 = z0.min(s.minItems);
      out = z0;
      break;
    }
    case "object": {
      const props = s.properties ?? {};
      const req = new Set<string>(s.required ?? []);
      const shape: Record<string, ZodType> = {};
      for (const [k, v] of Object.entries(props)) {
        const c = jsonSchemaToZod(v, depth + 1);
        shape[k] = req.has(k) ? c : c.optional();
      }
      out = z.object(shape);
      break;
    }
    default: throw new Error(`JSON Schema: tipo no soportado (${String(t)})`);
  }
  return nullable ? out.nullable() : out;
}
