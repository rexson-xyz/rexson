"use client";

import { useJson } from "@/lib/useJson";
import { ledgerLive } from "@/config/contracts";

/* The closing LED counters (MOTION.txt 11), fed by live chain reads: the latest Robinhood Chain block and the ledger's event count. */

type Snap = { block: number | null; gasPriceWei: string | null; readAt: number };
type Log = { live: boolean; events: unknown[] };

export function Counters() {
  const { data } = useJson<Snap>("/api/chain", 15_000);
  const { data: log } = useJson<Log>(ledgerLive() ? "/api/ledger" : null, 60_000);
  const gwei = data?.gasPriceWei ? (Number(data.gasPriceWei) / 1e9).toFixed(4) : null;
  return (
    <div className="flex flex-wrap items-end justify-center gap-6">
      <div className="counter" style={{ transform: "rotate(-4deg)" }}>
        <div className="digits" data-testid="counter-gas">{gwei ?? "—"}</div>
        <small>gas price, gwei · live</small>
      </div>
      <div className="counter hot" style={{ transform: "rotate(3deg)" }}>
        <div className="digits" data-testid="counter-block">{data?.block ? data.block.toLocaleString("en-US") : "—"}</div>
        <small>{ledgerLive() ? `latest block · ledger events ${log ? log.events.length : "…"}` : "latest Robinhood Chain block · live"}</small>
      </div>
    </div>
  );
}
