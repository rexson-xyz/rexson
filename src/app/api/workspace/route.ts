import { NextResponse } from "next/server";
import { allow, allowPublic, badBody, readBody, tooLarge, tooMany } from "@/lib/guard";
import { verifySession, type SignedSession } from "@/lib/auth/session";
import { getStore } from "@/lib/server/store";
import { loadReceipts, publicView, runOp, storageConfigured, type Op } from "@/lib/server/workspaces";

export const dynamic = "force-dynamic";

const H = { "cache-control": "no-store" };

/*
 * POST /api/workspace { session, op, ... } → the signed-in wallet's hosted project after the operation.
 * The session (one signed Sign-In with Ethereum message, no gas) is verified on every call; every rule runs here, not in the page.
 */
export async function POST(request: Request) {
  const store = getStore();
  if (!(await allowPublic(store, request, "ws", 60, 1500))) return tooMany();
  const body = await readBody<{ session?: SignedSession } & Op>(request, 20_000);
  if (!body.ok) return body.tooLarge ? tooLarge() : badBody();
  const s = await verifySession(body.value.session);
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: 401, headers: H });
  if (!(await allow(store, "ws-wallet", [s.address.toLowerCase()], 40, 60))) return tooMany();
  const { session: _s, ...op } = body.value;
  void _s;
  const r = await runOp(s.address, op as Op);
  const meta = { storage: storageConfigured() ? "shared" : "memory", wallet: s.address };
  if (!r.ok) return NextResponse.json({ error: r.error, ...meta }, { status: 400, headers: H });
  return NextResponse.json({ workspace: publicView(r.ws, r.ws ? await loadReceipts(s.address) : []), token: r.token ?? null, ...meta }, { headers: H });
}
