import { test } from "node:test";
import assert from "node:assert/strict";
import { merkleProof, merkleRoot, receiptLeaf, verifyProof } from "@/lib/facts/merkle";
import { sampleWorkspace } from "@/lib/facts/sample";

test("every receipt proves against the root; a changed receipt does not", () => {
  const ws = sampleWorkspace(1_800_000_000);
  const leaves = ws.receipts.map(receiptLeaf);
  const root = merkleRoot(leaves);
  leaves.forEach((l, i) => assert.ok(verifyProof(l, merkleProof(leaves, i), root)));
  const forged = receiptLeaf({ ...ws.receipts[0], items: ws.receipts[0].items.map((x) => ({ ...x, version: x.version + 1 })) });
  assert.equal(verifyProof(forged, merkleProof(leaves, 0), root), false);
  assert.equal(merkleRoot([leaves[0]]), leaves[0]);
  assert.throws(() => merkleRoot([]));
});
