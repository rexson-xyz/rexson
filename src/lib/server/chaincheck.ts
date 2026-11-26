import "server-only";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { CONTRACTS, ledgerLive } from "@/config/contracts";
import { LEDGER_ABI } from "@/lib/abi";
import { factKeyHash, type Workspace } from "@/lib/facts/model";
import { READ_BITS, bitWords } from "@/lib/facts/bits";
import { rpc } from "@/lib/feeds/rpc";

/*
 * Reads of a grant that the owner also issued on chain are checked against RexsonFactLedger.checkReads before any fact leaves
 * the server. A revoke, a narrower scope or a paused project on chain therefore applies to the very next read. If the chain cannot
 * be read, a linked grant reads nothing (fails closed); unlinked grants follow the workspace rules only.
 */

/** A key that is never a fact; its checkRead answer carries only grant-level bits plus "no approved version". */
const SENTINEL = `0x${"0".repeat(64)}` as const;

export type ChainGate = { linked: false } | { linked: true; ok: true; masks: Map<string, bigint>; block: number | null } | { linked: true; ok: false; error: string; denied?: boolean };

export async function chainGate(ws: Workspace, assistantId: string): Promise<ChainGate> {
  const a = ws.assistants.find((x) => x.id === assistantId);
  if (!a?.chainGrant || !ws.chain?.project || !ledgerLive()) return { linked: false };
  const keys = Object.keys(ws.facts);
  try {
    const data = encodeFunctionData({ abi: LEDGER_ABI, functionName: "checkReads", args: [BigInt(a.chainGrant), [...keys.map(factKeyHash), SENTINEL]] });
    const [raw, grantRaw, blockHex] = await Promise.all([
      rpc<string>("eth_call", [{ to: CONTRACTS.ledger, data }, "latest"]),
      rpc<string>("eth_call", [{ to: CONTRACTS.ledger, data: encodeFunctionData({ abi: LEDGER_ABI, functionName: "grantOf", args: [BigInt(a.chainGrant)] }) }, "latest"]),
      rpc<string>("eth_blockNumber", []),
    ]);
    const masks = decodeFunctionResult({ abi: LEDGER_ABI, functionName: "checkReads", data: raw as `0x${string}` }) as readonly bigint[];
    const g = decodeFunctionResult({ abi: LEDGER_ABI, functionName: "grantOf", data: grantRaw as `0x${string}` }) as { project: bigint };
    if (Number(g.project) !== ws.chain.project) return { linked: true, ok: false, error: "The linked on-chain grant belongs to another project." };
    // Grant-level refusals on chain deny the whole read, exactly like the same refusals in the workspace.
    const GATE = READ_BITS.UNKNOWN_GRANT | READ_BITS.GRANT_REVOKED | READ_BITS.GRANT_EXPIRED | READ_BITS.PROJECT_PAUSED;
    const gate = masks[keys.length] & GATE; // the sentinel key carries the grant-level bits even with no facts
    if (gate !== 0n) return { linked: true, ok: false, denied: true, error: `Refused on Robinhood Chain: ${bitWords(gate).join(", ")}.` };
    return { linked: true, ok: true, masks: new Map(keys.map((k, i) => [k, masks[i]])), block: Number(BigInt(blockHex)) };
  } catch {
    return { linked: true, ok: false, error: "This key's grant is linked to Robinhood Chain and the chain could not be read, so nothing was sent." };
  }
}
