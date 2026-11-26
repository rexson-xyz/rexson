import { keccak256, stringToBytes, type Hex } from "viem";
import { READ_BITS } from "@/lib/facts/bits";

/*
 * The Rexson workspace: one project's facts, drafts, assistants (access grants) and read receipts. Pure functions only, used the
 * same way by the practice workspace in the browser and by the hosted workspace on the server, so the rules cannot drift apart.
 * Every rule mirrors RexsonFactLedger.sol: drafts are based on the current approved version, a batch approves all of its drafts or
 * none, a stale draft is held back, workspace-only facts never reach an assistant, a revoked or expired grant reads nothing.
 */

export const VISIBILITY = ["Shareable", "Internal", "Workspace only"] as const;
export type Visibility = 0 | 1 | 2;

export const LIMITS = {
  facts: 100,
  openDrafts: 60,
  assistants: 12,
  groups: 8,
  receipts: 300,
  valueChars: 600,
  sourceChars: 300,
  labelChars: 40,
  maxGrantDays: 366,
  batch: 20,
} as const;

export type FactVersion = { version: number; value: string; source: string; approvedAt: number; approvedBy: string; draft: string; hash: Hex };
export type Fact = { key: string; group: number; visibility: Visibility; retired: boolean; versions: FactVersion[] };
export type DraftStatus = "open" | "approved" | "rejected" | "withdrawn";
export type Draft = { id: string; key: string; value: string; source: string; group: number; visibility: Visibility; basedOn: number; author: string; createdAt: number; status: DraftStatus; closedBy?: string; closedAt?: number };
export type Assistant = {
  id: string; // public key id, e.g. rk_3f9a0c21b7 (the secret half is never stored in clear)
  label: string;
  groups: number[];
  maxVisibility: 0 | 1;
  expiresAt: number;
  revoked: boolean;
  revision: number;
  createdAt: number;
  /** sha256 of the secret half (hosted only). */
  secretHash?: string;
  /** RexsonFactLedger grant id once the owner issued it on chain; reads are then also checked on chain. */
  chainGrant?: number;
};
export type ReceiptItem = { key: string; version: number; hash: Hex };
export type Receipt = { id: string; at: number; assistant: string; label: string; items: ReceiptItem[]; withheld: number; denied?: string; via: "json" | "text" | "mcp" | "practice" };
export type Workspace = {
  v: 1;
  id: string;
  name: string;
  owner: string;
  soloApproval: boolean;
  paused: boolean;
  groups: string[];
  facts: Record<string, Fact>;
  drafts: Draft[];
  assistants: Assistant[];
  receipts: Receipt[];
  seq: number;
  rev: number;
  chain?: { project: number };
};

export class RuleError extends Error {}
const fail = (m: string): never => {
  throw new RuleError(m);
};

// ------------------------------------------------------------------ hashing (identical to what goes on chain)

/** keccak256 of a fact name: the factKey used by RexsonFactLedger. */
export const factKeyHash = (key: string): Hex => keccak256(stringToBytes(key));
/** keccak256 of an assistant key id: the keyHash of its grant on chain (the secret never goes on chain). */
export const assistantKeyHash = (id: string): Hex => keccak256(stringToBytes(id));
/** keccak256 of the canonical JSON of one fact version: the contentHash anchored on chain. */
export function contentHash(f: { key: string; version: number; value: string; source: string; group: number; visibility: number }): Hex {
  return keccak256(stringToBytes(JSON.stringify({ key: f.key, version: f.version, value: f.value, source: f.source, group: f.group, visibility: f.visibility })));
}

// ------------------------------------------------------------------ validation

export const KEY_RE = /^[a-z][a-z0-9_]{1,47}$/;

const SECRET_PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key block"],
  [/\b(?:0x)?[0-9a-fA-F]{64}\b/, "a 64-hex-digit secret (a private key looks like this)"],
  [/\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/, "an API key"],
  [/\b(?:ghp|gho|github_pat|xox[abpr]|AKIA)[_A-Za-z0-9-]{12,}\b/, "an access token"],
  [/\b(?:password|passwd|pwd|seed phrase|recovery phrase|mnemonic)\s*[:=]/i, "a password or recovery phrase"],
];

/** A run of 12 or more short lowercase words looks like a wallet recovery phrase. */
function looksLikeMnemonic(text: string) {
  return /(?:^|\s)(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}(?:\s|$)/.test(text.trim()) && !/[.,;:!?]/.test(text.trim());
}

/** Why this text must not be saved, or null. Secrets are refused before they are stored and never echoed back. */
export function secretReason(text: string): string | null {
  for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) return `This looks like ${what}. It was not saved.`;
  if (looksLikeMnemonic(text)) return "This looks like a recovery phrase. It was not saved.";
  return null;
}

function cleanSource(s: string) {
  const t = s.trim();
  if (t.length > LIMITS.sourceChars) fail(`Source is longer than ${LIMITS.sourceChars} characters.`);
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      if (u.protocol !== "https:" && u.protocol !== "http:") fail("Source links must be http(s).");
    } catch {
      fail("The source link is not a valid URL.");
    }
  }
  return t;
}

// ------------------------------------------------------------------ workspace

export function emptyWorkspace(id: string, name: string, owner: string, now: number, soloApproval = true): Workspace {
  return { v: 1, id, name: name.trim().slice(0, 60) || "Project", owner, soloApproval, paused: false, groups: ["General", "Product", "Release"], facts: {}, drafts: [], assistants: [], receipts: [], seq: 0, rev: 0, chain: undefined };
}

export const current = (f: Fact | undefined): FactVersion | undefined => (f && f.versions.length ? f.versions[f.versions.length - 1] : undefined);
export const versionOf = (f: Fact | undefined) => current(f)?.version ?? 0;

const bump = (ws: Workspace): Workspace => ({ ...ws, rev: ws.rev + 1 });

export type DraftInput = { key: string; value: string; source: string; group: number; visibility: Visibility };

/** A new draft based on the fact's current approved version. */
export function addDraft(ws: Workspace, input: DraftInput, author: string, now: number): { ws: Workspace; draft: Draft } {
  const key = input.key.trim();
  if (!KEY_RE.test(key)) fail("Fact names use lower case letters, digits and _ (2–48 characters), starting with a letter.");
  const value = input.value.trim();
  if (!value) fail("Write the fact's value.");
  if (value.length > LIMITS.valueChars) fail(`A fact is at most ${LIMITS.valueChars} characters.`);
  const secret = secretReason(value) ?? secretReason(input.source);
  if (secret) fail(secret);
  const source = cleanSource(input.source);
  if (!(input.group >= 0 && input.group < ws.groups.length)) fail("Pick a group.");
  if (![0, 1, 2].includes(input.visibility)) fail("Pick a visibility level.");
  if (!ws.facts[key] && Object.keys(ws.facts).length >= LIMITS.facts) fail(`A project holds at most ${LIMITS.facts} facts.`);
  if (ws.drafts.filter((d) => d.status === "open").length >= LIMITS.openDrafts) fail(`At most ${LIMITS.openDrafts} drafts can wait for review.`);
  const seq = ws.seq + 1;
  const draft: Draft = { id: `d_${seq}`, key, value, source, group: input.group, visibility: input.visibility, basedOn: versionOf(ws.facts[key]), author, createdAt: now, status: "open" };
  return { ws: bump({ ...ws, seq, drafts: [...ws.drafts, draft] }), draft };
}

export type ApproveCheck = { id: string; reasons: string[] };

/** Why each draft of the batch cannot be approved by `reviewer` now (all empty = the batch would land). */
export function checkApprove(ws: Workspace, ids: string[], reviewer: string): ApproveCheck[] {
  const seen = new Set<string>();
  return ids.map((id) => {
    const d = ws.drafts.find((x) => x.id === id);
    const reasons: string[] = [];
    if (!d) return { id, reasons: ["No such draft"] };
    if (d.status !== "open") reasons.push("Draft already closed");
    if (d.status === "open" && versionOf(ws.facts[d.key]) !== d.basedOn) reasons.push(`Built on rev ${d.basedOn}, the fact is now at rev ${versionOf(ws.facts[d.key])}`);
    if (d.author === reviewer && !ws.soloApproval) reasons.push("Reviewer wrote this draft");
    if (seen.has(d.key)) reasons.push("Same fact twice in one batch");
    seen.add(d.key);
    return { id, reasons };
  });
}

/** Approves every draft in the batch, or none. */
export function approve(ws: Workspace, ids: string[], reviewer: string, now: number): Workspace {
  if (ids.length === 0) fail("Pick at least one draft.");
  if (ids.length > LIMITS.batch) fail(`At most ${LIMITS.batch} drafts per batch.`);
  const bad = checkApprove(ws, ids, reviewer).find((c) => c.reasons.length);
  if (bad) fail(`Nothing was approved: ${bad.id}: ${bad.reasons.join(", ")}.`);
  const facts = { ...ws.facts };
  const drafts = ws.drafts.map((d) => ({ ...d }));
  for (const id of ids) {
    const d = drafts.find((x) => x.id === id)!;
    d.status = "approved";
    d.closedBy = reviewer;
    d.closedAt = now;
    const prev = facts[d.key];
    const version = d.basedOn + 1;
    const v: FactVersion = { version, value: d.value, source: d.source, approvedAt: now, approvedBy: reviewer, draft: d.id, hash: contentHash({ key: d.key, version, value: d.value, source: d.source, group: d.group, visibility: d.visibility }) };
    facts[d.key] = { key: d.key, group: d.group, visibility: d.visibility, retired: false, versions: [...(prev?.versions ?? []), v].slice(-20) };
  }
  return bump({ ...ws, facts, drafts: pruneDrafts(drafts) });
}

/** Keeps every open draft and the newest closed ones. */
function pruneDrafts(drafts: Draft[]) {
  const open = drafts.filter((d) => d.status === "open");
  const closed = drafts.filter((d) => d.status !== "open").slice(-80);
  return [...closed, ...open].sort((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)));
}

export function closeDraft(ws: Workspace, id: string, how: "rejected" | "withdrawn", by: string, now: number): Workspace {
  const d = ws.drafts.find((x) => x.id === id);
  if (!d) fail("No such draft.");
  if (d!.status !== "open") fail("That draft is already closed.");
  if (how === "withdrawn" && d!.author !== by) fail("Only the author can withdraw a draft.");
  return bump({ ...ws, drafts: ws.drafts.map((x) => (x.id === id ? { ...x, status: how, closedBy: by, closedAt: now } : x)) });
}

export function retire(ws: Workspace, key: string): Workspace {
  const f = ws.facts[key];
  if (!f || !f.versions.length) fail("That fact was never approved.");
  if (f!.retired) fail("That fact is already retired.");
  return bump({ ...ws, facts: { ...ws.facts, [key]: { ...f!, retired: true } } });
}

/** Deletes a fact and its history: reads stop at once. Receipts keep only names, versions and hashes. */
export function deleteFact(ws: Workspace, key: string): Workspace {
  if (!ws.facts[key]) fail("No such fact.");
  const facts = { ...ws.facts };
  delete facts[key];
  return bump({ ...ws, facts, drafts: ws.drafts.filter((d) => d.key !== key) });
}

// ------------------------------------------------------------------ assistants (grants)

export type GrantInput = { label: string; groups: number[]; maxVisibility: 0 | 1; days: number };

function checkGrant(ws: Workspace, g: GrantInput) {
  const label = g.label.trim();
  if (!label || label.length > LIMITS.labelChars) fail(`Name the assistant (1–${LIMITS.labelChars} characters).`);
  const groups = [...new Set(g.groups)].filter((x) => Number.isInteger(x) && x >= 0 && x < ws.groups.length).sort((a, b) => a - b);
  if (!groups.length) fail("A grant names at least one group.");
  if (g.maxVisibility !== 0 && g.maxVisibility !== 1) fail("A grant allows shareable facts, or shareable and internal facts.");
  if (!(g.days >= 1 && g.days <= LIMITS.maxGrantDays)) fail(`A grant lasts 1–${LIMITS.maxGrantDays} days.`);
  return { label, groups };
}

export function addAssistant(ws: Workspace, g: GrantInput, id: string, now: number, secretHash?: string): Workspace {
  if (ws.assistants.filter((a) => !a.revoked).length >= LIMITS.assistants) fail(`At most ${LIMITS.assistants} live assistants per project.`);
  if (!/^rk_[0-9a-f]{10,32}$/.test(id)) fail("Bad key id.");
  if (ws.assistants.some((a) => a.id === id)) fail("Key id already in use.");
  const { label, groups } = checkGrant(ws, g);
  const a: Assistant = { id, label, groups, maxVisibility: g.maxVisibility, expiresAt: now + g.days * 86400, revoked: false, revision: 1, createdAt: now, secretHash };
  return bump({ ...ws, assistants: [...ws.assistants, a] });
}

export function changeAssistant(ws: Workspace, id: string, g: GrantInput, now: number): Workspace {
  const a = ws.assistants.find((x) => x.id === id);
  if (!a) fail("No such assistant.");
  if (a!.revoked) fail("That grant was revoked; issue a new key instead.");
  const { label, groups } = checkGrant(ws, g);
  return bump({ ...ws, assistants: ws.assistants.map((x) => (x.id === id ? { ...x, label, groups, maxVisibility: g.maxVisibility, expiresAt: now + g.days * 86400, revision: x.revision + 1 } : x)) });
}

export function revokeAssistant(ws: Workspace, id: string): Workspace {
  const a = ws.assistants.find((x) => x.id === id);
  if (!a) fail("No such assistant.");
  if (a!.revoked) fail("Already revoked.");
  return bump({ ...ws, assistants: ws.assistants.map((x) => (x.id === id ? { ...x, revoked: true } : x)) });
}

// ------------------------------------------------------------------ reads

/** Same rule as RexsonLedgerMath.readReasons, over the workspace copy. 0n = readable. */
export function readMask(ws: Workspace, a: Assistant | undefined, f: Fact | undefined, now: number): bigint {
  if (!a) return READ_BITS.UNKNOWN_GRANT;
  let r = 0n;
  if (a.revoked) r |= READ_BITS.GRANT_REVOKED;
  if (now >= a.expiresAt) r |= READ_BITS.GRANT_EXPIRED;
  if (ws.paused) r |= READ_BITS.PROJECT_PAUSED;
  if (!f || f.versions.length === 0) r |= READ_BITS.NO_APPROVED_VERSION;
  if (f?.retired) r |= READ_BITS.FACT_RETIRED;
  const group = f?.group ?? 0;
  if (!a.groups.includes(group)) r |= READ_BITS.GROUP_NOT_GRANTED;
  const vis = f?.visibility ?? 0;
  if (vis === 2) r |= READ_BITS.WORKSPACE_ONLY;
  else if (vis > a.maxVisibility) r |= READ_BITS.ABOVE_GRANT_LEVEL;
  return r;
}

/** Grant-level refusals only (unknown key, revoked, expired, paused): any of them denies the whole read. */
export function gateMask(ws: Workspace, a: Assistant | undefined, now: number): bigint {
  if (!a) return READ_BITS.UNKNOWN_GRANT;
  let r = 0n;
  if (a.revoked) r |= READ_BITS.GRANT_REVOKED;
  if (now >= a.expiresAt) r |= READ_BITS.GRANT_EXPIRED;
  if (ws.paused) r |= READ_BITS.PROJECT_PAUSED;
  return r;
}

export type ReadFact = { key: string; value: string; source: string; version: number; approvedAt: number; group: string; visibility: string; hash: Hex };
export type ReadResult = { ok: true; facts: ReadFact[]; withheld: number } | { ok: false; error: string; mask: bigint };

/**
 * What one assistant receives right now: the current approved version of every fact its grant allows. Grant-level refusals
 * (revoked, expired, paused) deny the whole read and return no fact text. `extra` lets the server add on-chain refusals per key.
 */
export function readFor(ws: Workspace, assistantId: string, now: number, extra?: (key: string) => bigint): ReadResult {
  const a = ws.assistants.find((x) => x.id === assistantId);
  const gate = gateMask(ws, a, now);
  if (gate !== 0n) return { ok: false, error: gate & READ_BITS.UNKNOWN_GRANT ? "Unknown key." : gate & READ_BITS.GRANT_REVOKED ? "This key was revoked." : gate & READ_BITS.GRANT_EXPIRED ? "This key expired." : "The project is paused.", mask: gate };
  const facts: ReadFact[] = [];
  let withheld = 0;
  for (const f of Object.values(ws.facts).sort((x, y) => x.key.localeCompare(y.key))) {
    const m = readMask(ws, a, f, now) | (extra ? extra(f.key) : 0n);
    if (m !== 0n) {
      if (f.visibility !== 2 && a!.groups.includes(f.group)) withheld++;
      continue;
    }
    const c = current(f)!;
    facts.push({ key: f.key, value: c.value, source: c.source, version: c.version, approvedAt: c.approvedAt, group: ws.groups[f.group] ?? String(f.group), visibility: VISIBILITY[f.visibility], hash: c.hash });
  }
  return { ok: true, facts, withheld };
}

/** Records a receipt without any fact text: names, versions and content hashes only. */
export function addReceipt(ws: Workspace, r: Omit<Receipt, "id">): { ws: Workspace; receipt: Receipt } {
  const seq = ws.seq + 1;
  const receipt: Receipt = { ...r, id: `rd_${seq.toString(36).padStart(5, "0")}` };
  return { ws: { ...ws, seq, receipts: [receipt, ...ws.receipts].slice(0, LIMITS.receipts) }, receipt };
}

export const receiptItems = (facts: ReadFact[]): ReceiptItem[] => facts.map((f) => ({ key: f.key, version: f.version, hash: f.hash }));
