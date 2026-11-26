import Link from "next/link";
import { BRAND, CHAIN, hasGithub } from "@/config/brand";
import { CONTRACTS, ledgerLive } from "@/config/contracts";
import { Wordmark } from "@/components/site/Mark";
import { LedArt } from "@/components/site/Led";
import { CaBox } from "@/components/site/CaCopy";

const MONITOR = [
  "0000000000000000",
  "0111111111111110",
  "0100000000000010",
  "0101100000000010",
  "0100110000000010",
  "0101100111100010",
  "0100000000000010",
  "0100000000000010",
  "0111111111111110",
  "0000000000000000",
];

export function SiteFooter() {
  return (
    <footer className="night footer" data-led="arrow">
      <div className="wrap">
        <div className="cols">
          <div>
            <div className="ledpanel" style={{ aspectRatio: "4 / 3", maxWidth: 340, background: "transparent" }}>
              <div className="screen" style={{ width: "82%" }}>
                <LedArt rows={MONITOR} />
              </div>
            </div>
            <div className="mt-6 max-w-[340px]">
              <CaBox testid="footer-ca" compact />
            </div>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><Link href="/app">App</Link></li>
              <li><Link href="/#how">How it works</Link></li>
              <li><Link href="/docs">Docs and API</Link></li>
              <li><Link href="/docs#faq">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <h4>On chain</h4>
            <ul>
              <li><Link href="/ledger">Change log</Link></li>
              <li>
                {ledgerLive() ? (
                  <a href={`${CHAIN.explorer}/address/${CONTRACTS.ledger}`} target="_blank" rel="noreferrer">RexsonFactLedger</a>
                ) : (
                  <Link href="/ledger#contract">Ledger contract (not deployed yet)</Link>
                )}
              </li>
              <li><Link href="/token">{BRAND.symbol}</Link></li>
            </ul>
          </div>
          <div>
            <h4>Follow</h4>
            <ul>
              <li><a href={BRAND.x} target="_blank" rel="noreferrer">X {BRAND.xHandle}</a></li>
              {hasGithub ? <li><a href={BRAND.github} target="_blank" rel="noreferrer">GitHub</a></li> : null}
              <li><a href="/llms.txt">llms.txt</a></li>
            </ul>
          </div>
        </div>
        <div className="base">
          <span className="flex items-center gap-6">
            <Wordmark />
            <span>© 2026 {BRAND.name}</span>
          </span>
          <span>{CHAIN.name} · chain {CHAIN.id} · not affiliated with Robinhood · not advice</span>
        </div>
      </div>
    </footer>
  );
}
