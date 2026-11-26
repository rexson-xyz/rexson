import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BIT_WORDS, DRAFT_BITS, READ_BITS, bitNames } from "@/lib/facts/bits";

const SOL = readFileSync(new URL("../../../contracts/src/RexsonLedgerMath.sol", import.meta.url), "utf8");

test("every bit matches RexsonLedgerMath.sol, and the .sol has no bit the site lacks", () => {
  const found = [...SOL.matchAll(/uint256 internal constant ([RD])_([A-Z_]+) = 1 << (\d+);/g)].map((m) => [m[1], m[2], BigInt(m[3])] as const);
  assert.equal(found.length, Object.keys(READ_BITS).length + Object.keys(DRAFT_BITS).length);
  for (const [kind, name, shift] of found) {
    const table = (kind === "R" ? READ_BITS : DRAFT_BITS) as Record<string, bigint>;
    assert.equal(table[name], 1n << shift, name);
  }
});

test("names decode lowest bit first and every bit has words", () => {
  assert.deepEqual(bitNames(READ_BITS.WORKSPACE_ONLY | READ_BITS.GRANT_REVOKED), ["GRANT_REVOKED", "WORKSPACE_ONLY"]);
  for (const k of Object.keys(BIT_WORDS)) assert.ok(BIT_WORDS[k as keyof typeof BIT_WORDS].length > 3);
});
