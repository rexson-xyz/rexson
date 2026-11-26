/* A heading line whose words drop in from above inside a clip (MOTION.txt 2). Static and fully visible without motion. */
export function Words({ text, start = 0, step = 70, className = "" }: { text: string; start?: number; step?: number; className?: string }) {
  return (
    <span className={className}>
      {text.split(" ").map((w, i) => (
        <span key={i} className="word">
          <span style={{ "--wd": `${start + i * step}ms` } as React.CSSProperties}>{w}</span>
          {i < text.split(" ").length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}
