import { concat, encodeAbiParameters, keccak256, type Hex } from "viem";
import { assistantKeyHash, factKeyHash, type Receipt } from "@/lib/facts/model";

/*
 * Read receipts anchored on chain as one Merkle root per batch (RexsonFactLedger.anchorReceipts). A leaf commits to the receipt id,
 * the assistant key hash, the time and every (fact key hash, version, content hash) it returned. No fact text is in a leaf.
 * Pairs are hashed in sorted order, so a proof is a plain list of sibling hashes.
 */

export function receiptLeaf(r: Receipt): Hex {
  const items = r.items.map((i) => keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint32" }, { type: "bytes32" }], [factKeyHash(i.key), i.version, i.hash])));
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "bytes32" }, { type: "uint64" }, { type: "bytes32" }],
      [r.id, assistantKeyHash(r.assistant), BigInt(r.at), keccak256(items.length ? concat(items) : "0x")],
    ),
  );
}

const pair = (a: Hex, b: Hex): Hex => (a.toLowerCase() < b.toLowerCase() ? keccak256(concat([a, b])) : keccak256(concat([b, a])));

export function merkleRoot(leaves: Hex[]): Hex {
  if (!leaves.length) throw new Error("no leaves");
  let level = [...leaves];
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? pair(level[i], level[i + 1]) : level[i]);
    level = next;
  }
  return level[0];
}

export function merkleProof(leaves: Hex[], index: number): Hex[] {
  const proof: Hex[] = [];
  let level = [...leaves];
  let i = index;
  while (level.length > 1) {
    const sib = i % 2 === 0 ? i + 1 : i - 1;
    if (sib < level.length) proof.push(level[sib]);
    const next: Hex[] = [];
    for (let k = 0; k < level.length; k += 2) next.push(k + 1 < level.length ? pair(level[k], level[k + 1]) : level[k]);
    level = next;
    i = Math.floor(i / 2);
  }
  return proof;
}

export function verifyProof(leaf: Hex, proof: Hex[], root: Hex): boolean {
  let h = leaf;
  for (const p of proof) h = pair(h, p);
  return h.toLowerCase() === root.toLowerCase();
}
