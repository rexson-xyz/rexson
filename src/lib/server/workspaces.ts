import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { MemoryKV } from "@/lib/memkv";
import { getStore } from "@/lib/server/store";
import {
  addAssistant,
  addDraft,
  approve,
  changeAssistant,
  closeDraft,
  deleteFact,
  emptyWorkspace,
  retire,
  revokeAssistant,
  RuleError,
  type DraftInput,
  type GrantInput,
  LIMITS,
  type Receipt,
  type Workspace,
} from "@/lib/facts/model";

/*
 * Hosted workspaces. One project per wallet in v1, stored as one JSON value in the shared store (kv-gateway / Redis REST) when
 * configured, else in this instance's bounded memory (the app then shows "Not configured: saved data may be lost on restart").
 * Writes for one wallet run one at a time in this instance, and every save is compare-and-set on the workspace revision.
 *
 * Assistant keys: "rk_<id>.<secret>". Only the public id and sha256(secret) are stored; the secret is shown once at creation.
 * key:<id> maps an id to its owner wallet, so a read finds the workspace without scanning.
 */

const STORE_TTL = 180 * 86400;
const MEM_TTL = 30 * 86400;
export const MAX_WORKSPACE_BYTES = 240_000;
const wsKey = (owner: string) => `ws:v1:${owner.toLowerCase()}`;
const keyKey = (id: string) => `key:v1:${id}`;
const lockKey = (owner: string) => `lock:v1:${owner.toLowerCase()}`;
const receiptsKey = (owner: string) => `rc:v1:${owner.toLowerCase()}`;

/**
 * Storage primitives. Workspace writes (facts, drafts, grants) happen only while holding the owner's lock (SET NX EX in the shared
 * store, released by compare-and-delete), and are additionally compare-and-set on the workspace revision. Read receipts never
 * touch the workspace document: they are appended to their own capped list (LPUSH + LTRIM), so an assistant read can never
 * overwrite a revocation or an approval made at the same moment.
 */
export type Backend = {
  get(k: string): Promise<string | null>;
  put(k: string, v: string): Promise<void>;
  del(k: string): Promise<void>;
  lock(k: string, token: string, ttlSec: number): Promise<boolean>;
  unlock(k: string, token: string): Promise<void>;
  push(k: string, v: string, keep: number): Promise<void>;
  range(k: string, n: number): Promise<string[]>;
};

/** This instance's bounded memory (no shared store configured). */
export function memoryBackend(): Backend {
  const kv = new MemoryKV(2000, 16_000_000);
  const lists = new Map<string, string[]>();
  const locks = new Map<string, { token: string; until: number }>();
  return {
    get: async (k) => kv.get(k),
    put: async (k, v) => {
      if (!kv.set(k, v, MEM_TTL)) throw new RuleError("This server's temporary memory is full. Configure the shared store.");
    },
    del: async (k) => {
      kv.del(k);
      lists.delete(k);
    },
    lock: async (k, token, ttl) => {
      const l = locks.get(k);
      if (l && l.until > Date.now()) return false;
      locks.set(k, { token, until: Date.now() + ttl * 1000 });
      return true;
    },
    unlock: async (k, token) => {
      if (locks.get(k)?.token === token) locks.delete(k);
    },
    push: async (k, v, keep) => {
      if (!lists.has(k) && lists.size >= 2000) throw new RuleError("This server's temporary memory is full.");
      lists.set(k, [v, ...(lists.get(k) ?? [])].slice(0, keep));
    },
    range: async (k, n) => (lists.get(k) ?? []).slice(0, n),
  };
}

function storeBackend(): Backend | null {
  const st = getStore();
  if (!st) return null;
  return {
    get: (k) => st.get(k),
    put: (k, v) => st.setEx(k, v, STORE_TTL),
    del: (k) => st.del(k),
    lock: (k, token, ttl) => st.setNx(k, token, ttl),
    unlock: async (k, token) => void (await st.delIf(k, token)),
    push: (k, v, keep) => st.pushCapped(k, v, keep),
    range: (k, n) => st.range(k, n),
  };
}

let memBackend: Backend | null = null;
let override: Backend | null = null;
/** Tests only: run against a given backend. */
export function __setBackend(b: Backend | null) {
  override = b;
}
function backend(): Backend {
  if (override) return override;
  const s = storeBackend();
  if (s) return s;
  memBackend ??= memoryBackend();
  return memBackend;
}

export const storageConfigured = () => getStore() !== null;

export async function loadWorkspace(owner: string): Promise<Workspace | null> {
  const raw = await backend().get(wsKey(owner));
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Workspace;
    return v && v.v === 1 && typeof v.facts === "object" ? { ...v, receipts: [] } : null;
  } catch {
    return null;
  }
}

export async function loadReceipts(owner: string, n = LIMITS.receipts): Promise<Receipt[]> {
  const raw = await backend().range(receiptsKey(owner), n);
  return raw.flatMap((r) => {
    try {
      return [JSON.parse(r) as Receipt];
    } catch {
      return [];
    }
  });
}

/** Runs fn while holding the owner's write lock (shared across instances when the shared store is configured). */
async function withLock<T>(owner: string, fn: () => Promise<T>): Promise<T> {
  const b = backend();
  const token = randomBytes(12).toString("hex");
  const k = lockKey(owner);
  for (let i = 0; !(await b.lock(k, token, 15)); i++) {
    if (i >= 40) throw new RuleError("The workspace is busy. Try again in a moment.");
    await new Promise((r) => setTimeout(r, 100));
  }
  try {
    return await fn();
  } finally {
    await b.unlock(k, token);
  }
}

/** Compare-and-set on the revision; only ever called under the owner's lock. */
async function saveWorkspace(ws: Workspace, expectedRev: number | null) {
  const raw = JSON.stringify({ ...ws, receipts: [] });
  if (raw.length > MAX_WORKSPACE_BYTES) throw new RuleError("Not saved: the workspace is over 240 KB.");
  const now = await loadWorkspace(ws.owner);
  if ((now?.rev ?? null) !== expectedRev) throw new RuleError("The workspace changed in another tab. Reload and try again.");
  await backend().put(wsKey(ws.owner), raw);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Splits "rk_<id>.<secret>" into its parts, or null. */
export function parseToken(token: string | null | undefined): { id: string; secret: string } | null {
  const m = String(token ?? "").trim().match(/^(rk_[0-9a-f]{12})\.([0-9a-f]{48})$/);
  return m ? { id: m[1], secret: m[2] } : null;
}

export type Op =
  | { op: "load" }
  | { op: "create"; name: string }
  | { op: "draft"; input: DraftInput }
  | { op: "approve"; ids: string[] }
  | { op: "reject"; id: string }
  | { op: "withdraw"; id: string }
  | { op: "retire"; key: string }
  | { op: "deleteFact"; key: string }
  | { op: "addAssistant"; grant: GrantInput }
  | { op: "changeAssistant"; id: string; grant: GrantInput }
  | { op: "revokeAssistant"; id: string }
  | { op: "pause"; paused: boolean }
  | { op: "groups"; groups: string[] }
  | { op: "linkChain"; project: number | null }
  | { op: "linkGrant"; id: string; grant: number | null }
  | { op: "deleteWorkspace" };

export type OpResult = { ok: true; ws: Workspace | null; token?: string } | { ok: false; error: string };

/** Runs one owner operation. The owner is the signed-in wallet; it is the editor and the reviewer (solo approval) in v1. */
export function runOp(owner: string, op: Op, now = Math.floor(Date.now() / 1000)): Promise<OpResult> {
  return (async () => {
    try {
      return await withLock(owner, async () => {
      const ws = await loadWorkspace(owner);
      if (op.op === "load") return { ok: true, ws };
      if (op.op === "create") {
        if (ws) throw new RuleError("This wallet already has a project.");
        const fresh = emptyWorkspace(`p_${randomBytes(6).toString("hex")}`, String(op.name ?? ""), owner.toLowerCase(), now, true);
        await saveWorkspace(fresh, null);
        return { ok: true, ws: fresh };
      }
      if (!ws) throw new RuleError("Create a project first.");
      if (op.op === "deleteWorkspace") {
        for (const a of ws.assistants) await backend().del(keyKey(a.id));
        await backend().del(receiptsKey(owner));
        await backend().del(wsKey(owner));
        return { ok: true, ws: null };
      }
      const me = owner.toLowerCase();
      let next: Workspace;
      let token: string | undefined;
      switch (op.op) {
        case "draft":
          next = addDraft(ws, op.input, me, now).ws;
          break;
        case "approve":
          next = approve(ws, Array.isArray(op.ids) ? op.ids.map(String) : [], me, now);
          break;
        case "reject":
          next = closeDraft(ws, String(op.id), "rejected", me, now);
          break;
        case "withdraw":
          next = closeDraft(ws, String(op.id), "withdrawn", me, now);
          break;
        case "retire":
          next = retire(ws, String(op.key));
          break;
        case "deleteFact":
          next = deleteFact(ws, String(op.key));
          break;
        case "addAssistant": {
          const id = `rk_${randomBytes(6).toString("hex")}`;
          const secret = randomBytes(24).toString("hex");
          next = addAssistant(ws, op.grant, id, now, sha(secret));
          token = `${id}.${secret}`;
          await backend().put(keyKey(id), me);
          break;
        }
        case "changeAssistant":
          next = changeAssistant(ws, String(op.id), op.grant, now);
          break;
        case "revokeAssistant":
          next = revokeAssistant(ws, String(op.id));
          break;
        case "pause":
          next = { ...ws, paused: Boolean(op.paused), rev: ws.rev + 1 };
          break;
        case "groups": {
          const g = (Array.isArray(op.groups) ? op.groups : []).map((x) => String(x).trim().slice(0, 24)).filter(Boolean);
          if (g.length < ws.groups.length) throw new RuleError("Groups can be renamed or added, not removed (facts point at them).");
          if (g.length > 8) throw new RuleError("At most 8 groups.");
          next = { ...ws, groups: g, rev: ws.rev + 1 };
          break;
        }
        case "linkChain":
          next = { ...ws, chain: op.project && Number.isInteger(op.project) && op.project > 0 ? { project: op.project } : undefined, rev: ws.rev + 1 };
          break;
        case "linkGrant": {
          const g = op.grant;
          if (g !== null && !(Number.isInteger(g) && g > 0)) throw new RuleError("Bad grant id.");
          if (!ws.assistants.some((a) => a.id === op.id)) throw new RuleError("No such assistant.");
          next = { ...ws, assistants: ws.assistants.map((a) => (a.id === op.id ? { ...a, chainGrant: g ?? undefined } : a)), rev: ws.rev + 1 };
          break;
        }
        default:
          throw new RuleError("Unknown operation.");
      }
      await saveWorkspace(next, ws.rev);
      return { ok: true, ws: next, token };
      });
    } catch (e) {
      if (e instanceof RuleError) return { ok: false, error: e.message };
      return { ok: false, error: "The workspace store could not be reached." };
    }
  })() as Promise<OpResult>;
}

/** Finds the workspace and assistant behind a bearer token, checking the secret in constant time. */
export async function resolveToken(token: string | null): Promise<{ ws: Workspace; assistantId: string } | null> {
  const t = parseToken(token);
  if (!t) return null;
  const owner = await backend().get(keyKey(t.id));
  if (!owner) return null;
  const ws = await loadWorkspace(owner);
  const a = ws?.assistants.find((x) => x.id === t.id);
  if (!ws || !a?.secretHash) return null;
  const want = Buffer.from(a.secretHash, "hex");
  const got = Buffer.from(sha(t.secret), "hex");
  return want.length === got.length && timingSafeEqual(want, got) ? { ws, assistantId: t.id } : null;
}

/**
 * Appends a read receipt (no fact text) to the owner's receipt list. It never reads or writes the workspace document, so it cannot
 * undo a revocation or an approval that lands at the same time.
 */
export async function recordReceipt(owner: string, r: Omit<Receipt, "id">): Promise<Receipt> {
  const receipt: Receipt = { ...r, id: `rd_${r.at.toString(36)}${randomBytes(3).toString("hex")}` };
  try {
    await backend().push(receiptsKey(owner), JSON.stringify(receipt), LIMITS.receipts);
  } catch {
    // A full store must not block the read; the receipt is still returned to the caller.
  }
  return receipt;
}

/** The workspace as the owner's browser sees it: secret hashes stay on the server. */
export function publicView(ws: Workspace | null, receipts: Receipt[] = []) {
  if (!ws) return null;
  return { ...ws, receipts, assistants: ws.assistants.map(({ secretHash, ...a }) => ({ ...a, hasSecret: Boolean(secretHash) })) };
}
