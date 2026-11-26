/*
 * Rexson's mark (AI placeholder until the owner's logo arrives; referensi/tools/apply-owner-assets.mjs swaps the files): an "R" drawn
 * on a 5 x 7 dot matrix, with one accent dot, in the LED language of the site. Inline SVG so it follows currentColor.
 */
const R_DOTS = ["11110", "10001", "10001", "11110", "10100", "10010", "10001"];

export function MarkGlyph({ size = 22, className = "", accent = true }: { size?: number; className?: string; accent?: boolean }) {
  const dots: [number, number][] = [];
  R_DOTS.forEach((row, y) => [...row].forEach((c, x) => c === "1" && dots.push([x, y])));
  return (
    <svg aria-hidden="true" data-testid="brand-mark" className={`mk shrink-0 ${className}`} width={size} height={size} viewBox="-0.5 -0.5 7 8">
      {dots.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x + 0.5} cy={y + 0.5} r={0.36} fill="currentColor" />
      ))}
      {accent ? <circle cx={5.85} cy={0.5} r={0.5} fill="var(--accent)" /> : null}
    </svg>
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
