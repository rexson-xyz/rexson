import type { Metadata } from "next";
import { PageHead } from "@/components/site/PageHead";
import { ClientOnly } from "@/components/app/ClientOnly";
import { WorkspaceApp } from "@/components/app/WorkspaceApp";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  path: "/app",
  title: "App · write, approve and share project facts",
  description: "Practice with sample data and no wallet, or sign in for your own project: facts with sources, batch approval, assistant keys scoped to groups, read receipts and the on-chain change log.",
});

export default function AppPage() {
  return (
    <div className="paper pb-32">
      <PageHead eyebrow="App" title="Your project's approved memory.">
        <p>Write facts with their sources, approve them, and decide which assistant reads which group. Start in practice mode: it runs in your browser on sample data.</p>
      </PageHead>
      <div className="wrap">
        <ClientOnly fallback={<p className="note">Loading the workspace… It needs JavaScript; the docs page explains everything without it.</p>}>
          <WorkspaceApp />
        </ClientOnly>
      </div>
    </div>
  );
}
