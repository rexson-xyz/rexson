"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/site/Mark";
import { DotGlyph, Led } from "@/components/site/Led";
import { CloseIcon, MenuIcon } from "@/components/site/Icons";
import { NavWallet } from "@/components/wallet/WalletButton";
import { NAV } from "@/config/nav";
import { BRAND } from "@/config/brand";
import { useJson } from "@/lib/useJson";

/*
 * Two parts, as in the UI reference: a top bar that scrolls away with the page (mark left; live block and wallet right), and a
 * floating pill nav fixed at the bottom (LED glyph that follows the section in view, links that fold away after the hero, the
 * orange call to action).
 */

type Snap = { block: number | null };

export function SiteHeader() {
  const path = usePathname();
  const home = path === "/";
  const { data } = useJson<Snap>("/api/chain", 30_000);
  const [collapsed, setCollapsed] = useState(false);
  const [glyph, setGlyph] = useState("mark");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setCollapsed(home && window.scrollY > window.innerHeight * 0.9 && window.scrollY < document.documentElement.scrollHeight - window.innerHeight * 1.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) if (e.isIntersecting) setGlyph((e.target as HTMLElement).dataset.led || "mark");
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    document.querySelectorAll<HTMLElement>("[data-led]").forEach((el) => io.observe(el));
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, [home, path]);

  useEffect(() => setOpen(false), [path]);

  return (
    <>
      <header className={`topbar ${home ? "" : "on-paper"}`}>
        <div className="wrap row">
          <Link href="/" aria-label={`${BRAND.name} home`} className="shrink-0">
            <Wordmark />
          </Link>
          <div className="meta">
            <span className="live" title="Latest Robinhood Chain block, read live" data-testid="top-block">
              <i className="live-dot" />
              {BRAND.chainName} · {data?.block ? `#${data.block.toLocaleString("en-US")}` : "reading…"}
            </span>
            <NavWallet />
          </div>
        </div>
      </header>

      <nav className={`pillnav ${collapsed ? "collapsed" : ""}`} aria-label="Main">
        <Link href="/" className="led" aria-label="Home">
          <Led glyph={glyph} size={30} />
        </Link>
        <button type="button" className="menu-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <MenuIcon size={18} />
        </button>
        <div className="links">
          <Link href="/#how" >How it works</Link>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </div>
        <Link href="/app" className="btn btn-accent cta" data-testid="nav-open-app">
          Open app <DotGlyph />
        </Link>
      </nav>

      {open ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Menu" onClick={() => setOpen(false)}>
          <div className="panel-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2">
              <Wordmark />
              <button type="button" className="rq-iconbtn" aria-label="Close menu" onClick={() => setOpen(false)}>
                <CloseIcon size={14} />
              </button>
            </div>
            <Link href="/#how" onClick={() => setOpen(false)}>How it works <span>→</span></Link>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}>
                {n.label} <span>→</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
