/* Dot-matrix glyphs in the LED language of the UI reference, drawn as SVG circles so they follow currentColor. */

export const GLYPHS: Record<string, string[]> = {
  mark: ["11110", "10001", "11110", "10100", "10010"],
  write: ["00011", "00111", "01110", "11100", "11000"],
  check: ["00001", "00011", "10110", "11100", "01000"],
  key: ["01100", "10010", "01111", "00101", "00101"],
  read: ["11111", "10001", "11111", "10001", "11111"],
  chain: ["11000", "10110", "01101", "00011", "00011"],
  arrow: ["00100", "00010", "11111", "00010", "00100"],
};

export function Led({ glyph = "mark", size = 26, hot = true, className = "" }: { glyph?: keyof typeof GLYPHS | string; size?: number; hot?: boolean; className?: string }) {
  const rows = GLYPHS[glyph] ?? GLYPHS.mark;
  const w = rows[0].length;
  const h = rows.length;
  return (
    <svg aria-hidden="true" className={`ledscan ${className}`} width={size} height={(size * h) / w} viewBox={`0 0 ${w} ${h}`}>
      {rows.flatMap((row, y) =>
        [...row].map((c, x) => (
          <circle
            key={`${x}-${y}`}
            cx={x + 0.5}
            cy={y + 0.5}
            r={0.34}
            className={c === "1" && hot ? "hot" : undefined}
            style={c === "1" && hot ? ({ "--ld": `${(x + y) * 0.04}s` } as React.CSSProperties) : undefined}
            fill={c === "1" ? (hot ? "var(--accent)" : "currentColor") : "rgba(238,240,236,0.1)"}
          />
        )),
      )}
    </svg>
  );
}

/** A larger LED picture for dark panels: rows of "1"/"0", lit dots in the accent. */
export function LedArt({ rows, className = "" }: { rows: string[]; className?: string }) {
  const w = rows[0].length;
  const h = rows.length;
  return (
    <svg aria-hidden="true" className={`ledscan ${className}`} viewBox={`0 0 ${w} ${h}`} width="100%" height="100%">
      {rows.flatMap((row, y) =>
        [...row].map((c, x) => <circle key={`${x}-${y}`} cx={x + 0.5} cy={y + 0.5} r={0.36} className={c === "1" ? "hot" : undefined} style={c === "1" ? ({ "--ld": `${((x * 7 + y * 3) % 40) * 0.05}s` } as React.CSSProperties) : undefined} fill={c === "1" ? "var(--accent)" : "rgba(238,240,236,0.07)"} />),
      )}
    </svg>
  );
}

export function DotGlyph() {
  return (
    <span className="dotglyph" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}
