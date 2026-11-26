"use client";

import { useCallback, useEffect, useState } from "react";
import { decodeEventLog, encodeFunctionData, keccak256, stringToBytes, type Hex } from "viem";
import { CHAIN, explorerTx } from "@/config/brand";
import { CONTRACTS, ledgerLive } from "@/config/contracts";
import { LEDGER_ABI } from "@/lib/abi";
import { explain, read, readMany, rpcCall, simulate, waitForReceipt } from "@/lib/client";
import { assistantKeyHash, current, factKeyHash, type Workspace } from "@/lib/facts/model";
import { bitWords } from "@/lib/facts/bits";
import { merkleRoot, receiptLeaf } from "@/lib/facts/merkle";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { CopyChip } from "@/components/site/CaCopy";
import { useRun } from "@/components/app/Views";

/*
 * The on-chain change log for a hosted project (RexsonFactLedger). Every write is checked with the contract's own view first
 * (checkPropose / checkApprove / checkRead), simulated with eth_call, then signed by the owner's wallet. Only hashes go on chain.
 */

type ChainFact = { version: number; contentHash: Hex; retired: boolean };
const L = () => CONTRACTS.ledger as `0x${string}`;
const groupsMask = (groups: number[]) => groups.reduce((m, g) => m | (1n << BigInt(g)), 0n);

async function logsOf(hash: string) {
  const r = await rpcCall<{ logs: { address: string; topics: Hex[]; data: Hex }[] } | null>("eth_getTransactionReceipt", [hash]);
  return (r?.logs ?? []).filter((l) => l.address.toLowerCase() === L().toLowerCase()).flatMap((l) => {
    try {
      return [decodeEventLog({ abi: LEDGER_ABI, data: l.data, topics: l.topics as [Hex, ...Hex[]] })];
    } catch {
      return [];
    }
  });
}

export function ChainPanel({ ws, hosted, link }: { ws: Workspace; hosted: boolean; link: { chain(project: number | null): Promise<void>; grant(id: string, grant: number | null): Promise<void> } }) {
  const { address, sendTransaction } = useWallet();
  const { open } = useWalletModal();
  const { err, ok, run } = useRun();
  const [facts, setFacts] = useState<Record<string, ChainFact>>({});
  const [owner, setOwner] = useState<string | null>(null);
  const [paused, setPaused] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const project = ws.chain?.project ?? null;
  const keys = Object.keys(ws.facts).sort();

  const refresh = useCallback(async () => {
    if (!ledgerLive() || !project) return;
    const p = (await read<{ owner: string; paused: boolean }>({ to: L(), abi: LEDGER_ABI, fn: "projectOf", args: [BigInt(project)] }).catch(() => null)) as { owner: string; paused: boolean } | null;
    setOwner(p?.owner ?? null);
    setPaused(p?.paused ?? null);
    const got = await readMany(keys.map((k) => ({ to: L(), abi: LEDGER_ABI, fn: "factOf", args: [BigInt(project), factKeyHash(k)] })));
    const map: Record<string, ChainFact> = {};
    keys.forEach((k, i) => {
      const v = got[i] as { version: number; contentHash: Hex; retired: boolean } | null;
      if (v) map[k] = { version: Number(v.version), contentHash: v.contentHash, retired: v.retired };
    });
    setFacts(map);
  }, [project, keys.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh();
  }, [refresh]);

  const send = async (label: string, data: Hex) => {
    if (!address) {
      open();
      throw new Error("Connect the owner's wallet first.");
    }
    setBusy(label);
    try {
      await simulate(address, L(), data);
      const hash = await sendTransaction({ to: L(), data });
      setLastTx(hash);
      const r = await waitForReceipt(hash);
      if (!r.ok) throw new Error("The transaction reverted.");
      return hash;
    } catch (e) {
      throw new Error(explain(e));
    } finally {
      setBusy(null);
    }
  };

  const openProject = () =>
    run(async () => {
      const hash = await send("open", encodeFunctionData({ abi: LEDGER_ABI, functionName: "openProject", args: [keccak256(stringToBytes(ws.name)), true] }));
      const ev = (await logsOf(hash)).find((e) => e.eventName === "ProjectOpened");
      const id = ev ? Number((ev.args as unknown as { project: bigint }).project) : null;
      if (!id) throw new Error("Opened, but the project number could not be read from the receipt.");
      await link.chain(id);
    }, "Project opened on chain and linked.");

  const anchorFacts = () =>
    run(async () => {
      if (!project || !address) throw new Error("Link a project first.");
      const todo = keys.filter((k) => {
        const c = current(ws.facts[k]);
        return c && !ws.facts[k].retired && facts[k]?.contentHash?.toLowerCase() !== c.hash.toLowerCase();
      });
      if (!todo.length) throw new Error("Every approved fact already matches the chain.");
      const drafts: bigint[] = [];
      for (const k of todo.slice(0, 20)) {
        const f = ws.facts[k];
        const c = current(f)!;
        const base = facts[k]?.version ?? 0;
        const bits = (await read<bigint>({ to: L(), abi: LEDGER_ABI, fn: "checkPropose", args: [address, BigInt(project), factKeyHash(k), base, c.hash, f.visibility] })) as bigint;
        if (bits !== 0n) throw new Error(`${k}: ${bitWords(bits).join(", ")}`);
        const hash = await send(`propose ${k}`, encodeFunctionData({ abi: LEDGER_ABI, functionName: "propose", args: [BigInt(project), factKeyHash(k), base, c.hash, f.group, f.visibility] }));
        const ev = (await logsOf(hash)).find((e) => e.eventName === "DraftProposed");
        if (ev) drafts.push((ev.args as unknown as { draft: bigint }).draft);
      }
      const checks = (await read<readonly bigint[]>({ to: L(), abi: LEDGER_ABI, fn: "checkApprove", args: [address, BigInt(project), drafts] })) as readonly bigint[];
      const badAt = checks.findIndex((b) => b !== 0n);
      if (badAt >= 0) throw new Error(`Batch would be refused at #${badAt + 1}: ${bitWords(checks[badAt]).join(", ")}`);
      await send("approve batch", encodeFunctionData({ abi: LEDGER_ABI, functionName: "approveBatch", args: [BigInt(project), drafts] }));
      await refresh();
    }, "Approved versions anchored: their content hashes are on chain.");

  const issue = (id: string) =>
    run(async () => {
      if (!project) throw new Error("Link a project first.");
      const a = ws.assistants.find((x) => x.id === id)!;
      const expires = BigInt(Math.min(a.expiresAt, Math.floor(Date.now() / 1000) + 366 * 86400 - 60));
      const hash = await send(`grant ${a.label}`, encodeFunctionData({ abi: LEDGER_ABI, functionName: "issueGrant", args: [BigInt(project), assistantKeyHash(a.id), groupsMask(a.groups), a.maxVisibility, expires] }));
      const ev = (await logsOf(hash)).find((e) => e.eventName === "GrantIssued");
      const gid = ev ? Number((ev.args as unknown as { grant: bigint }).grant) : null;
      if (!gid) throw new Error("Issued, but the grant number could not be read.");
      await link.grant(id, gid);
    }, "Grant issued on chain and linked: reads with this key are now also checked on chain.");

  const revokeOnChain = (gid: number) => run(() => send(`revoke #${gid}`, encodeFunctionData({ abi: LEDGER_ABI, functionName: "revokeGrant", args: [BigInt(gid)] })), `Grant #${gid} revoked on chain: the next read is refused.`);

  const togglePause = () =>
    run(async () => {
      await send("pause", encodeFunctionData({ abi: LEDGER_ABI, functionName: "setPaused", args: [BigInt(project!), !paused] }));
      await refresh();
    }, "Pause state changed on chain.");

  const anchorReceipts = () =>
    run(async () => {
      const rows = ws.receipts.slice(0, 60);
      if (!rows.length || !project) throw new Error("No receipts to anchor.");
      const root = merkleRoot(rows.map(receiptLeaf));
      const ts = rows.map((r) => r.at);
      const block = await rpcCall<{ timestamp: string }>("eth_getBlockByNumber", ["latest", false]);
      const last = Math.min(Math.max(...ts), Number(BigInt(block.timestamp)));
      await send("anchor receipts", encodeFunctionData({ abi: LEDGER_ABI, functionName: "anchorReceipts", args: [BigInt(project), root, rows.length, BigInt(Math.min(...ts, last)), BigInt(last)] }));
    }, "Receipt batch anchored as a Merkle root.");

  if (!ledgerLive())
    return (
      <div className="panel" data-testid="chain-panel">
        <h3>On-chain change log</h3>
        <p className="note warn mt-3">RexsonFactLedger is not deployed on {CHAIN.name} yet. Everything else works; once the owner deploys it, this tab anchors approved versions, grants and receipt batches.</p>
        <p className="mt-4 text-[14px] text-[var(--muted)]">What would go on chain for this project (hashes only):</p>
        <div className="scroll-x mt-2">
          <table className="tbl min-w-[560px]">
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <td className="mono text-[12px]">{k}</td>
                  <td className="mono text-[12px]">key {factKeyHash(k).slice(0, 14)}…</td>
                  <td className="mono text-[12px]">content {current(ws.facts[k])?.hash.slice(0, 14)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

  if (!hosted)
    return (
      <div className="panel" data-testid="chain-panel">
        <h3>On-chain change log</h3>
        <p className="note mt-3">The practice workspace is sample data and is never written on chain. Sign in to a hosted workspace to anchor your own approved versions and grants.</p>
      </div>
    );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]" data-testid="chain-panel">
      <div className="panel min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3>Approved versions on chain</h3>
          {project ? <span className="chip acc">project #{project}</span> : null}
        </div>
        {!project ? (
          <div className="mt-4 grid gap-3">
            <p className="text-[14px] text-[var(--muted)]">Open this project on RexsonFactLedger. You become its owner on chain; the name is stored only as a hash.</p>
            <button type="button" className="btn btn-accent w-max" disabled={Boolean(busy)} onClick={openProject} data-testid="chain-open">
              {busy === "open" ? "Confirm in wallet…" : "Open project on chain"}
            </button>
          </div>
        ) : (
          <>
            {owner && address && owner.toLowerCase() !== address.toLowerCase() ? <p className="note warn mt-3">The connected wallet is not this project&apos;s owner on chain ({owner}).</p> : null}
            <div className="scroll-x mt-3">
              <table className="tbl min-w-[520px]" data-testid="chain-facts">
                <thead>
                  <tr>
                    <th>Fact</th>
                    <th>Here</th>
                    <th>On chain</th>
                    <th>Match</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => {
                    const c = current(ws.facts[k]);
                    const cf = facts[k];
                    const same = cf && c && cf.contentHash.toLowerCase() === c.hash.toLowerCase();
                    return (
                      <tr key={k}>
                        <td className="mono text-[12px]">{k}</td>
                        <td className="text-[13px]">rev {c?.version}</td>
                        <td className="text-[13px]">{cf?.version ? `v${cf.version}` : "—"}</td>
                        <td>{same ? <span className="chip ok">hash matches</span> : <span className="chip">not anchored</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-accent" disabled={Boolean(busy)} onClick={anchorFacts} data-testid="chain-anchor-facts">
                {busy?.startsWith("propose") || busy === "approve batch" ? `${busy}…` : "Anchor approved versions"}
              </button>
              <button type="button" className="btn btn-line" disabled={Boolean(busy)} onClick={togglePause} data-testid="chain-pause">
                {paused ? "Resume reads on chain" : "Pause reads on chain"}
              </button>
              <button type="button" className="btn btn-line" disabled={Boolean(busy) || !ws.receipts.length} onClick={anchorReceipts} data-testid="chain-anchor-receipts">
                Anchor receipt batch
              </button>
              <button type="button" className="btn btn-line btn-sm" onClick={() => run(() => link.chain(null), "Unlinked.")}>Unlink</button>
            </div>
          </>
        )}
        {lastTx ? (
          <p className="micro mt-3 text-[var(--muted)]">
            Last transaction: <a className="underline" href={explorerTx(lastTx)} target="_blank" rel="noreferrer">{lastTx.slice(0, 18)}…</a>
          </p>
        ) : null}
        <p className="micro mt-3 flex flex-wrap items-center gap-2 text-[var(--muted)]">
          Contract <CopyChip value={CONTRACTS.ledger} />
        </p>
      </div>
      <div className="panel">
        <h3>Grants on chain</h3>
        <p className="micro mt-1 text-[var(--muted)]">A linked grant is checked on chain before every read. If the chain cannot be read, that key reads nothing.</p>
        <div className="row-list mt-3">
          {ws.assistants.filter((a) => !a.revoked).map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="text-[14px]">
                {a.label} <span className="mono text-[11px] text-[var(--muted)]">{a.id}</span>
              </span>
              {a.chainGrant ? (
                <span className="flex gap-2">
                  <span className="chip acc">#{a.chainGrant}</span>
                  <button type="button" className="btn btn-line btn-sm" disabled={!project || Boolean(busy)} onClick={() => revokeOnChain(a.chainGrant!)} data-testid={`chain-revoke-${a.id}`}>Revoke on chain</button>
                </span>
              ) : (
                <button type="button" className="btn btn-line btn-sm" disabled={!project || Boolean(busy)} onClick={() => issue(a.id)} data-testid={`chain-grant-${a.id}`}>Issue on chain</button>
              )}
            </div>
          ))}
        </div>
        {err ? <p className="note bad mt-3" role="alert" data-testid="chain-error">{err}</p> : null}
        {ok ? <p className="note ok mt-3" role="status" data-testid="chain-ok">{ok}</p> : null}
      </div>
    </div>
  );
}
