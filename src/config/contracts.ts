import { isAddress } from "@/config/brand";

/*
 * Rexson's own contract on Robinhood Chain (chain 4663). Not deployed yet: the owner deploys it from the local-only /deploy page.
 * Once deployed, put the address, the deployment block and the creation transaction below and run
 * `npm run verify-deployment -- --ledger <address> --ledger-tx <tx>` (prints MATCH).
 *   ledger  RexsonFactLedger (+ internal library RexsonLedgerMath, inlined): projects with editors and reviewers, fact drafts and
 *           all-or-nothing batch approval of fact versions (content hashes only), grants per assistant key hash (groups, level,
 *           expiry), checkRead reason bits, receipt batches anchored as Merkle roots. No funds, no admin, no upgrade.
 */
const DEPLOYED = {
  ledger: "",
  /** Block of the deployment transaction (log scans start here). */
  block: 0,
  /** Creation transaction. */
  tx: "",
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
