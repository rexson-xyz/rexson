"use client";

import { useMemo, useState } from "react";
import { checkApprove, current, KEY_RE, LIMITS, readFor, readMask, VISIBILITY, versionOf, type Assistant, type GrantInput, type Visibility, type Workspace } from "@/lib/facts/model";
import { bitWords } from "@/lib/facts/bits";
import { merkleRoot, receiptLeaf } from "@/lib/facts/merkle";
import { CopyChip } from "@/components/site/CaCopy";
import { dateText } from "@/lib/format";

/* The four workspace views. They only render and call `act`; every rule lives in src/lib/facts/model.ts (practice) or the server. */

export type Actions = {
  draft(input: { key: string; value: string; source: string; group: number; visibility: Visibility }): Promise<void>;
  approve(ids: string[]): Promise<void>;
  reject(id: string): Promise<void>;
  withdraw(id: string): Promise<void>;
  retire(key: string): Promise<void>;
  deleteFact(key: string): Promise<void>;
  addAssistant(g: GrantInput): Promise<string | null>;
  changeAssistant(id: string, g: GrantInput): Promise<void>;
  revoke(id: string): Promise<void>;
  pause(paused: boolean): Promise<void>;
  simulateRead?(id: string): Promise<void>;
};

const now = () => Math.floor(Date.now() / 1000);

export function useRun() {
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setErr(null);
    setOk(null);
    try {
      await fn();
      if (done) setOk(done);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  return { err, ok, run, setErr };
}

function Msg({ err, ok }: { err: string | null; ok: string | null }) {
  if (err) return <p className="note bad mt-3" role="alert" data-testid="app-error">{err}</p>;
  if (ok) return <p className="note ok mt-3" role="status" data-testid="app-ok">{ok}</p>;
  return null;
}

// ------------------------------------------------------------------ facts

export function FactsView({ ws, act, me }: { ws: Workspace; act: Actions; me: string }) {
  const { err, ok, run } = useRun();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [group, setGroup] = useState(0);
  const [vis, setVis] = useState<Visibility>(0);
  const [open, setOpen] = useState<string | null>(null);
  const facts = Object.values(ws.facts).sort((a, b) => a.key.localeCompare(b.key));
  const pending = (k: string) => ws.drafts.filter((d) => d.key === k && d.status === "open").length;
  const pick = (k: string) => {
    const f = ws.facts[k];
    const c = current(f);
    setKey(k);
    setValue(c?.value ?? "");
    setSource(c?.source ?? "");
    setGroup(f?.group ?? 0);
    setVis(f?.visibility ?? 0);
  };
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3>Facts</h3>
          <span className="micro text-[var(--muted)]">
            {facts.length} / {LIMITS.facts} · readers only ever see approved versions
          </span>
        </div>
        {facts.length === 0 ? <p className="note mt-4">No approved facts yet. Write one on the right, then approve it under Review.</p> : null}
        <div className="row-list mt-3" data-testid="facts-list">
          {facts.map((f) => {
            const c = current(f)!;
            return (
              <div key={f.key} className="py-3" data-testid={`fact-${f.key}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button type="button" className="min-w-0 text-left" onClick={() => setOpen(open === f.key ? null : f.key)}>
                    <span className="mono text-[13px]">{f.key}</span>
                    <span className="mt-1 block text-[15px]" data-testid={`fact-${f.key}-value`}>
                      {f.retired ? <span className="text-[var(--muted)] line-through">{c.value}</span> : c.value}
                    </span>
                  </button>
                  <span className="flex flex-wrap gap-1.5">
                    <span className="chip acc">rev {c.version}</span>
                    <span className="chip">{ws.groups[f.group]}</span>
                    <span className={`chip ${f.visibility === 2 ? "no" : f.visibility === 1 ? "warn" : "ok"}`}>{VISIBILITY[f.visibility]}</span>
                    {f.retired ? <span className="chip no">retired</span> : null}
                    {pending(f.key) ? <span className="chip warn">{pending(f.key)} draft waiting</span> : null}
                  </span>
                </div>
                {open === f.key ? (
                  <div className="mt-3 rounded-[14px] bg-[var(--paper-2)] p-3 text-[13px]">
                    <p className="font-medium">History</p>
                    {[...f.versions].reverse().map((v) => (
                      <div key={v.version} className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span>
                          rev {v.version} · {v.value} <span className="text-[var(--muted)]">· {v.source || "no source"}</span>
                        </span>
                        <span className="flex items-center gap-2 text-[var(--muted)]">
                          {dateText(v.approvedAt)} <CopyChip value={v.hash} label={`hash ${v.hash.slice(0, 8)}…`} />
                        </span>
                      </div>
                    ))}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="btn btn-line btn-sm" onClick={() => pick(f.key)}>Draft a change</button>
                      {!f.retired ? (
                        <button type="button" className="btn btn-line btn-sm" onClick={() => run(() => act.retire(f.key), `${f.key} retired: reads stop now.`)}>Retire</button>
                      ) : null}
                      <button type="button" className="btn btn-line btn-sm" onClick={() => run(() => act.deleteFact(f.key), `${f.key} deleted with its history.`)}>Delete</button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <form
        className="panel grid content-start gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => act.draft({ key, value, source, group, visibility: vis }), `Draft for ${key} saved. Approve it under Review.`)) {
            setValue("");
            setSource("");
          }
        }}
      >
        <h3>Write a fact</h3>
        <p className="micro text-[var(--muted)]">Acting as {me}. A draft is based on the fact&apos;s current approved version (rev {versionOf(ws.facts[key])}).</p>
        <label className="field">
          Name
          <input className="input mono" value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} placeholder="launch_date" maxLength={48} data-testid="draft-key" />
          {key && !KEY_RE.test(key) ? <span className="micro text-[var(--bad)]">Lower case letters, digits and _ only, starting with a letter.</span> : null}
        </label>
        <label className="field">
          Value
          <textarea className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Tuesday, 8 December" maxLength={LIMITS.valueChars} data-testid="draft-value" />
        </label>
        <label className="field">
          Source (link or note)
          <input className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://… or “Release review notes, 5 Dec”" maxLength={LIMITS.sourceChars} data-testid="draft-source" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            Group
            <select className="input" value={group} onChange={(e) => setGroup(Number(e.target.value))} data-testid="draft-group">
              {ws.groups.map((g, i) => (
                <option key={g} value={i}>{g}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Visibility
            <select className="input" value={vis} onChange={(e) => setVis(Number(e.target.value) as Visibility)} data-testid="draft-visibility">
              {VISIBILITY.map((v, i) => (
                <option key={v} value={i}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" className="btn btn-ink" data-testid="draft-save">Save draft</button>
        <p className="micro text-[var(--muted)]">Passwords, private keys, API keys and recovery phrases are refused before they are saved.</p>
        <Msg err={err} ok={ok} />
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ review

export function ReviewView({ ws, act, me }: { ws: Workspace; act: Actions; me: string }) {
  const { err, ok, run } = useRun();
  const open = ws.drafts.filter((d) => d.status === "open");
  const [sel, setSel] = useState<string[]>([]);
  const chosen = sel.filter((id) => open.some((d) => d.id === id));
  const checks = useMemo(() => checkApprove(ws, chosen, me), [ws, chosen, me]);
  const blocked = checks.some((c) => c.reasons.length);
  const closed = ws.drafts.filter((d) => d.status !== "open").slice(-8).reverse();
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3>Waiting for review</h3>
          <span className="micro text-[var(--muted)]">Acting as {me} · approved together, or not at all</span>
        </div>
        {open.length === 0 ? <p className="note mt-4">Nothing is waiting.</p> : null}
        <div className="row-list mt-3" data-testid="review-list">
          {open.map((d) => {
            const f = ws.facts[d.key];
            const c = current(f);
            const stale = versionOf(f) !== d.basedOn;
            const reasons = checks.find((x) => x.id === d.id)?.reasons ?? [];
            return (
              <label key={d.id} className="flex cursor-pointer gap-3 py-3" data-testid={`draft-${d.id}`}>
                <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={sel.includes(d.id)} onChange={(e) => setSel(e.target.checked ? [...sel, d.id] : sel.filter((x) => x !== d.id))} data-testid={`pick-${d.id}`} />
                <span className="min-w-0 flex-1 text-[14px]">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="mono">{d.key}</span>
                    <span className="chip">{VISIBILITY[d.visibility]}</span>
                    <span className={`chip ${stale ? "warn" : "acc"}`}>based on rev {d.basedOn}</span>
                    <span className="micro text-[var(--muted)]">by {d.author}</span>
                  </span>
                  {c ? <span className="mt-2 block"><span className="diff-old">{c.value}</span></span> : null}
                  <span className="mt-1 block"><span className="diff-new">{d.value}</span></span>
                  {d.source ? <span className="micro mt-1 block text-[var(--muted)]">Evidence · {d.source}</span> : null}
                  {stale ? <span className="micro mt-1 block text-[var(--warn)]">Stale: the fact is now at rev {versionOf(f)}. This draft cannot overwrite it.</span> : null}
                  {reasons.length && !stale ? <span className="micro mt-1 block text-[var(--bad)]">{reasons.join(" · ")}</span> : null}
                </span>
                <span className="flex flex-col gap-1.5">
                  <button type="button" className="btn btn-line btn-sm" onClick={(e) => { e.preventDefault(); run(() => act.reject(d.id), `${d.id} rejected.`); }}>Reject</button>
                  {d.author === me ? (
                    <button type="button" className="btn btn-line btn-sm" onClick={(e) => { e.preventDefault(); run(() => act.withdraw(d.id), `${d.id} withdrawn.`); }}>Withdraw</button>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-accent"
            disabled={!chosen.length || blocked}
            onClick={() => run(async () => { await act.approve(chosen); setSel([]); }, `${chosen.length} change(s) approved together.`)}
            data-testid="approve-batch"
          >
            Approve {chosen.length || ""} {chosen.length === 1 ? "change" : "changes"}
          </button>
          {blocked ? <span className="micro text-[var(--bad)]">The batch would be refused as a whole: fix or unselect the marked drafts.</span> : null}
        </div>
        <Msg err={err} ok={ok} />
      </div>
      <div className="panel">
        <h3>Recently closed</h3>
        <div className="row-list mt-3 text-[13px]">
          {closed.length === 0 ? <p className="py-2 text-[var(--muted)]">None yet.</p> : null}
          {closed.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate">
                <span className="mono">{d.key}</span> · {d.value}
              </span>
              <span className={`chip ${d.status === "approved" ? "ok" : "no"}`}>{d.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ assistants

function GrantForm({ ws, init, onSave, label }: { ws: Workspace; init?: Assistant; onSave: (g: GrantInput) => Promise<boolean>; label: string }) {
  const [name, setName] = useState(init?.label ?? "");
  const [groups, setGroups] = useState<number[]>(init?.groups ?? [0]);
  const [lvl, setLvl] = useState<0 | 1>(init?.maxVisibility ?? 0);
  const [days, setDays] = useState(init ? Math.max(1, Math.ceil((init.expiresAt - now()) / 86400)) : 30);
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await onSave({ label: name, groups, maxVisibility: lvl, days })) && !init) setName("");
      }}
    >
      <label className="field">
        Assistant name
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Writing assistant" maxLength={LIMITS.labelChars} data-testid="grant-label" />
      </label>
      <fieldset className="field">
        <legend className="mb-1">Groups it may read</legend>
        <div className="flex flex-wrap gap-2">
          {ws.groups.map((g, i) => (
            <label key={g} className={`chip cursor-pointer ${groups.includes(i) ? "acc" : ""}`}>
              <input type="checkbox" className="sr-only" checked={groups.includes(i)} onChange={(e) => setGroups(e.target.checked ? [...groups, i] : groups.filter((x) => x !== i))} data-testid={`grant-group-${i}`} />
              {g}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          Level
          <select className="input" value={lvl} onChange={(e) => setLvl(Number(e.target.value) as 0 | 1)} data-testid="grant-level">
            <option value={0}>Shareable only</option>
            <option value={1}>Shareable + internal</option>
          </select>
        </label>
        <label className="field">
          Expires in (days)
          <input className="input" type="number" min={1} max={LIMITS.maxGrantDays} value={days} onChange={(e) => setDays(Number(e.target.value))} data-testid="grant-days" />
        </label>
      </div>
      <button type="submit" className="btn btn-ink" data-testid="grant-save">{label}</button>
    </form>
  );
}

export function AssistantsView({ ws, act, hosted, origin }: { ws: Workspace; act: Actions; hosted: boolean; origin: string }) {
  const { err, ok, run } = useRun();
  const [token, setToken] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [peek, setPeek] = useState<string | null>(ws.assistants[0]?.id ?? null);
  const t = now();
  const preview = peek ? readFor(ws, peek, t) : null;
  const pa = ws.assistants.find((a) => a.id === peek);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="panel min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3>Assistants</h3>
          <button type="button" className="btn btn-line btn-sm" onClick={() => run(() => act.pause(!ws.paused), ws.paused ? "Reads resumed." : "Project paused: every read is refused.")} data-testid="pause-toggle">
            {ws.paused ? "Resume reads" : "Pause all reads"}
          </button>
        </div>
        {ws.assistants.length === 0 ? <p className="note mt-4">No assistant can read anything yet. Add one on the right.</p> : null}
        <div className="row-list mt-3" data-testid="assistants-list">
          {ws.assistants.map((a) => {
            const expired = a.expiresAt <= t;
            return (
              <div key={a.id} className="py-3" data-testid={`assistant-${a.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" className="min-w-0 text-left" onClick={() => setPeek(a.id)}>
                    <span className="text-[15px] font-medium">{a.label}</span>
                    <span className="mono ml-2 text-[12px] text-[var(--muted)]">{a.id}</span>
                  </button>
                  <span className="flex flex-wrap gap-1.5">
                    {a.revoked ? <span className="chip no">revoked</span> : expired ? <span className="chip no">expired</span> : <span className="chip ok">live</span>}
                    <span className="chip">{a.groups.map((g) => ws.groups[g]).join(", ")}</span>
                    <span className="chip">{a.maxVisibility ? "+ internal" : "shareable"}</span>
                    {a.chainGrant ? <span className="chip acc">on chain #{a.chainGrant}</span> : null}
                  </span>
                </div>
                <p className="micro mt-1 text-[var(--muted)]">Expires {dateText(a.expiresAt)} · grant revision {a.revision}</p>
                {!a.revoked ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-line btn-sm" onClick={() => setEdit(edit === a.id ? null : a.id)}>Change grant</button>
                    <button type="button" className="btn btn-line btn-sm" onClick={() => run(() => act.revoke(a.id), `${a.label} revoked: its next read is refused.`)} data-testid={`revoke-${a.id}`}>Revoke</button>
                    {act.simulateRead ? (
                      <button type="button" className="btn btn-line btn-sm" onClick={() => run(() => act.simulateRead!(a.id), "Read simulated: see Receipts.")} data-testid={`simread-${a.id}`}>Simulate a read</button>
                    ) : null}
                  </div>
                ) : null}
                {edit === a.id ? (
                  <div className="mt-3 rounded-[14px] bg-[var(--paper-2)] p-3">
                    <GrantForm ws={ws} init={a} label="Save grant" onSave={(g) => run(async () => { await act.changeAssistant(a.id, g); setEdit(null); }, "Grant changed: the next read follows it.")} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {pa && preview ? (
          <div className="mt-4 rounded-[16px] border border-[var(--line)] p-4" data-testid="read-preview">
            <p className="text-[14px] font-medium">What {pa.label} receives on its next read</p>
            {preview.ok ? (
              <>
                {preview.facts.length === 0 ? <p className="micro mt-2 text-[var(--muted)]">No facts.</p> : null}
                {preview.facts.map((f) => (
                  <p key={f.key} className="mt-2 text-[13px]">
                    <span className="mono">{f.key}</span> <span className="chip acc">rev {f.version}</span> {f.value}
                  </p>
                ))}
                <div className="mt-3 grid gap-1">
                  {Object.values(ws.facts)
                    .map((f) => ({ f, m: readMask(ws, pa, f, t) }))
                    .filter((x) => x.m !== 0n)
                    .map(({ f, m }) => (
                      <p key={f.key} className="micro text-[var(--muted)]">
                        <span className="mono">{f.key}</span>: {bitWords(m).join(", ")}
                      </p>
                    ))}
                </div>
              </>
            ) : (
              <p className="note bad mt-2 text-[13px]">Refused: {preview.error} No fact text is returned.</p>
            )}
          </div>
        ) : null}
        <Msg err={err} ok={ok} />
      </div>
      <div className="panel grid content-start gap-3">
        <h3>Add an assistant</h3>
        <p className="micro text-[var(--muted)]">{hosted ? "You get a key for this assistant. It is shown once; only a hash of its secret is stored." : "Practice keys are simulated in your browser. Sign in for a real key."}</p>
        <GrantForm
          ws={ws}
          label="Create key"
          onSave={(g) =>
            run(async () => {
              const tk = await act.addAssistant(g);
              setToken(tk);
            }, "Assistant added.")
          }
        />
        {token ? (
          <div className="note warn grid gap-2" data-testid="new-token">
            <p className="font-medium">Copy this key now. It will not be shown again.</p>
            <code className="mono break-all text-[12px]" data-testid="new-token-value">{token}</code>
            <CopyChip value={token} label="Copy key" />
            <div className="codebox mt-1">{`curl -H "Authorization: Bearer ${token.slice(0, 18)}…" \\\n  "${origin}/api/facts?format=text"`}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ receipts

export function ReceiptsView({ ws }: { ws: Workspace }) {
  const rows = ws.receipts.slice(0, 60);
  const root = rows.length ? merkleRoot(rows.map(receiptLeaf)) : null;
  return (
    <div className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3>Read receipts</h3>
        <span className="micro text-[var(--muted)]">Receipts hold names, versions and hashes. Never fact text.</span>
      </div>
      {rows.length === 0 ? <p className="note mt-4">No reads yet.</p> : null}
      <div className="scroll-x mt-3">
        <table className="tbl min-w-[640px]" data-testid="receipts-table">
          <thead>
            <tr>
              <th>Read</th>
              <th>When</th>
              <th>Assistant</th>
              <th>Versions returned</th>
              <th>Via</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid={`receipt-${r.id}`}>
                <td className="mono text-[12px]">{r.id}</td>
                <td className="text-[13px]">{dateText(r.at)}</td>
                <td>{r.label}</td>
                <td className="text-[13px]">
                  {r.denied ? <span className="chip no">refused: {r.denied}</span> : r.items.length ? r.items.map((i) => `${i.key} rev ${i.version}`).join(", ") : "no facts"}
                  {r.withheld ? <span className="micro ml-2 text-[var(--muted)]">+{r.withheld} withheld</span> : null}
                </td>
                <td className="mono text-[12px]">{r.via}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {root ? (
        <p className="micro mt-4 flex flex-wrap items-center gap-2 text-[var(--muted)]">
          Merkle root of these {rows.length} receipts (what the Chain tab anchors): <CopyChip value={root} label={`${root.slice(0, 12)}…`} />
        </p>
      ) : null}
    </div>
  );
}
