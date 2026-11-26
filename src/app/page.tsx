import Link from "next/link";
import type { Metadata } from "next";
import { BRAND, CHAIN } from "@/config/brand";
import { CONTRACTS, ledgerLive } from "@/config/contracts";
import { CaBox } from "@/components/site/CaCopy";
import { DotGlyph, LedArt } from "@/components/site/Led";
import { SampleBadge, StatusBadge } from "@/components/site/PageHead";
import { CheckIcon, KeyIcon, ReceiptIcon } from "@/components/site/Icons";
import { Words } from "@/components/home/Words";
import { Steps } from "@/components/home/Steps";
import { ScrollFx } from "@/components/home/ScrollFx";
import { Counters } from "@/components/home/Counters";
import { CARD, KEY, RECEIPT } from "@/components/home/LedPanels";
import { HOME_DESCRIPTION, HOME_TITLE, appLd, ldJson, pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({ path: "/", title: HOME_TITLE, description: HOME_DESCRIPTION });

const SPEAKS = [
  { t: "GET /api/facts", s: "JSON for code", x: "8%", y: "4%", v: 0.1 },
  { t: "?format=text", s: "plain text for prompts", x: "52%", y: "12%", v: -0.18 },
  { t: "read_facts", s: "a read-only JSON-RPC tool at /api/mcp", x: "20%", y: "30%", v: 0.22 },
  { t: "Sign-In with Ethereum", s: "owner sign-in, no gas", x: "60%", y: "42%", v: -0.08 },
  { t: "RexsonFactLedger", s: `public change log on ${CHAIN.name}`, x: "6%", y: "58%", v: 0.16 },
  { t: "Read receipts", s: "versions and hashes, never fact text", x: "50%", y: "72%", v: -0.2 },
  { t: "One key per assistant", s: "scoped to groups, with an expiry", x: "16%", y: "86%", v: 0.06 },
];

const CAPS = [
  {
    t: "Facts with a history",
    d: "Every fact has a name, a value, a source and a version. Drafts are reviewed before anyone reads them, a batch lands together or not at all, and a draft built on an older version is held back instead of overwriting a newer one.",
    art: CARD,
    label: "FACT · rev 2",
    href: "/app",
  },
  {
    t: "Access you can scope",
    d: "Each assistant gets its own key. Its grant names the fact groups it may read, a level (shareable, or shareable and internal) and an expiry. Workspace-only facts never leave. Revoke a key and the next read is refused.",
    art: KEY,
    label: "GRANT · 2 groups",
    href: "/app",
  },
  {
    t: "Receipts for every read",
    d: "Each read is recorded: which assistant, which fact versions, when, by which format. Receipts hold names, versions and hashes, never the text. Batches of receipts can be anchored on chain as a Merkle root.",
    art: RECEIPT,
    label: "READ · rd_mi4k2a",
    href: "/docs#receipts",
  },
];

const SCENES = [
  {
    big: "rev 1 → 2",
    unit: "launch_date",
    sub: "approved once",
    lead: "The launch date moves. Approve the new date once, and the next read of every assistant with access returns it.",
    what: "Before approval the old date is still what assistants receive; the draft is invisible to them. After approval, the very next read carries rev 2, and its receipt says so.",
    ico: <CheckIcon size={16} />,
  },
  {
    big: "0 facts",
    unit: "after revoke",
    sub: "next read refused",
    lead: "An assistant should no longer see the project. Revoke its key; its next read is refused and returns no fact text.",
    what: "The refusal is recorded as a receipt too. If the grant was also issued on Robinhood Chain, the server checks it there before every read, and fails closed when the chain cannot be read.",
    ico: <KeyIcon size={16} />,
  },
  {
    big: "held",
    unit: "stale draft",
    sub: "built on rev 1, fact at rev 2",
    lead: "Two editors change the same fact. The second draft was written against an older version, so it is held back.",
    what: "Nothing is silently overwritten. The same rule runs in the browser, on the server and in the ledger contract, which refuses the whole batch.",
    ico: <ReceiptIcon size={16} />,
  },
];

const STATUS: { f: string; s: "Prototype" | "Concept"; n: string }[] = [
  { f: "Facts, drafts, batch approval, retire, delete", s: "Prototype", n: "Practice mode in your browser, or hosted after one free signature." },
  { f: "Assistant keys with groups, level and expiry", s: "Prototype", n: "Hosted keys are shown once; only a hash of the secret is stored." },
  { f: "Read API: JSON, plain text, JSON-RPC tool", s: "Prototype", n: "GET /api/facts and POST /api/mcp, tested end to end." },
  { f: "Read receipts without fact text", s: "Prototype", n: "Kept in their own list, newest 300 per project." },
  { f: "On-chain change log (RexsonFactLedger)", s: "Prototype", n: ledgerLive() ? "Live on Robinhood Chain." : "Built and tested; the owner deploys it. Until then the ledger page says so." },
  { f: "Teams with several editors and reviewers", s: "Concept", n: "The contract supports roles; the hosted workspace is one owner in v1." },
  { f: `Token features (${BRAND.symbol})`, s: "Concept", n: "More projects, facts and assistant keys. Not built yet." },
];

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={ldJson(appLd)} />
      <ScrollFx />

      {/* 1 · hero */}
      <section className="hero" data-led="mark">
        <div className="field" aria-hidden="true" />
        <div className="beam" aria-hidden="true" />
        <div className="flare" aria-hidden="true" />
        <div className="card-led" aria-hidden="true">
          <div className="flex items-center justify-between">
            <span>launch_date</span>
            <span style={{ color: "var(--accent-2)" }}>Shareable</span>
          </div>
          <div className="val">Tuesday, 8 December</div>
          <div className="meta">rev 2 · approved · was Monday, 7 Dec</div>
        </div>
        <div className="wrap copy">
          <h1 className="h-hero mx-auto max-w-[760px]">
            <Words text="Approved memory" />
            <br />
            <Words text="for AI" start={140} /> <Words className="accent" text="assistants." start={280} />
          </h1>
          <p className="lede mx-auto mt-5 max-w-[620px]" data-reveal="" style={{ "--delay": "300ms" } as React.CSSProperties}>
            {BRAND.tagline} One versioned source of project facts that every assistant you use reads from, within the access you grant.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3" data-reveal="" style={{ "--delay": "420ms" } as React.CSSProperties}>
            <Link href="/app" className="btn btn-accent">
              Try it without a wallet <DotGlyph />
            </Link>
            <Link href="#how" className="btn btn-line">
              How it works
            </Link>
          </div>
          <div className="mx-auto mt-6 w-full max-w-[460px]" data-reveal="" style={{ "--delay": "520ms" } as React.CSSProperties}>
            <CaBox testid="hero-ca" />
          </div>
        </div>
      </section>

      {/* 2 · tunnel statement */}
      <section className="night tunnel" data-sq="" data-led="read" aria-label="What Rexson is for">
        {[860, 700, 560, 440].map((s, i) => (
          <span key={s} className="frame" aria-hidden="true" style={{ width: s, height: s * 0.82, opacity: 0.25 + i * 0.12, maxWidth: "94vw" }} />
        ))}
        <span className="glow-square" aria-hidden="true" />
        <div className="wrap relative text-center">
          <h2 className="h-sec mx-auto max-w-[760px]" data-reveal="">
            Stop explaining your project
            <br />
            to every assistant, again.
          </h2>
          <p className="lede mx-auto mt-5 max-w-[560px]" data-reveal="" style={{ "--delay": "120ms" } as React.CSSProperties}>
            Approve a fact once. Each assistant you trust reads the current version, and only the facts you chose for it.
          </p>
        </div>
      </section>

      {/* 3 · how a fact travels */}
      <section id="how" className="paper" data-led="write">
        <div className="wrap pt-24">
          <div className="text-center">
            <p className="tag" data-reveal="">How a fact travels</p>
          </div>
          <Steps />
        </div>
      </section>

      {/* 4 · the app, with sample data */}
      <section className="paper pb-28" data-led="read">
        <div className="wrap">
          <div className="text-center">
            <h2 className="h-sec" data-reveal="">
              This is the app.
              <br />
              <span className="dim">Your memory. In your hands.</span>
            </h2>
          </div>
          <div className="browser mx-auto mt-14 max-w-[1040px]" data-reveal="">
            <div className="bar">
              <span>{BRAND.domain}/app</span>
            </div>
            <div className="grid md:grid-cols-[220px_1fr]">
              <aside className="hidden border-r border-[var(--line)] p-4 md:block">
                <p className="flex items-center gap-2 text-[15px]">
                  <span className="h-3 w-3 rounded-full bg-[var(--accent)]" /> Release
                </p>
                {["Facts", "Review", "Assistants", "Receipts", "Chain"].map((t, i) => (
                  <p key={t} className={`mt-2 rounded-[12px] px-3 py-2.5 text-[14px] ${i === 0 ? "bg-[var(--paper-2)]" : "text-[var(--muted)]"}`}>
                    {t}
                  </p>
                ))}
              </aside>
              <div className="p-4 md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[20px] tracking-[-0.03em]">Facts, understood.</p>
                  <SampleBadge />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="card-solid p-4">
                    <p className="micro text-[var(--muted)]">Approved facts</p>
                    <p className="mt-6 text-[34px] tracking-[-0.05em]">5</p>
                    <p className="micro mt-1 text-[var(--muted)]">1 draft waiting</p>
                  </div>
                  <div className="card-solid p-4 md:col-span-2">
                    <p className="micro text-[var(--muted)]">Reads this week</p>
                    <div className="mt-4 flex h-[72px] items-end gap-1.5">
                      {[3, 5, 4, 7, 6, 9, 12].map((v, i) => (
                        <span key={i} className="flex-1 rounded-t-[6px]" style={{ height: `${v * 8}%`, background: i === 6 ? "var(--accent)" : "rgba(255,90,31,.18)" }} />
                      ))}
                    </div>
                  </div>
                  <div className="card-solid scroll-x p-4 md:col-span-3">
                    <table className="tbl min-w-[560px]">
                      <thead>
                        <tr>
                          <th>Fact</th>
                          <th>Current value</th>
                          <th>Version</th>
                          <th>Visibility</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr><td>launch_date</td><td>Monday, 7 December</td><td><span className="chip warn">rev 1 · draft waiting</span></td><td>Shareable</td></tr>
                        <tr><td>support_hours</td><td>Weekdays 09:00–17:00 UTC</td><td><span className="chip acc">rev 1</span></td><td>Shareable</td></tr>
                        <tr><td>freeze_rule</td><td>Release branch freezes 48 hours before launch</td><td><span className="chip acc">rev 1</span></td><td>Internal</td></tr>
                        <tr><td>price_floor_note</td><td>Do not quote below the signed budget</td><td><span className="chip acc">rev 1</span></td><td>Workspace only</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-10 text-center">
            <Link href="/app" className="btn btn-ink">
              Open the practice workspace <DotGlyph />
            </Link>
          </div>
        </div>
      </section>

      {/* 5 · what it speaks (drift band) */}
      <section className="night drift-band" data-led="chain">
        <div className="wrap drift">
          <div>
            <h2 className="h-sec" data-reveal="">
              Plain interfaces,
              <br />
              <span className="dim">nothing to install.</span>
            </h2>
            <p className="lede mt-5 max-w-[380px]" data-reveal="">
              Any assistant that can make an HTTP request can read its facts. No SDK, no plug-in, no vendor lock.
            </p>
            <Link href="/docs#api" className="link-explore mt-8" data-reveal="">
              Read the API <DotGlyph />
            </Link>
          </div>
          <div className="items" data-drift="">
            {SPEAKS.map((s) => (
              <span key={s.t} data-speed={s.v} style={{ left: s.x, top: s.y }}>
                {s.t}
                <small>{s.s}</small>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 6 · capabilities */}
      <section className="paper" data-led="key">
        <div className="wrap pt-24 pb-8">
          <h2 className="h-sec" data-reveal="">What {BRAND.name} does</h2>
          <p className="lede mt-4 max-w-[560px]" data-reveal="">
            Three parts, each working today. The core works without a wallet, without a token and without the chain.
          </p>
        </div>
        {CAPS.map((c, i) => (
          <div key={c.t} className="wrap cap">
            <div className="side" data-reveal="">
              <span className="rail" aria-hidden="true">
                {CAPS.map((_, k) => (
                  <i key={k} className={k === i ? "on" : ""} />
                ))}
              </span>
              <h3 className="h-card">{c.t}</h3>
              <p className="mt-5 text-[16px] leading-[1.6] text-[var(--muted)]">{c.d}</p>
              <Link href={c.href} className="link-explore mt-6">
                Explore <DotGlyph />
              </Link>
            </div>
            <div className="ledpanel" data-reveal="">
              <div className="screen">
                <LedArt rows={c.art} />
              </div>
              <span className="label">
                <i /> {c.label}
              </span>
            </div>
          </div>
        ))}
      </section>

      {/* 7 · scenarios */}
      <section className="paper py-24" data-led="check">
        <div className="wrap">
          <h2 className="h-sec max-w-[760px]" data-reveal="">
            Three moments it is built for.
            <br />
            <span className="dim">Shown with sample data.</span>
          </h2>
          <div className="mt-20 grid gap-28">
            {SCENES.map((s) => (
              <article key={s.big} className="case">
                <div>
                  <div className="art" data-cover="">
                    <span className="cover" aria-hidden="true" />
                    <div className="stat">
                      <span className="ico">{s.ico}</span>
                      <p className="big">{s.big}</p>
                      <p className="mt-2 text-[16px] font-medium">{s.unit}</p>
                      <p className="micro mt-1 opacity-60">{s.sub}</p>
                    </div>
                  </div>
                  <p className="mt-6 max-w-[520px] text-[18px] leading-[1.4]" data-reveal="">
                    {s.lead}
                  </p>
                </div>
                <blockquote data-reveal="">
                  <span className="tag">What happens</span>
                  <p className="mt-3">{s.what}</p>
                </blockquote>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 8 · what runs today */}
      <section className="paper pb-24" data-led="check">
        <div className="wrap">
          <h2 className="h-sec" data-reveal="">
            What runs today.
            <br />
            <span className="dim">What is still a concept.</span>
          </h2>
          <div className="panel scroll-x mt-10" data-reveal="">
            <table className="tbl min-w-[620px]">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {STATUS.map((r) => (
                  <tr key={r.f}>
                    <td className="font-medium">{r.f}</td>
                    <td>
                      <StatusBadge status={r.s} />
                    </td>
                    <td className="text-[var(--muted)]">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="micro mt-4 text-[var(--muted)]">
            {BRAND.name} gives assistants the current approved facts. It cannot promise what an assistant does with them, and it is not affiliated with Robinhood.
          </p>
        </div>
      </section>

      {/* 9 · closing counters */}
      <section className="paper pb-32 pt-16" data-led="arrow">
        <div className="wrap text-center">
          <h2 className="h-sec mx-auto max-w-[760px]" data-reveal="">
            Your assistants are
            <br />
            <span className="dim">one approved read away.</span>
          </h2>
          <div className="mt-14" data-reveal="">
            <Counters />
          </div>
          <p className="micro mt-6 text-[var(--muted)]">
            Read live from {CHAIN.name} through this site&apos;s relay.{" "}
            {ledgerLive() ? (
              <a className="underline" href={`${CHAIN.explorer}/address/${CONTRACTS.ledger}`} target="_blank" rel="noreferrer">
                RexsonFactLedger on the explorer
              </a>
            ) : (
              <Link className="underline" href="/ledger">
                The ledger contract is not deployed yet.
              </Link>
            )}
          </p>
        </div>
      </section>

      {/* 10 · dark closing band with the beam */}
      <section className="hero" style={{ minHeight: 620 }} data-led="mark">
        <div className="field" aria-hidden="true" />
        <div className="beam" aria-hidden="true" style={{ height: "34%" }} />
        <div className="flare" aria-hidden="true" style={{ top: "34%" }} />
        <div className="wrap copy" style={{ paddingBottom: 120 }}>
          <h2 className="h-sec mx-auto max-w-[720px]" data-reveal="">
            Write it down once.
            <br />
            Approve it. Share it on purpose.
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3" data-reveal="">
            <Link href="/app" className="btn btn-accent">
              Open the app <DotGlyph />
            </Link>
            <Link href="/docs" className="btn btn-line">
              Read the docs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
