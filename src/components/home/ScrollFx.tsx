"use client";

import { useEffect } from "react";

/*
 * Scroll-driven motion for the home page (MOTION.txt 5, 6, 8, 10), all from one rAF-throttled scroll listener:
 *   [data-sq]     the glowing square scales up and fades as its section passes (sets --sq / --sqo)
 *   [data-drift]  children drift vertically at their own speed (data-speed), sets --dy
 *   [data-cover]  the cover over a card art lifts (sets --cover 100% → 0%) once in view
 * Reduced motion: nothing is set, everything sits at rest.
 */
export function ScrollFx() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const run = () => {
      raf = 0;
      const vh = window.innerHeight;
      document.querySelectorAll<HTMLElement>("[data-sq]").forEach((el) => {
        const r = el.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (vh - r.top) / (r.height + vh)));
        el.style.setProperty("--sq", String(0.7 + p * 0.9));
        el.style.setProperty("--sqo", String(p < 0.75 ? 1 : Math.max(0, 1 - (p - 0.75) * 4)));
      });
      document.querySelectorAll<HTMLElement>("[data-drift] > *").forEach((el) => {
        const host = el.parentElement!.getBoundingClientRect();
        const speed = Number(el.dataset.speed || 0.2);
        const dy = Math.max(-90, Math.min(90, (host.top + host.height / 2 - vh / 2) * speed));
        el.style.setProperty("--dy", `${dy.toFixed(1)}px`);
      });
      document.querySelectorAll<HTMLElement>("[data-cover]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.85) el.style.setProperty("--cover", "0%");
      });
    };
    document.querySelectorAll<HTMLElement>("[data-cover]").forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight) el.style.setProperty("--cover", "100%");
    });
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(run);
    };
    run();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
