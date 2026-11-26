import "server-only";
import { decodeEventLog } from "viem";
import { CONTRACTS, ledgerLive } from "@/config/contracts";
import { LEDGER_ABI } from "@/lib/abi";
import { blocksMissing, scanBack } from "@/lib/logscan";
import { headBlock, logReader, memo, type RawLog } from "@/lib/server/chainread";

/* The public change log of RexsonFactLedger, from its own events (newest first). Nothing here is sample data. */

export type LedgerEvent = { name: string; block: number; tx: string; logIndex: number; args: Record<string, string | number | boolean> };
export type LedgerLog = { live: boolean; address: string; events: LedgerEvent[]; fromBlock: number; toBlock: number; missingBlocks: number; stopped: boolean; readAt: number };

const plain = (v: unknown): string | number | boolean => (typeof v === "bigint" ? v.toString() : typeof v === "number" || typeof v === "boolean" ? v : String(v));

async function scan(): Promise<LedgerLog> {
  if (!ledgerLive()) return { live: false, address: "", events: [], fromBlock: 0, toBlock: 0, missingBlocks: 0, stopped: false, readAt: Date.now() };
  const head = await headBlock();
  const res = await scanBack<RawLog>(logReader({ address: CONTRACTS.ledger, topics: [] }), CONTRACTS.block || Math.max(0, head - 5_000_000), head, { maxCalls: 30 });
  const events: LedgerEvent[] = [];
  for (const l of res.logs) {
    try {
      const d = decodeEventLog({ abi: LEDGER_ABI, data: l.data as `0x${string}`, topics: l.topics as [`0x${string}`, ...`0x${string}`[]] });
      events.push({ name: d.eventName ?? "?", block: Number(BigInt(l.blockNumber)), tx: l.transactionHash, logIndex: Number(BigInt(l.logIndex)), args: Object.fromEntries(Object.entries((d.args ?? {}) as Record<string, unknown>).map(([k, v]) => [k, plain(v)])) });
    } catch {
      // not one of ours
    }
  }
  events.sort((a, b) => b.block - a.block || b.logIndex - a.logIndex);
  return { live: true, address: CONTRACTS.ledger, events: events.slice(0, 300), fromBlock: res.fromBlock, toBlock: res.toBlock, missingBlocks: blocksMissing(res.gaps), stopped: res.stopped, readAt: Date.now() };
}

export const readLedger = memo(15_000, () => scan(), 4);
