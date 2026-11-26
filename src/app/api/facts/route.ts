import { NextResponse } from "next/server";
import { allow, allowPublic, tooMany } from "@/lib/guard";
import { asJson, asText } from "@/lib/facts/format";
import { getStore } from "@/lib/server/store";
import { assistantRead, bearer } from "@/lib/server/read";

export const dynamic = "force-dynamic";

/*
 * GET /api/facts  (Authorization: Bearer rk_<id>.<secret>)
 *   ?format=json (default) | text      ?key=launch_date,support_hours (optional filter)
 * Returns the current approved version of every fact this key's grant allows, and records a read receipt (no fact text).
 */
export async function GET(request: Request) {
  const store = getStore();
  if (!(await allowPublic(store, request, "facts", 120, 3000))) return tooMany();
  const token = bearer(request);
  if (token && !(await allow(store, "facts-key", [token.slice(0, 15)], 60, 60))) return tooMany();
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "text" ? "text" : "json";
  const only = (url.searchParams.get("key") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50);
  const r = await assistantRead(token, format, only);
  const H = { "cache-control": "no-store", "x-robots-tag": "noindex" };
  if (!r.ok) return format === "text" ? new NextResponse(`Error: ${r.error}\n`, { status: r.status, headers: { ...H, "content-type": "text/plain; charset=utf-8" } }) : NextResponse.json({ error: r.error }, { status: r.status, headers: H });
  if (format === "text") return new NextResponse(asText(r.project, r.receipt, r.facts, r.withheld) + "\n", { headers: { ...H, "content-type": "text/plain; charset=utf-8", "x-rexson-receipt": r.receipt.id } });
  return NextResponse.json({ ...asJson(r.project, r.receipt, r.facts, r.withheld), chainChecked: r.chainChecked }, { headers: { ...H, "x-rexson-receipt": r.receipt.id } });
}
