import { z } from "zod";

export const BuildInput = z.object({
  id: z.string().regex(/^[A-Za-z][A-Za-z0-9]{2,40}$/),
  source: z.string().max(40_000),
  fixtures: z.array(z.record(z.string(), z.unknown())).min(1).max(4),
  size: z.object({ width: z.number().int().min(100).max(1920), height: z.number().int().min(100).max(1080) }).default({ width: 988, height: 750 }),
});
export type BuildInput = z.infer<typeof BuildInput>;

export type SandboxCheck = { name: string; ok: boolean; detail?: string };
export type BuildResult = { ok: boolean; checks: SandboxCheck[]; bundle?: string; bundleHash?: string; bytes?: number; logs?: string; timedOut?: boolean };

/** Cliente del sandbox-runner (API estrecha; el worker nunca habla con Docker). */
export async function sandboxBuild(baseUrl: string, token: string, input: BuildInput): Promise<BuildResult> {
  const res = await fetch(`${baseUrl}/v1/build`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(150_000),
  });
  if (!res.ok) throw new Error(`sandbox-runner ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as BuildResult;
}
