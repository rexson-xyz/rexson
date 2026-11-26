// verify-lib against a fake chain built from this build's artifacts: a true deployment matches; a foreign runtime, a wrong chain,
// extra constructor bytes, a missing tx or a tx for another address each fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expectedRuntime, match, verifyDeployment } from "./verify-lib.mjs";

const ART = JSON.parse(readFileSync(new URL("../src/lib/contracts/artifacts.json", import.meta.url), "utf8")).contracts;
const A = (n) => "0x" + n.toString(16).padStart(40, "0");
const LEDGER = A(0x1ed9);
const TX1 = "0x" + "01".repeat(32);
const R = ART.RexsonFactLedger;

function chain(over = {}) {
  const codes = { [LEDGER]: expectedRuntime(ART), ...over.codes };
  const txs = { [TX1]: { input: over.input ?? R.creation, to: over.to ?? null, created: over.created ?? LEDGER, status: over.status ?? "0x1" } };
  return async (method, params) => {
    if (method === "eth_chainId") return over.chainId ?? "0x1237";
    if (method === "eth_getCode") return codes[params[0].toLowerCase()] ?? "0x";
    if (method === "eth_getTransactionByHash") return txs[params[0]] ? { input: txs[params[0]].input, to: txs[params[0]].to } : null;
    if (method === "eth_getTransactionReceipt") return txs[params[0]] ? { status: txs[params[0]].status, contractAddress: txs[params[0]].created } : null;
    throw new Error(`unexpected ${method}`);
  };
}
const run = (over = {}, args = {}) => verifyDeployment({ ledger: LEDGER, ledgerTx: TX1, rpc: chain(over), ART, ...args });

test("the ledger has no immutables and matches its own runtime", () => {
  assert.equal(R.immutables.length, 0);
  assert.ok(match(ART, expectedRuntime(ART)));
  assert.equal(match(ART, "0x6080"), false);
});

test("a true deployment matches", async () => {
  const r = await run();
  assert.equal(r.ok, true, r.lines.join("\n"));
});

test("every way to be wrong fails", async () => {
  assert.equal((await run({ chainId: "0x1" })).ok, false);
  assert.equal((await run({ codes: { [LEDGER]: "0x6000" } })).ok, false);
  assert.equal((await run({ input: R.creation + "00" })).ok, false);
  assert.equal((await run({ created: A(1) })).ok, false);
  assert.equal((await run({ status: "0x0" })).ok, false);
  assert.equal((await run({ to: A(5) })).ok, false);
  assert.equal((await run({}, { ledgerTx: undefined })).ok, false);
  assert.equal((await run({}, { ledger: "nope" })).ok, false);
  assert.equal((await verifyDeployment({ ledger: LEDGER, ledgerTx: TX1, rpc: async () => { throw new Error("down"); }, ART })).ok, false);
});
