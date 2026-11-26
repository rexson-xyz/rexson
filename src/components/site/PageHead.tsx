/* Title band for inner pages: a small tag over the two-tone section headline and a lede, centred, as in the UI reference's light sections. */
export function PageHead({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden pb-14 pt-36 text-center max-[640px]:pt-28">
      <div className="wrap">
        <p className="tag" data-reveal="">
          {eyebrow}
        </p>
        <h1 className="h-sec mx-auto mt-6 max-w-[980px]" data-reveal="" style={{ "--delay": "80ms" } as React.CSSProperties}>
          {title}
        </h1>
        {children ? (
          <div className="lede mx-auto mt-5 max-w-[680px]" data-reveal="" style={{ "--delay": "160ms" } as React.CSSProperties}>
            {children}
          </div>
        ) : null}
        {actions ? <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}

export function StatusBadge({ status }: { status: "Prototype" | "Concept" }) {
  return (
    <span className={`badge ${status === "Prototype" ? "proto" : "concept"}`}>
      <i aria-hidden="true" />
      {status}
    </span>
  );
}
export function SampleBadge({ label = "Sample data" }: { label?: string }) {
  return <span className="badge sample">{label}</span>;
}
export function LiveBadge({ label = "Live from chain" }: { label?: string }) {
  return (
    <span className="badge live">
      <i aria-hidden="true" />
      {label}
    </span>
  );
}
