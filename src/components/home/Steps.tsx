"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "@/components/site/Icons";
import { SampleBadge } from "@/components/site/PageHead";

/*
 * "How a fact travels" (MOTION.txt 7): a dotted timeline that fills as you scroll through a sticky stage; the two-colour heading
 * and the panel swap per step; a dark toast pops for each step. Below 900 px the four steps simply stack. Sample data, labelled.
 */

const STEPS = [
  { k: "Step 1", t: "Write", h: "Write it once.", d: "With its source, in the right group.", toast: "Draft saved" },
  { k: "Step 2", t: "Review", h: "Approve it.", d: "Every change lands together, or not at all.", toast: "Approved together" },
  { k: "Step 3", t: "Grant", h: "Choose who reads it.", d: "One key per assistant, scoped to groups.", toast: "Grant updated" },
  { k: "Step 4", t: "Read", h: "Every read leaves a receipt.", d: "Which version, which assistant, when.", toast: "Receipt recorded" },
];

function Row({ k, v, tone }: { k: string; v: React.ReactNode; tone?: "ok" | "no" | "warn" | "acc" }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
      <span className="text-[var(--muted)]">{k}</span>
      {tone ? <span className={`chip ${tone}`}>{v}</span> : <span className="min-w-0 truncate text-right">{v}</span>}
    </div>
  );
}

function Panel({ i }: { i: number }) {
  if (i === 0)
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.3fr]">
        <div className="card-solid p-5">
          <p className="micro mono text-[var(--muted)]">new fact · draft</p>
          <p className="mt-3 text-[22px] tracking-[-0.03em]">launch_date</p>
          <div className="row-list mt-3">
            <Row k="Value" v="Tuesday, 8 December" />
            <Row k="Source" v="Release review notes, 5 Dec" />
            <Row k="Group" v="Release" />
            <Row k="Visibility" v="Shareable" tone="ok" />
            <Row k="Based on" v="rev 1" tone="acc" />
          </div>
        </div>
        <div className="card-solid p-5">
          <p className="micro mono text-[var(--muted)]">secrets stay out</p>
          <p className="mt-3 text-[15px]">Passwords, private keys, API keys and recovery phrases are refused before they are saved, and never echoed back.</p>
          <div className="note bad mt-4 text-[13px]">“wallet: abandon ability able about …” looks like a recovery phrase. It was not saved.</div>
          <div className="mt-5 grid gap-2">
            <div className="skeleton w-[70%]" />
            <div className="skeleton w-[90%]" />
            <div className="skeleton w-[55%]" />
          </div>
        </div>
      </div>
    );
  if (i === 1)
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.3fr_1fr]">
        <div className="card-solid p-5">
          <div className="flex items-center justify-between">
            <p className="micro mono text-[var(--muted)]">review · batch of 2</p>
            <span className="chip acc">all or nothing</span>
          </div>
          <div className="row-list mt-3">
            <div className="py-3 text-[14px]">
              <p>launch_date <span className="chip ml-1">Shareable</span></p>
              <p className="mt-2"><span className="diff-old">Monday, 7 December</span></p>
              <p className="mt-1"><span className="diff-new">Tuesday, 8 December</span></p>
            </div>
            <div className="py-3 text-[14px]">
              <p>freeze_rule <span className="chip ml-1">Internal</span></p>
              <p className="mt-2"><span className="diff-new">Release branch freezes Sunday, 6 December</span></p>
            </div>
          </div>
          <span className="btn btn-ink btn-sm mt-3">Approve 2 changes</span>
        </div>
        <div className="card-solid p-5">
          <p className="micro mono text-[var(--muted)]">held back</p>
          <p className="mt-3 text-[15px]">launch_date · “Wednesday, 9 December”</p>
          <p className="mt-2 text-[14px] text-[var(--muted)]">Built on rev 1 by another editor; the fact is now at rev 2. It cannot overwrite the newer version.</p>
          <span className="chip warn mt-4">stale draft</span>
        </div>
      </div>
    );
  if (i === 2)
    return (
      <div className="card-solid scroll-x p-5">
        <table className="tbl min-w-[520px]">
          <thead>
            <tr>
              <th>Fact</th>
              <th>Writing assistant</th>
              <th>Coding assistant</th>
              <th>Support assistant</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>launch_date</td><td><span className="chip ok">reads rev 2</span></td><td><span className="chip ok">reads rev 2</span></td><td><span className="chip">not in grant</span></td></tr>
            <tr><td>freeze_rule · Internal</td><td><span className="chip">above level</span></td><td><span className="chip ok">reads rev 1</span></td><td><span className="chip">not in grant</span></td></tr>
            <tr><td>support_hours</td><td><span className="chip ok">reads rev 1</span></td><td><span className="chip">not in grant</span></td><td><span className="chip ok">reads rev 1</span></td></tr>
            <tr><td>price_floor_note · Workspace only</td><td><span className="chip no">never sent</span></td><td><span className="chip no">never sent</span></td><td><span className="chip no">never sent</span></td></tr>
          </tbody>
        </table>
      </div>
    );
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.2fr]">
      <div className="card-solid p-5">
        <div className="flex items-center justify-between">
          <p className="micro mono">READ rd_mi4k2a</p>
          <span className="micro mono text-[var(--muted)]">14:04:57 UTC</span>
        </div>
        <div className="row-list mt-3">
          <Row k="Assistant" v="Writing assistant" />
          <Row k="launch_date" v="rev 2" tone="acc" />
          <Row k="support_hours" v="rev 1" tone="acc" />
          <Row k="Value" v="not recorded" />
        </div>
      </div>
      <div className="codebox">{`GET /api/facts?format=text
Authorization: Bearer rk_…

- launch_date (rev 2): Tuesday, 8 December
  source: Release review notes, 5 Dec
- support_hours (rev 1): Weekdays 09:00–17:00 UTC`}</div>
    </div>
  );
}

export function Steps() {
  const stage = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const onMq = () => setWide(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    const onScroll = () => {
      const el = stage.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = Math.min(0.999, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
      setStep(Math.floor(p * STEPS.length));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const go = (i: number) => {
    const el = stage.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + ((el.offsetHeight - window.innerHeight) * (i + 0.5)) / STEPS.length, behavior: "smooth" });
  };

  if (!wide)
    return (
      <div className="grid grid-cols-1 gap-16 py-20">
        {STEPS.map((s, i) => (
          <div key={s.t} className="min-w-0" data-reveal="">
            <p className="tag">{s.k} · {s.t}</p>
            <h3 className="h-sec mt-4">
              {s.h} <span className="dim">{s.d}</span>
            </h3>
            <div className="mt-6">
              <Panel i={i} />
            </div>
          </div>
        ))}
        <SampleBadge />
      </div>
    );

  return (
    <div ref={stage} style={{ height: "380vh" }} className="relative">
      <div className="sticky top-0 flex h-screen flex-col justify-center py-10">
        <div className="steps-rail" style={{ "--fill": `${(step / (STEPS.length - 1)) * 87.5 + 12.5}%` } as React.CSSProperties}>
          <span className="fill" aria-hidden="true" />
          {STEPS.map((s, i) => (
            <button key={s.t} type="button" className={i === step ? "on" : i < step ? "done" : ""} onClick={() => go(i)} aria-current={i === step ? "step" : undefined}>
              {s.k}
              <b>{s.t}</b>
            </button>
          ))}
        </div>
        <div className="swap mt-12 text-center">
          {STEPS.map((s, i) => (
            <h3 key={s.t} className="h-sec" data-off={i !== step ? "" : undefined} aria-hidden={i !== step}>
              {s.h}
              <br />
              <span className="dim">{s.d}</span>
            </h3>
          ))}
        </div>
        <div className="relative mx-auto mt-10 w-full max-w-[1000px]">
          <div className="swap">
            {STEPS.map((s, i) => (
              <div key={s.t} data-off={i !== step ? "" : undefined} aria-hidden={i !== step}>
                <Panel i={i} />
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2">
            <span key={step} className="toast pop">
              <i>
                <CheckIcon size={12} />
              </i>
              {STEPS[step].toast}
            </span>
          </div>
          <div className="mt-12 text-center">
            <SampleBadge />
          </div>
        </div>
      </div>
    </div>
  );
}
