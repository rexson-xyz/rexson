import "server-only";
import { readFor, receiptItems, type ReadFact } from "@/lib/facts/model";
import { chainGate } from "@/lib/server/chaincheck";
import { recordReceipt, resolveToken } from "@/lib/server/workspaces";
import type { Receipt } from "@/lib/facts/model";

/** One assistant read: token → workspace rules → on-chain check for linked grants → receipt. Shared by /api/facts and /api/mcp. */
export type ReadOutcome =
  | { ok: true; project: string; receipt: Receipt; facts: ReadFact[]; withheld: number; chainChecked: boolean }
  | { ok: false; status: number; error: string };

export async function assistantRead(token: string | null, via: Receipt["via"], only?: string[]): Promise<ReadOutcome> {
  const hit = await resolveToken(token);
  if (!hit) return { ok: false, status: 401, error: "Unknown or wrong access key." };
  const { ws, assistantId } = hit;
  const now = Math.floor(Date.now() / 1000);
  const label = ws.assistants.find((a) => a.id === assistantId)?.label ?? assistantId;
  const gate = await chainGate(ws, assistantId);
  if (gate.linked && !gate.ok) {
    await recordReceipt(ws.owner, { at: now, assistant: assistantId, label, items: [], withheld: 0, denied: gate.error, via });
    return { ok: false, status: gate.denied ? 403 : 503, error: gate.error };
  }
  const r = readFor(ws, assistantId, now, gate.linked && gate.ok ? (k) => gate.masks.get(k) ?? 1n : undefined);
  if (!r.ok) {
    await recordReceipt(ws.owner, { at: now, assistant: assistantId, label, items: [], withheld: 0, denied: r.error, via });
    return { ok: false, status: 403, error: r.error };
  }
  const facts = only?.length ? r.facts.filter((f) => only.includes(f.key)) : r.facts;
  const receipt = await recordReceipt(ws.owner, { at: now, assistant: assistantId, label, items: receiptItems(facts), withheld: r.withheld, via });
  return { ok: true, project: ws.name, receipt, facts, withheld: r.withheld, chainChecked: gate.linked };
}

export function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}
