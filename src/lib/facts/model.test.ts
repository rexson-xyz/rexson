import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256, stringToBytes } from "viem";
import { READ_BITS } from "@/lib/facts/bits";
import { addAssistant, addDraft, addReceipt, approve, changeAssistant, checkApprove, closeDraft, contentHash, deleteFact, emptyWorkspace, factKeyHash, readFor, readMask, receiptItems, retire, revokeAssistant, secretReason, versionOf, RuleError, type Workspace } from "@/lib/facts/model";
import { sampleWorkspace } from "@/lib/facts/sample";

const T = 1_800_000_000;
const draft = (ws: Workspace, key: string, value: string, group = 0, visibility: 0 | 1 | 2 = 0, author = "ed") => addDraft(ws, { key, value, source: "notes", group, visibility }, author, T);

test("launch date moves: the next read returns the new approved version, never the draft", () => {
  let ws = emptyWorkspace("p", "Release", "0xowner", T, false);
  let r = draft(ws, "launch_date", "Monday, 7 December");
  ws = approve(r.ws, [r.draft.id], "rev", T + 1);
  ws = addAssistant(ws, { label: "Writer", groups: [0], maxVisibility: 0, days: 30 }, "rk_aaaaaaaaaa", T);
  const first = readFor(ws, "rk_aaaaaaaaaa", T + 2);
  assert.ok(first.ok && first.facts[0].value === "Monday, 7 December" && first.facts[0].version === 1);
  r = draft(ws, "launch_date", "Tuesday, 8 December");
  ws = r.ws;
  const pending = readFor(ws, "rk_aaaaaaaaaa", T + 3);
  assert.ok(pending.ok && pending.facts[0].value === "Monday, 7 December", "an open draft is never read");
  ws = approve(ws, [r.draft.id], "rev", T + 4);
  const next = readFor(ws, "rk_aaaaaaaaaa", T + 5);
  assert.ok(next.ok && next.facts[0].value === "Tuesday, 8 December" && next.facts[0].version === 2);
});

test("a batch lands together or not at all, and stale drafts are held back", () => {
  let ws = emptyWorkspace("p", "P", "o", T, false);
  const a = draft(ws, "alpha", "one");
  ws = a.ws;
  const b = draft(ws, "beta", "one");
  ws = b.ws;
  const b2 = draft(ws, "beta", "two");
  ws = b2.ws;
  ws = approve(ws, [b.draft.id], "rev", T);
  assert.throws(() => approve(ws, [a.draft.id, b2.draft.id], "rev", T), RuleError);
  assert.equal(versionOf(ws.facts.alpha), 0, "first draft did not land");
  const c = checkApprove(ws, [a.draft.id, b2.draft.id], "rev");
  assert.deepEqual(c[0].reasons, []);
  assert.match(c[1].reasons[0], /rev 0, the fact is now at rev 1/);
});

test("reviewer cannot approve own draft unless solo approval; same fact twice refused", () => {
  let ws = emptyWorkspace("p", "P", "o", T, false);
  const a = draft(ws, "alpha", "one", 0, 0, "me");
  ws = a.ws;
  assert.throws(() => approve(ws, [a.draft.id], "me", T), /Reviewer wrote this draft/);
  const b = draft(ws, "alpha", "two");
  assert.match(checkApprove(b.ws, [a.draft.id, b.draft.id], "rev")[1].reasons.join(), /Same fact twice/);
  const solo = { ...ws, soloApproval: true };
  assert.equal(versionOf(approve(solo, [a.draft.id], "me", T).facts.alpha), 1);
});

test("grants: groups, levels, workspace-only, revoke, expiry, pause", () => {
  let ws = emptyWorkspace("p", "P", "o", T, true);
  for (const [k, g, v] of [["pub", 0, 0], ["inner", 0, 1], ["secret_plan", 0, 2], ["other", 1, 0]] as const) {
    const r = draft(ws, k, `${k} value`, g, v);
    ws = approve(r.ws, [r.draft.id], "o", T);
  }
  ws = addAssistant(ws, { label: "A", groups: [0], maxVisibility: 0, days: 2 }, "rk_bbbbbbbbbb", T);
  let read = readFor(ws, "rk_bbbbbbbbbb", T + 1);
  assert.ok(read.ok);
  assert.deepEqual(read.facts.map((f) => f.key), ["pub"]);
  assert.equal(read.withheld, 1, "internal fact counted as withheld; workspace-only not even counted");
  const a = ws.assistants[0];
  assert.equal(readMask(ws, a, ws.facts.secret_plan, T), READ_BITS.WORKSPACE_ONLY);
  assert.equal(readMask(ws, a, ws.facts.other, T), READ_BITS.GROUP_NOT_GRANTED);
  ws = changeAssistant(ws, "rk_bbbbbbbbbb", { label: "A", groups: [0, 1], maxVisibility: 1, days: 2 }, T);
  read = readFor(ws, "rk_bbbbbbbbbb", T + 1);
  assert.ok(read.ok);
  assert.deepEqual(read.facts.map((f) => f.key), ["inner", "other", "pub"]);
  assert.equal(readFor(ws, "rk_bbbbbbbbbb", T + 2 * 86400).ok, false, "expired");
  assert.equal(readFor({ ...ws, paused: true }, "rk_bbbbbbbbbb", T).ok, false, "paused");
  const revoked = revokeAssistant(ws, "rk_bbbbbbbbbb");
  const denied = readFor(revoked, "rk_bbbbbbbbbb", T);
  assert.ok(!denied.ok && /revoked/.test(denied.error));
  assert.equal(readFor(ws, "rk_cccccccccc", T).ok, false, "unknown key");
});

test("retire and delete stop reads at once", () => {
  let ws = emptyWorkspace("p", "P", "o", T, true);
  const r = draft(ws, "alpha", "one");
  ws = approve(r.ws, [r.draft.id], "o", T);
  ws = addAssistant(ws, { label: "A", groups: [0], maxVisibility: 0, days: 2 }, "rk_dddddddddd", T);
  const ret = retire(ws, "alpha");
  const a = readFor(ret, "rk_dddddddddd", T);
  assert.ok(a.ok && a.facts.length === 0);
  assert.throws(() => retire(ret, "alpha"), /already retired/);
  const del = deleteFact(ws, "alpha");
  const b = readFor(del, "rk_dddddddddd", T);
  assert.ok(b.ok && b.facts.length === 0 && b.withheld === 0);
});

test("secrets are refused before they are saved", () => {
  assert.ok(secretReason("abandon ability able about above absent absorb abstract absurd abuse access accident"));
  assert.ok(secretReason("key 0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318"));
  assert.ok(secretReason("password: hunter2"));
  assert.ok(secretReason("sk-or-v1-abcdefghijklmnopqrstuvwxyz123456"));
  assert.equal(secretReason("Launch is on Tuesday, 8 December."), null);
  const ws = emptyWorkspace("p", "P", "o", T, true);
  assert.throws(() => draft(ws, "wallet", "password: hunter2"), /not saved/);
});

test("validation: names, sizes, grants", () => {
  const ws = emptyWorkspace("p", "P", "o", T, true);
  assert.throws(() => draft(ws, "Bad Name", "x"), RuleError);
  assert.throws(() => draft(ws, "ok_name", ""), RuleError);
  assert.throws(() => draft(ws, "ok_name", "x".repeat(601)), RuleError);
  assert.throws(() => addDraft(ws, { key: "ok", value: "v", source: "javascript:alert(1)", group: 0, visibility: 0 }, "e", T) && addDraft(ws, { key: "ok", value: "v", source: "http://[bad", group: 0, visibility: 0 }, "e", T), RuleError);
  assert.throws(() => addAssistant(ws, { label: "A", groups: [], maxVisibility: 0, days: 2 }, "rk_eeeeeeeeee", T), RuleError);
  assert.throws(() => addAssistant(ws, { label: "A", groups: [0], maxVisibility: 0, days: 400 }, "rk_eeeeeeeeee", T), RuleError);
  assert.throws(() => addAssistant(ws, { label: "A", groups: [0], maxVisibility: 0, days: 2 }, "bad", T), RuleError);
  assert.throws(() => closeDraft(draft(ws, "ok", "v").ws, "d_1", "withdrawn", "someone else", T), /Only the author/);
});

test("hashes match what the contract stores", () => {
  assert.equal(factKeyHash("launch_date"), keccak256(stringToBytes("launch_date")));
  const h = contentHash({ key: "k", version: 1, value: "v", source: "", group: 0, visibility: 0 });
  assert.equal(h, keccak256(stringToBytes('{"key":"k","version":1,"value":"v","source":"","group":0,"visibility":0}')));
});

test("receipts carry no fact text", () => {
  let ws = sampleWorkspace(T);
  const r = readFor(ws, "rk_5a11e0c0de", T);
  assert.ok(r.ok);
  const { receipt } = addReceipt(ws, { at: T, assistant: "rk_5a11e0c0de", label: "W", items: receiptItems(r.facts), withheld: r.withheld, via: "json" });
  ws = addReceipt(ws, { ...receipt }).ws;
  const text = JSON.stringify(receipt);
  for (const f of r.facts) assert.ok(!text.includes(f.value), `receipt leaked ${f.key}`);
});

test("the sample workspace is consistent", () => {
  const ws = sampleWorkspace(T);
  assert.equal(versionOf(ws.facts.launch_date), 1);
  assert.equal(ws.drafts.filter((d) => d.status === "open").length, 1);
  assert.equal(ws.receipts.length, 3);
  const support = readFor(ws, "rk_50c1a1b0a7", T);
  assert.ok(support.ok && !support.facts.some((f) => f.key === "freeze_rule" || f.key === "price_floor_note"));
});
