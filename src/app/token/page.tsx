import Link from "next/link";
import type { Metadata } from "next";
import { BRAND, LAUNCHPAD, TOKEN, buyUrl } from "@/config/brand";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { CaBox } from "@/components/site/CaCopy";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  path: "/token",
  title: `${BRAND.symbol} · the community token of ${BRAND.name}`,
  description: `${BRAND.symbol} on Robinhood Chain: contract address, launch status and token features (concepts). ${BRAND.name} works fully without it.`,
});

const FEATURES = [
  ["More projects per wallet", "v1 allows one hosted project per wallet."],
  ["More facts per project", "v1 allows 100 facts and 60 open drafts."],
  ["More assistant keys", "v1 allows 12 live keys per project."],
];

export default function TokenPage() {
  return (
    <div className="paper pb-32">
      <PageHead eyebrow={BRAND.symbol} title={`The community token of ${BRAND.name}.`}>
        <p>{TOKEN.isLive ? "Live on Robinhood Chain. Only trust the address below." : "Not launched yet. The contract address and the launchpad are TBA."} You never need it to use {BRAND.name}.</p>
      </PageHead>
      <div className="wrap grid max-w-[860px] grid-cols-1 gap-5">
        <div className="panel">
          <h3>Contract address</h3>
          <div className="mt-4">
            <CaBox testid="token-ca" />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {TOKEN.isLive ? (
              <a className="btn btn-accent" href={buyUrl()} target="_blank" rel="noreferrer">
                Open on {LAUNCHPAD.name}
              </a>
            ) : (
              <span className="btn btn-line" aria-disabled="true">At launch</span>
            )}
            <a className="btn btn-line" href={BRAND.x} target="_blank" rel="noreferrer">
              {BRAND.xHandle} on X
            </a>
          </div>
          <p className="micro mt-4 text-[var(--muted)]">We never DM first. The only address is the one on this page and on {BRAND.xHandle}.</p>
        </div>
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3>Token features</h3>
            <StatusBadge status="Concept" />
          </div>
          <p className="mt-2 text-[14px] text-[var(--muted)]">These are concepts, not built yet. The core product is free and works without the token or a wallet.</p>
          <div className="row-list mt-3">
            {FEATURES.map(([f, n]) => (
              <div key={f} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="font-medium">{f}</span>
                <span className="text-[14px] text-[var(--muted)]">{n}</span>
              </div>
            ))}
          </div>
          <p className="micro mt-4 text-[var(--muted)]">No promise of value, returns or rewards. Holding {BRAND.symbol} gives no rights over {BRAND.name} or anyone&apos;s data.</p>
        </div>
        <p className="text-center text-[14px]">
          <Link className="underline" href="/app">Use {BRAND.name} now, without the token</Link>
        </p>
      </div>
    </div>
  );
}
