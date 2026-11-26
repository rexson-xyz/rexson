import type { Metadata } from "next";
import { CHAIN } from "@/config/brand";
import { CONTRACTS, ledgerLive } from "@/config/contracts";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { CopyChip } from "@/components/site/CaCopy";
import { LedgerLog } from "@/components/ledger/LedgerLog";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  path: "/ledger",
  title: "Ledger · the public change log on Robinhood Chain",
  description: "RexsonFactLedger on Robinhood Chain: approved fact versions as content hashes, grants per assistant key hash, receipt batches as Merkle roots. Live events from the contract's logs.",
});

const FUNCS = [
  ["openProject(nameHash, soloApproval)", "Opens a project; the caller is its owner."],
  ["setRoles(project, member, roles)", "Owner names editors, reviewers and receipt anchor keys."],
  ["propose(project, factKey, basedOn, contentHash, group, visibility)", "An editor proposes a version, based on the current one (stale bases are refused)."],
  ["approveBatch(project, drafts[])", "A reviewer approves up to 20 drafts: all land or the whole call reverts. Own drafts only with solo approval."],
  ["reject / withdraw / retire", "Close a draft; retire a fact so every read check fails from this block."],
  ["issueGrant / changeGrant / revokeGrant", "Owner scopes an assistant key hash to groups, a level and an expiry; revoke is final."],
  ["checkRead / checkReads", "Reason bits for a grant reading a fact now (the server calls this before every read of a linked key)."],
  ["checkPropose / checkApprove", "Reason bits before signing, so a refusal is explained instead of reverting."],
  ["setPaused / anchorReceipts / offer+acceptOwnership", "Pause all reads; anchor a receipt batch root; two-step handover."],
];

export default function LedgerPage() {
  return (
    <div className="paper pb-32">
      <PageHead eyebrow="Ledger" title="A public change log. Hashes only.">
        <p>Approved versions, grants and receipt batches, as events on {CHAIN.name}. The text of your facts never goes on chain.</p>
      </PageHead>
      <div className="wrap grid grid-cols-1 gap-5">
        <LedgerLog />
        <div className="panel" id="contract">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3>RexsonFactLedger</h3>
            <StatusBadge status="Prototype" />
          </div>
          <p className="mt-2 text-[14px] text-[var(--muted)]">
            {ledgerLive() ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                Deployed at <CopyChip value={CONTRACTS.ledger} /> on {CHAIN.name}.
              </span>
            ) : (
              "Built and tested (unit, fuzz, invariant and Robinhood Chain fork tests). Not deployed yet: the owner deploys it, then this page reads its events."
            )}{" "}
            No funds, no fee, no admin over anyone&apos;s project, no upgrade. Library RexsonLedgerMath holds every reason bit.
          </p>
          <div className="scroll-x mt-4">
            <table className="tbl min-w-[640px]">
              <tbody>
                {FUNCS.map(([f, d]) => (
                  <tr key={f}>
                    <td className="mono text-[12px]">{f}</td>
                    <td className="text-[14px]">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
