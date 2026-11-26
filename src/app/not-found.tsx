import Link from "next/link";
import { PageHead } from "@/components/site/PageHead";

export default function NotFound() {
  return (
    <div className="paper">
      <PageHead eyebrow="404" title="No approved version of this page.">
        <p>It was never written, or it was retired.</p>
      </PageHead>
      <div className="wrap flex flex-wrap justify-center gap-3 pb-32">
        <Link href="/app" className="btn btn-accent">
          Open the app
        </Link>
        <Link href="/" className="btn btn-line">
          Home
        </Link>
      </div>
    </div>
  );
}
