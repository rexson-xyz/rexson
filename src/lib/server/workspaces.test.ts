import { test } from "node:test";
import assert from "node:assert/strict";
import { __setBackend, loadReceipts, loadWorkspace, memoryBackend, recordReceipt, resolveToken, runOp, type Backend } from "@/lib/server/workspaces";
import { assistantRead } from "@/lib/server/read";

const OWNER = "0x00000000000000000000000000000000000000aa";

/** A backend whose reads are slow, so two operations really interleave between their read and their write. */
function slow(b: Backend, ms = 15): Backend {
  const wait = () => new Promise((r) => setTimeout(r, ms));
  return { ...b, get: async (k) => (await wait(), b.get(k)), put: async (k, v) => (await wait(), b.put(k, v)), push: async (k, v, n) => (await wait(), b.push(k, v, n)) };
}

async function setup() {
  __setBackend(slow(memoryBackend()));
  assert.ok((await runOp(OWNER, { op: "create", name: "Release" })).ok);
  const d = await runOp(OWNER, { op: "draft", input: { key: "launch_date", value: "Monday, 7 December", source: "notes", group: 0, visibility: 0 } });
  assert.ok(d.ok && d.ws);
  assert.ok((await runOp(OWNER, { op: "approve", ids: [d.ws!.drafts[0].id] })).ok);
  const k = await runOp(OWNER, { op: "addAssistant", grant: { label: "Writer", groups: [0], maxVisibility: 0, days: 30 } });
  assert.ok(k.ok && k.token);
  return k.token!;
}

test("a receipt written at the same moment never undoes a revocation", async () => {
  const token = await setup();
  const id = token.split(".")[0];
  // Interleave: the read (which writes a receipt) and the revoke start together.
  const [read, revoke] = await Promise.all([assistantRead(token, "json"), runOp(OWNER, { op: "revokeAssistant", id })]);
  assert.ok(revoke.ok, "revoke applied");
  assert.ok(read.ok || read.status === 403);
  const ws = await loadWorkspace(OWNER);
  assert.equal(ws!.assistants.find((a) => a.id === id)!.revoked, true, "the revocation survived the receipt write");
  assert.ok((await loadReceipts(OWNER)).length >= 1, "the receipt was kept too, in its own list");
  // Many receipts racing many owner writes: every owner write lands.
  const k2 = await runOp(OWNER, { op: "addAssistant", grant: { label: "Coder", groups: [0], maxVisibility: 0, days: 30 } });
  const t2 = k2.ok ? k2.token! : "";
  const results = await Promise.all([
    ...Array.from({ length: 6 }, () => assistantRead(t2, "text")),
    runOp(OWNER, { op: "draft", input: { key: "support_hours", value: "Weekdays", source: "", group: 0, visibility: 0 } }),
    runOp(OWNER, { op: "pause", paused: false }),
  ]);
  assert.ok(results.slice(6).every((r) => (r as { ok: boolean }).ok));
  const after = await loadWorkspace(OWNER);
  assert.ok(after!.drafts.some((d) => d.key === "support_hours"), "draft write survived concurrent reads");
});

test("a revoked key is refused on the very next read, with no fact text", async () => {
  const token = await setup();
  const before = await assistantRead(token, "json");
  assert.ok(before.ok && before.facts[0].value === "Monday, 7 December");
  assert.ok((await runOp(OWNER, { op: "revokeAssistant", id: token.split(".")[0] })).ok);
  const next = await assistantRead(token, "json");
  assert.ok(!next.ok && next.status === 403 && /revoked/.test(next.error));
  assert.ok(!JSON.stringify(next).includes("December"));
  const receipts = await loadReceipts(OWNER);
  assert.match(receipts[0].denied ?? "", /revoked/);
});

test("wrong secrets and malformed tokens resolve to nothing", async () => {
  const token = await setup();
  const [id] = token.split(".");
  assert.equal(await resolveToken(`${id}.${"0".repeat(48)}`), null);
  assert.equal(await resolveToken("rk_nothex.abc"), null);
  assert.ok(await resolveToken(token));
  const r = await recordReceipt(OWNER, { at: 1, assistant: id, label: "x", items: [], withheld: 0, via: "json" });
  assert.match(r.id, /^rd_/);
});

test("concurrent writes from the owner are serialised by the lock, none lost", async () => {
  await setup();
  const ops = Array.from({ length: 5 }, (_, i) => runOp(OWNER, { op: "draft", input: { key: `fact_${i}`, value: `v${i}`, source: "", group: 0, visibility: 0 } }));
  const res = await Promise.all(ops);
  assert.ok(res.every((r) => r.ok));
  const ws = await loadWorkspace(OWNER);
  for (let i = 0; i < 5; i++) assert.ok(ws!.drafts.some((d) => d.key === `fact_${i}`), `fact_${i} kept`);
});
