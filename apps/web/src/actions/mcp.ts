"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { act, type Result } from "@/lib/guard";
import { requireAdminApi } from "@/lib/session";
import { revokeConnection, setMcpEnabled } from "@/lib/mcp-access";
import { LaminaError } from "@lamina/contracts";
import { schema } from "@lamina/db";

const ClientId = z.string().min(1).max(500);

/** El docente revoca una aplicación autorizada: el acceso se corta de inmediato. */
export async function revokeMyConnectionAction(input: { clientId: string }) {
  return act(async (u) => {
    await revokeConnection(getDb(), u.id, ClientId.parse(input.clientId));
    revalidatePath("/conectar");
  });
}

async function adm<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { await requireAdminApi(); return { ok: true, data: await fn() }; }
  catch (e) {
    if (e instanceof LaminaError) return { ok: false, error: e.message, code: e.code };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    console.error("[admin-mcp]", e);
    return { ok: false, error: "Error inesperado" };
  }
}

export async function revokeConnectionAdminAction(input: { userId: string; clientId: string }) {
  return adm(async () => {
    const v = z.object({ userId: z.string().min(1).max(200), clientId: ClientId }).parse(input);
    await revokeConnection(getDb(), v.userId, v.clientId);
    revalidatePath("/admin");
  });
}

export async function setMcpEnabledAction(input: { enabled: boolean }) {
  return adm(async () => {
    const enabled = z.boolean().parse(input.enabled);
    await setMcpEnabled(getDb(), enabled);
    await getDb().insert(schema.events).values({ name: enabled ? "mcp.enabled" : "mcp.disabled", data: {} });
    revalidatePath("/admin");
    revalidatePath("/conectar");
  });
}
