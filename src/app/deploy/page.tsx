import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/site/PageHead";
import { ClientOnly } from "@/components/app/ClientOnly";
import { DeployPanel } from "@/components/deploy/DeployPanel";

export const metadata: Metadata = { title: "Deploy (local)", robots: { index: false, follow: false } };

// Owner tool, local only: on any public host this route is a 404.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export default async function DeployPage() {
  const host = (await headers()).get("host") ?? "";
  if (!LOCAL_HOST.test(host)) notFound();
  return (
    <div className="paper pb-32">
      <PageHead eyebrow="Owner tool · local only" title="Deploy the ledger.">
        <p>This page answers only on localhost. It is not linked anywhere and is removed once the contract is live and verified.</p>
      </PageHead>
      <div className="wrap max-w-[760px]">
        <ClientOnly>
          <DeployPanel />
        </ClientOnly>
      </div>
    </div>
  );
}
