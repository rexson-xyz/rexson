import "server-only";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { CONTRACTS, ledgerLive } from "@/config/contracts";
import { FEED_ABI } from "@/lib/abi";
import { rpcBatch } from "@/lib/server/chainread";

/* Light live facts for every page: head block, its time, block time over the last 100,000 blocks, gas price, Chainlink ETH/USD, and whether the ledger has code. */

/** Chainlink ETH/USD on Robinhood Chain (confirmed on chain, memory chainlink-eth-usd-robinhood-chain). */
export const ETH_USD_FEED = "0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9";

export type ChainSnapshot = {
  block: number | null;
  time: number | null;
  blockSeconds: number | null;
  gasPriceWei: string | null;
  ethUsd: { price: number; updatedAt: number; feed: string } | null;
  ledgerCode: boolean | null;
  readAt: number;
};

const SPAN = 100_000;

export async function readSnapshot(): Promise<ChainSnapshot> {
  const head = await rpcBatch<unknown>([{ method: "eth_getBlockByNumber", params: ["latest", false] }]).catch(() => [null]);
  const blk = head[0] as { number?: string; timestamp?: string } | null;
  const n = blk?.number ? Number(BigInt(blk.number)) : null;
  const calls = [
    { method: "eth_gasPrice", params: [] },
    { method: "eth_call", params: [{ to: ETH_USD_FEED, data: encodeFunctionData({ abi: FEED_ABI, functionName: "latestRoundData" }) }, "latest"] },
    ...(n !== null ? [{ method: "eth_getBlockByNumber", params: [`0x${Math.max(0, n - SPAN).toString(16)}`, false] }] : []),
    ...(ledgerLive() ? [{ method: "eth_getCode", params: [CONTRACTS.ledger, "latest"] }] : []),
  ];
  const r = await rpcBatch<unknown>(calls).catch(() => calls.map(() => null));
  const time = blk?.timestamp ? Number(BigInt(blk.timestamp)) : null;
  let ethUsd: ChainSnapshot["ethUsd"] = null;
  try {
    if (typeof r[1] === "string" && r[1].length > 2) {
      const [, answer, , updatedAt] = decodeFunctionResult({ abi: FEED_ABI, functionName: "latestRoundData", data: r[1] as `0x${string}` });
      if (answer > 0n) ethUsd = { price: Number(answer) / 1e8, updatedAt: Number(updatedAt), feed: ETH_USD_FEED };
    }
  } catch {
    ethUsd = null;
  }
  const old = n !== null ? (r[2] as { timestamp?: string } | null) : null;
  const blockSeconds = time !== null && old?.timestamp ? (time - Number(BigInt(old.timestamp))) / SPAN : null;
  const has = (x: unknown) => typeof x === "string" && x.length > 2;
  return {
    block: n,
    time,
    blockSeconds,
    gasPriceWei: typeof r[0] === "string" ? BigInt(r[0]).toString() : null,
    ethUsd,
    ledgerCode: ledgerLive() ? has(r[n !== null ? 3 : 2]) : null,
    readAt: Date.now(),
  };
}
