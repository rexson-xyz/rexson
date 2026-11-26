// Checks behind scripts/verify-deployment.mjs, free of I/O so they can be tested with a fake chain.
//
// How it decides that an address runs this repository's RexsonFactLedger:
//   - The ledger has no constructor arguments and no immutables, so its runtime code must equal src/lib/contracts/artifacts.json
//     byte for byte (`npm run contracts:artifacts -- --check` proves the file is a fresh forge build).
//   - The creation transaction is required (no tx => FAIL, never MATCH). It must have succeeded, created exactly the address
//     checked, have no recipient, and carry exactly this build's creation code with nothing appended.
// Every check fails closed: an RPC error, an empty or malformed answer is a FAIL, never a skip.

export const CHAIN_ID = 4663;
export const NAME = "RexsonFactLedger";

const isAddr = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
const isHex = (v) => typeof v === "string" && /^0x([0-9a-fA-F]{2})*$/.test(v);
const isTx = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** This build's runtime (hex, with 0x), or null when the artifact is unusable. */
export function expectedRuntime(ART) {
  const a = ART[NAME];
  if (!a || a.immutables.length !== 0) return null;
  return a.runtime.toLowerCase();
}

/** True when `code` is this build's runtime. */
export function match(ART, code) {
  const want = expectedRuntime(ART);
  return want !== null && String(code).toLowerCase() === want;
}

/** input: { ledger, ledgerTx, rpc, ART, chainId? }. Returns { ok, lines }. */
export async function verifyDeployment({ ledger, ledgerTx, rpc, ART, chainId = CHAIN_ID }) {
  const lines = [];
  let failed = false;
  const ok = (m) => lines.push(`OK   ${m}`);
  const fail = (m) => {
    failed = true;
    lines.push(`FAIL ${m}`);
  };
  const done = () => ({ ok: !failed, lines });
  try {
    const id = await rpc("eth_chainId", []);
    if (Number(BigInt(id)) !== chainId) {
      fail(`chain id ${id}, expected ${chainId}`);
      return done();
    }
    ok(`chain id ${chainId} (Robinhood Chain)`);
  } catch (e) {
    fail(`chain id unreadable: ${e.message}`);
    return done();
  }
  if (!isAddr(ledger)) {
    fail("give --ledger <address>");
    return done();
  }
  try {
    const c = await rpc("eth_getCode", [ledger, "latest"]);
    if (!isHex(c) || c.length <= 2) throw new Error(`no code at ${ledger}`);
    if (match(ART, c)) ok(`${NAME} at ${ledger}: runtime matches this build byte for byte`);
    else fail(`${NAME} at ${ledger}: runtime differs from this build`);
  } catch (e) {
    fail(`${NAME}: ${e.message}`);
  }
  if (!isTx(ledgerTx)) {
    fail(`${NAME}: no valid creation tx given; runtime alone is not a full match`);
    return done();
  }
  try {
    const [t, rc] = await Promise.all([rpc("eth_getTransactionByHash", [ledgerTx]), rpc("eth_getTransactionReceipt", [ledgerTx])]);
    const want = ART[NAME].creation.toLowerCase();
    if (!t || !rc) fail(`${NAME}: creation tx ${ledgerTx} not found`);
    else if (rc.status !== "0x1") fail(`${NAME}: creation tx failed`);
    else if (!same(rc.contractAddress, ledger)) fail(`${NAME}: tx created ${rc.contractAddress}, not ${ledger}`);
    else if (t.to) fail(`${NAME}: tx has a recipient, not a deployment`);
    else if (String(t.input).toLowerCase() === want) ok(`${NAME}: creation input is exactly this build's creation code (no constructor arguments)`);
    else fail(`${NAME}: creation input differs from this build`);
  } catch (e) {
    fail(`${NAME}: creation tx unreadable: ${e.message}`);
  }
  return done();
}
