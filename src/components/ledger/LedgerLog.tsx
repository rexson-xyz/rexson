"use client";

import { CHAIN, explorerTx } from "@/config/brand";
import { ledgerLive } from "@/config/contracts";
import { LiveBadge } from "@/components/site/PageHead";
import { useJson } from "@/lib/useJson";

/* RexsonFactLedger events from chain logs, newest first: the public change log. Hashes only; there is no fact text on chain. */

type Ev = { name: string; block: number; tx: string; logIndex: number; args: Record<string, string | number | boolean> };
type Log = { live: boolean; address: string; events: Ev[]; fromBlock: number; toBlock: number; missingBlocks: number; stopped: boolean; readAt: number };
type Snap = { block: number | null; gasPriceWei: string | null; ethUsd: { price: number; updatedAt: number } | null; ledgerCode: boolean | null; readAt: number };

const short = (v: string | number | boolean) => {
  const s = String(v);
  return /^0x[0-9a-f]{40,}$/i.test(s) ? `${s.slice(0, 10)}…${s.slice(-4)}` : s;
};

export function LedgerLog() {
  const { data: snap } = useJson<Snap>("/api/chain", 30_000);
  const { data, error, loading } = useJson<Log>(ledgerLive() ? "/api/ledger" : null, 60_000);
  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3>{CHAIN.name} right now</h3>
          <LiveBadge />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="card-solid p-4">
            <p className="micro text-[var(--muted)]">Latest block</p>
            <p className="mono mt-2 text-[22px]" data-testid="ledger-block">{snap?.block ? snap.block.toLocaleString("en-US") : "—"}</p>
          </div>
          <div className="card-solid p-4">
            <p className="micro text-[var(--muted)]">Gas price</p>
            <p className="mono mt-2 text-[22px]">{snap?.gasPriceWei ? `${(Number(snap.gasPriceWei) / 1e9).toFixed(4)} gwei` : "—"}</p>
          </div>
          <div className="card-solid p-4">
            <p className="micro text-[var(--muted)]">ETH / USD (Chainlink)</p>
            <p className="mono mt-2 text-[22px]">{snap?.ethUsd ? `$${snap.ethUsd.price.toFixed(2)}` : "—"}</p>
          </div>
        </div>
        <p className="micro mt-3 text-[var(--muted)]">Read {snap ? new Date(snap.readAt).toISOString().slice(11, 19) + " UTC" : "…"} through this site&apos;s relay.</p>
      </div>
      <div className="panel">
        <h3>Change log</h3>
        {!ledgerLive() ? (
          <p className="note warn mt-3">RexsonFactLedger is not deployed yet, so there are no events to show. Nothing here is sample data: once the owner deploys it, this table fills from the contract&apos;s own logs.</p>
        ) : loading && !data ? (
          <p className="note mt-3">Reading logs…</p>
        ) : error && !data ? (
          <p className="note bad mt-3">{error}</p>
        ) : data ? (
          <>
            <p className="micro mt-2 text-[var(--muted)]">
              Blocks {data.fromBlock.toLocaleString("en-US")}–{data.toBlock.toLocaleString("en-US")} {data.missingBlocks ? `· ${data.missingBlocks.toLocaleString("en-US")} blocks not read (RPC refused)` : "· complete"}
            </p>
            {data.events.length === 0 ? <p className="note mt-3">No events yet.</p> : null}
            <div className="scroll-x mt-3">
              <table className="tbl min-w-[680px]" data-testid="ledger-events">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Details</th>
                    <th>Block</th>
                    <th>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((e) => (
                    <tr key={`${e.tx}-${e.logIndex}`}>
                      <td className="font-medium">{e.name}</td>
                      <td className="mono text-[11.5px]">
                        {Object.entries(e.args)
                          .map(([k, v]) => `${k}=${short(v)}`)
                          .join("  ")}
                      </td>
                      <td className="mono text-[12px]">{e.block}</td>
                      <td>
                        <a className="mono text-[12px] underline" href={explorerTx(e.tx)} target="_blank" rel="noreferrer">
                          {e.tx.slice(0, 10)}…
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
