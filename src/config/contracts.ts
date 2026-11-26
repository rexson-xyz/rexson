import { isAddress } from "@/config/brand";

/*
 * Rexson's own contract on Robinhood Chain (chain 4663). Deployed 26 Nov 2026 by the owner.
 * Address, deployment block and creation transaction below; check with
 * `npm run verify-deployment -- --ledger <address> --ledger-tx <tx>` (prints MATCH).
 *   ledger  RexsonFactLedger (+ internal library RexsonLedgerMath, inlined): projects with editors and reviewers, fact drafts and
 *           all-or-nothing batch approval of fact versions (content hashes only), grants per assistant key hash (groups, level,
 *           expiry), checkRead reason bits, receipt batches anchored as Merkle roots. No funds, no admin, no upgrade.
 */
const DEPLOYED = {
  ledger: "0x1b9ecaaa58e28e2a9f3edd2175c649b844a232ce",
  /** Block of the deployment transaction (log scans start here). */
  block: 123517540,
  /** Creation transaction. */
  tx: "0x1980547e69f792e2f4146a51580c22db5c9516e836ea4d1bd830a9464d8881a8",
};

/**
 * Local tests only: NEXT_PUBLIC_REXSON_TEST_CONTRACTS='{"ledger":"0x…","block":1}' at build time points a second build at a contract on
 * an anvil chain. Never set it on Vercel.
 */
function testOverride(): typeof DEPLOYED | null {
  const raw = process.env.NEXT_PUBLIC_REXSON_TEST_CONTRACTS;
  if (!raw) return null;
  try {
    const v = { ...DEPLOYED, ...(JSON.parse(raw) as Partial<typeof DEPLOYED>) };
    return isAddress(v.ledger) ? v : null;
  } catch {
    return null;
  }
}

export const CONTRACTS = testOverride() ?? DEPLOYED;
export const ledgerLive = () => isAddress(CONTRACTS.ledger);
export const CONTRACT_NAME = "RexsonFactLedger" as const;
