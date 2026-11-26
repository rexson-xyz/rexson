/*
 * Rexson's mark: the owner's dot-matrix "R", split by referensi/tools/apply-owner-assets.mjs into two alpha layers. The dots are a
 * CSS mask in currentColor and the accent dots a mask in var(--accent), so the mark reads on the light paper and the dark ink.
 */
import type { CSSProperties } from "react";

const BASE_URL = "url(/brand/mark.webp?v=76cc58c5)";
const ACCENT_URL = "url(/brand/mark-accent.webp?v=e3f053a6)";

const layer = (url: string, color: string): CSSProperties => ({
  position: "absolute",
  inset: 0,
  backgroundColor: color,
  WebkitMaskImage: url,
  maskImage: url,
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskPosition: "center",
  WebkitMaskSize: "contain",
  maskSize: "contain",
});

export function MarkGlyph({ size = 22, className = "", accent = true }: { size?: number; className?: string; accent?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-testid="brand-mark"
      className={`mk shrink-0 ${className}`}
      style={{ position: "relative", display: "inline-block", width: size, height: size }}
    >
      <span style={layer(BASE_URL, "currentColor")} />
      <span style={layer(ACCENT_URL, accent ? "var(--accent)" : "currentColor")} />
    </span>
  );
}

/** Wordmark: the mark + the name. */
export function Wordmark({ size = 17 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <MarkGlyph size={Math.round(size * 1.45)} />
      <span>Rexson</span>
    </span>
  );
}
