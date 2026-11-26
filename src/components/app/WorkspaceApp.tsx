"use client";

import { useEffect, useMemo, useState } from "react";
import { addAssistant, addDraft, addReceipt, approve, changeAssistant, closeDraft, deleteFact, readFor, receiptItems, retire, revokeAssistant, type Workspace } from "@/lib/facts/model";
import { PRACTICE_EDITOR, PRACTICE_REVIEWER, sampleWorkspace } from "@/lib/facts/sample";
import { storageKey } from "@/config/storage";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { SampleBadge } from "@/components/site/PageHead";
import { AssistantsView, FactsView, ReceiptsView, ReviewView, type Actions } from "@/components/app/Views";
import { ChainPanel } from "@/components/app/ChainPanel";
import { useHosted } from "@/components/app/useHosted";

/*
 * The workspace app. Two modes over the same views and the same rules:
 *   Practice  sample data in this browser (localStorage), two roles (editor, reviewer) so review rules can be tried; reads are
 *             simulated with the same function the server uses.
 *   Hosted    the signed-in wallet's own project on the server: real assistant keys, the real read API, receipts, the chain tab.
 */

const TABS = ["Facts", "Review", "Assistants", "Receipts", "Chain"] as const;
type Tab = (typeof TABS)[number];
const PKEY = storageKey("practice");
const now = () => Math.floor(Date.now() / 1000);

function loadPractice(): Workspace {
  try {
    const raw = localStorage.getItem(PKEY);
    if (raw) {
      const v = JSON.parse(raw) as Workspace;
      if (v?.v === 1 && v.facts) return v;
    }
  } catch {
    // storage blocked: start from the sample
  }
  return sampleWorkspace();
}

export function WorkspaceApp() {
  const [mode, setMode] = useState<"practice" | "hosted">("practice");
  const [tab, setTab] = useState<Tab>("Facts");
  const [practice, setPractice] = useState<Workspace>(() => loadPractice());
  const [role, setRole] = useState<"editor" | "reviewer">("editor");
  const hosted = useHosted();
  const { open } = useWalletModal();
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    try {
      localStorage.setItem(PKEY, JSON.stringify(practice));
    } catch {
      // private mode: the practice workspace lives for this visit only
    }
  }, [practice]);

  const me = mode === "practice" ? (role === "editor" ? PRACTICE_EDITOR : PRACTICE_REVIEWER) : (hosted.address ?? "").toLowerCase();

  const practiceActs: Actions = useMemo(() => {
    const up = (fn: (w: Workspace) => Workspace) =>
      new Promise<void>((resolve, reject) => {
        try {
          const next = fn(practice);
          setPractice(next);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    return {
      draft: (input) => up((w) => addDraft(w, input, me, now()).ws),
      approve: (ids) => up((w) => approve(w, ids, me, now())),
      reject: (id) => up((w) => closeDraft(w, id, "rejected", me, now())),
      withdraw: (id) => up((w) => closeDraft(w, id, "withdrawn", me, now())),
      retire: (key) => up((w) => retire(w, key)),
      deleteFact: (key) => up((w) => deleteFact(w, key)),
      addAssistant: async (g) => {
        const id = `rk_${Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, "0")).join("")}`;
        await up((w) => addAssistant(w, g, id, now()));
        return null;
      },
      changeAssistant: (id, g) => up((w) => changeAssistant(w, id, g, now())),
      revoke: (id) => up((w) => revokeAssistant(w, id)),
      pause: (p) => up((w) => ({ ...w, paused: p, rev: w.rev + 1 })),
      simulateRead: (id) =>
        up((w) => {
          const t = now();
          const a = w.assistants.find((x) => x.id === id);
          const r = readFor(w, id, t);
          return addReceipt(w, { at: t, assistant: id, label: a?.label ?? id, items: r.ok ? receiptItems(r.facts) : [], withheld: r.ok ? r.withheld : 0, denied: r.ok ? undefined : r.error, via: "practice" }).ws;
        }),
    };
  }, [practice, me]);

  const hostedActs: Actions = useMemo(() => {
    const op = async (o: Record<string, unknown>) => {
      await hosted.call(o);
    };
    return {
      draft: (input) => op({ op: "draft", input }),
      approve: (ids) => op({ op: "approve", ids }),
      reject: (id) => op({ op: "reject", id }),
      withdraw: (id) => op({ op: "withdraw", id }),
      retire: (key) => op({ op: "retire", key }),
      deleteFact: (key) => op({ op: "deleteFact", key }),
      addAssistant: async (grant) => (await hosted.call({ op: "addAssistant", grant })).token,
      changeAssistant: (id, grant) => op({ op: "changeAssistant", id, grant }),
      revoke: (id) => op({ op: "revokeAssistant", id }),
      pause: (paused) => op({ op: "pause", paused }),
    };
  }, [hosted]);

  const ws = mode === "practice" ? practice : hosted.ws;
  const acts = mode === "practice" ? practiceActs : hostedActs;
  const openDrafts = ws ? ws.drafts.filter((d) => d.status === "open").length : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="tabs" role="tablist" aria-label="Workspace mode">
          <button type="button" role="tab" aria-selected={mode === "practice"} onClick={() => setMode("practice")} data-testid="mode-practice">
            Practice (no wallet)
          </button>
          <button type="button" role="tab" aria-selected={mode === "hosted"} onClick={() => setMode("hosted")} data-testid="mode-hosted">
            My hosted project
          </button>
        </div>
        {mode === "practice" ? (
          <div className="flex flex-wrap items-center gap-3">
            <SampleBadge />
            <div className="tabs" role="tablist" aria-label="Practice role">
              <button type="button" role="tab" aria-selected={role === "editor"} onClick={() => setRole("editor")} data-testid="role-editor">Editor</button>
              <button type="button" role="tab" aria-selected={role === "reviewer"} onClick={() => setRole("reviewer")} data-testid="role-reviewer">Reviewer</button>
            </div>
            <button type="button" className="btn btn-line btn-sm" onClick={() => setPractice(sampleWorkspace())} data-testid="practice-reset">Reset sample</button>
          </div>
        ) : hosted.session ? (
          <div className="flex flex-wrap items-center gap-3">
            {hosted.storage === "memory" ? <span className="badge sample" data-testid="storage-memory">Not configured: saved data may be lost on restart</span> : null}
            <button type="button" className="btn btn-line btn-sm" onClick={hosted.signOut}>Sign out</button>
          </div>
        ) : null}
      </div>

      {mode === "hosted" && !hosted.session ? (
        <div className="panel mt-6 grid max-w-[640px] gap-3" data-testid="hosted-signin">
          <h3>Your own project</h3>
          <p className="text-[15px] text-[var(--muted)]">
            Sign one message with your wallet (no gas, nothing moves). It proves you own the address; the server checks it on every request for this tab. One project per wallet in this version.
          </p>
          {hosted.address ? (
            <button type="button" className="btn btn-accent w-max" disabled={hosted.busy} onClick={() => hosted.signIn().catch(() => {})} data-testid="hosted-sign">
              {hosted.busy ? "Check your wallet…" : "Sign in with this wallet"}
            </button>
          ) : (
            <button type="button" className="btn btn-accent w-max" onClick={open} data-testid="hosted-connect">
              Connect a wallet
            </button>
          )}
          {hosted.error ? <p className="note bad">{hosted.error}</p> : null}
        </div>
      ) : null}

      {mode === "hosted" && hosted.session && hosted.loaded && !hosted.ws ? (
        <form
          className="panel mt-6 grid max-w-[640px] gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            hosted.call({ op: "create", name }).catch(() => {});
          }}
          data-testid="hosted-create"
        >
          <h3>Create your project</h3>
          <label className="field">
            Project name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Release" maxLength={60} data-testid="project-name" />
          </label>
          <button type="submit" className="btn btn-accent w-max" disabled={hosted.busy} data-testid="project-create">Create</button>
          {hosted.error ? <p className="note bad">{hosted.error}</p> : null}
        </form>
      ) : null}

      {ws ? (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="tabs" role="tablist" aria-label="Workspace sections">
              {TABS.map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`tab-${t.toLowerCase()}`}>
                  {t}
                  {t === "Review" && openDrafts ? <span className="chip warn ml-2">{openDrafts}</span> : null}
                </button>
              ))}
            </div>
            <p className="micro text-[var(--muted)]">
              {ws.name} {ws.paused ? <span className="chip no ml-1">paused</span> : null}
            </p>
          </div>
          <div className="mt-5">
            {tab === "Facts" ? <FactsView ws={ws} act={acts} me={me} /> : null}
            {tab === "Review" ? <ReviewView ws={ws} act={acts} me={me} /> : null}
            {tab === "Assistants" ? <AssistantsView ws={ws} act={acts} hosted={mode === "hosted"} origin={origin} /> : null}
            {tab === "Receipts" ? <ReceiptsView ws={ws} /> : null}
            {tab === "Chain" ? (
              <ChainPanel
                ws={ws}
                hosted={mode === "hosted"}
                link={{ chain: async (project) => void (await hosted.call({ op: "linkChain", project })), grant: async (id, grant) => void (await hosted.call({ op: "linkGrant", id, grant })) }}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
