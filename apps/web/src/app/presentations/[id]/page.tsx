import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { requireOwner } from "@/lib/guard";
import { pageFor } from "@/lib/stages";

export const dynamic = "force-dynamic";

export default async function Hub({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const p = await requireOwner(id, user.id).catch(() => null);
  if (!p) notFound();
  redirect(pageFor(p.id, p.stage, p.pendingJob?.name));
}
