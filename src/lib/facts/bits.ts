/*
 * TypeScript mirror of RexsonLedgerMath.sol reason bits (parity test in bits.test.ts reads the .sol). The same bits explain a
 * refusal in the browser (practice), on the server (hosted reads) and from the contract's check views.
 */

export const READ_BITS = {
  UNKNOWN_GRANT: 1n << 0n,
  GRANT_REVOKED: 1n << 1n,
  GRANT_EXPIRED: 1n << 2n,
  PROJECT_PAUSED: 1n << 3n,
  NO_APPROVED_VERSION: 1n << 4n,
  FACT_RETIRED: 1n << 5n,
  GROUP_NOT_GRANTED: 1n << 6n,
  ABOVE_GRANT_LEVEL: 1n << 7n,
  WORKSPACE_ONLY: 1n << 8n,
} as const;

export const DRAFT_BITS = {
  UNKNOWN_PROJECT: 1n << 16n,
  NOT_EDITOR: 1n << 17n,
  NOT_REVIEWER: 1n << 18n,
  STALE_BASE: 1n << 19n,
  BAD_VISIBILITY: 1n << 20n,
  EMPTY_CONTENT: 1n << 21n,
  DRAFT_NOT_OPEN: 1n << 22n,
  OTHER_PROJECT: 1n << 23n,
  OWN_DRAFT: 1n << 24n,
  SAME_FACT_TWICE: 1n << 25n,
  EMPTY_KEY: 1n << 26n,
} as const;

export type ReadBit = keyof typeof READ_BITS;
export type DraftBit = keyof typeof DRAFT_BITS;

export const BIT_WORDS: Record<ReadBit | DraftBit, string> = {
  UNKNOWN_GRANT: "No such grant",
  GRANT_REVOKED: "Grant revoked",
  GRANT_EXPIRED: "Grant expired",
  PROJECT_PAUSED: "Project paused",
  NO_APPROVED_VERSION: "No approved version yet",
  FACT_RETIRED: "Fact retired",
  GROUP_NOT_GRANTED: "Group not in the grant",
  ABOVE_GRANT_LEVEL: "Above the grant's level",
  WORKSPACE_ONLY: "Workspace only, never sent",
  UNKNOWN_PROJECT: "No such project",
  NOT_EDITOR: "Not an editor",
  NOT_REVIEWER: "Not a reviewer",
  STALE_BASE: "Built on an older version",
  BAD_VISIBILITY: "Unknown visibility level",
  EMPTY_CONTENT: "Empty content",
  DRAFT_NOT_OPEN: "Draft already closed",
  OTHER_PROJECT: "Draft of another project",
  OWN_DRAFT: "Reviewer wrote this draft",
  SAME_FACT_TWICE: "Same fact twice in one batch",
  EMPTY_KEY: "Empty fact name",
};

const ALL = { ...READ_BITS, ...DRAFT_BITS } as const;

/** Names of the bits set in a reason mask, lowest bit first. */
export function bitNames(mask: bigint): (ReadBit | DraftBit)[] {
  return (Object.keys(ALL) as (ReadBit | DraftBit)[]).filter((k) => (mask & ALL[k]) !== 0n).sort((a, b) => (ALL[a] < ALL[b] ? -1 : 1));
}

export const bitWords = (mask: bigint) => bitNames(mask).map((n) => BIT_WORDS[n]);
