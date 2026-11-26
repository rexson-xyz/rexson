import { allowPublic, tooMany } from "@/lib/guard";
import { fail, ok } from "@/lib/server/respond";
import { readLedger } from "@/lib/server/ledger";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* GET /api/ledger → RexsonFactLedger events from chain logs, newest first, with the scanned range and any unread blocks. */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "ledger", 30, 600))) return tooMany();
  try {
    return ok(await readLedger("all"), 15);
  } catch (e) {
    return fail(e);
  }
}
