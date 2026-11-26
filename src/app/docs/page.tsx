import Link from "next/link";
import type { Metadata } from "next";
import { BRAND, CHAIN } from "@/config/brand";
import { CONTRACTS, ledgerLive } from "@/config/contracts";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { BIT_WORDS, READ_BITS } from "@/lib/facts/bits";
import { FAQ } from "@/lib/faq";
import { faqLd, ldJson, pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  path: "/docs",
  title: "Docs · how Rexson works, the read API and its limits",
  description: "How facts are written, approved and granted, the read API (JSON, plain text, JSON-RPC tool), what read receipts contain, what goes on chain, and what is still a concept.",
});

const READ_ORDER = Object.keys(READ_BITS) as (keyof typeof READ_BITS)[];

export default function Docs() {
  const site = BRAND.url;
  return (
    <div className="paper pb-32">
      <script type="application/ld+json" dangerouslySetInnerHTML={ldJson(faqLd(FAQ))} />
      <PageHead eyebrow="Docs" title="How it works, and where it stops.">
        <p>Everything here describes the site as built. Where something is a concept, it says so.</p>
      </PageHead>
      <div className="wrap">
        <div className="panel prose mx-auto max-w-[860px] !p-8 max-[720px]:!p-5">
          <h2 id="model">The model</h2>
          <p>
            A <b>project</b> holds <b>facts</b>. A fact has a name (<code>launch_date</code>), a value, a source (a link or a note, kept as a reference and never fetched), a
            <b> group</b> and a <b>visibility</b>: <i>Shareable</i>, <i>Internal</i> or <i>Workspace only</i>. Each approved change adds a <b>version</b>.
          </p>
          <ul>
            <li>A change starts as a <b>draft</b> based on the fact&apos;s current version. Nobody reads drafts.</li>
            <li>A reviewer approves drafts in a <b>batch</b>: all of them land, or none do. A draft based on an older version is held back as stale; two drafts of one fact cannot share a batch.</li>
            <li>In practice mode the editor and reviewer are two roles, and a reviewer cannot approve their own draft. A hosted project in v1 has one owner who approves their own drafts (solo approval).</li>
            <li>Secrets are refused before they are saved: private keys, 64-hex-digit strings, API keys and tokens, “password:” lines and 12–24-word recovery phrases.</li>
          </ul>

          <h2 id="grants">Assistants and grants</h2>
          <p>Each assistant gets its own key, <code>rk_&lt;id&gt;.&lt;secret&gt;</code>. Its grant names the groups it may read, a level and an expiry (1–366 days). For every fact, a read is allowed only when none of these reasons apply:</p>
          <div className="scroll-x">
            <table className="tbl min-w-[460px]">
              <tbody>
                {READ_ORDER.map((k) => (
                  <tr key={k}>
                    <td className="mono text-[12px]">{k}</td>
                    <td>{BIT_WORDS[k]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Revoked, expired and paused deny the whole read and return no fact text. The same bits come from the contract&apos;s <code>checkRead</code>.</p>

          <h2 id="api">The read API</h2>
          <p>Any assistant or script that can send an HTTP request can read. The key is shown once when you create it; only a SHA-256 of its secret is stored.</p>
          <div className="codebox">{`curl -H "Authorization: Bearer rk_<id>.<secret>" "${site}/api/facts?format=text"

Approved facts for project "Release" (read rd_mi4k2a3f9c at 2026-…).
- launch_date (rev 2, approved 2026-…): Tuesday, 8 December
  source: Release review notes, 5 Dec`}</div>
          <p className="mt-3">
            <code>?format=json</code> (default) returns <code>{`{ project, receipt, readAt, facts: [{ key, value, source, version, approvedAt, group, visibility, hash }], withheld, note }`}</code>. <code>?key=a,b</code>{" "}
            filters by name. Every answer carries <code>x-rexson-receipt</code>.
          </p>
          <h3 id="mcp">JSON-RPC tool</h3>
          <p>
            <code>POST /api/mcp</code> speaks JSON-RPC 2.0 in the shape of the Model Context Protocol&apos;s HTTP transport (stateless JSON, no streaming): <code>initialize</code>, <code>tools/list</code>, <code>tools/call</code>.
            One read-only tool, <code>read_facts</code>. It was tested with plain JSON-RPC requests; compatibility with a particular client is not claimed.
          </p>
          <div className="codebox">{`curl -X POST ${site}/api/mcp -H "Authorization: Bearer rk_<id>.<secret>" \\
  -H "content-type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_facts","arguments":{}}}'`}</div>
          <p className="mt-3">A tiny example client ships in the repository: <code>examples/assistant.mjs</code>.</p>

          <h2 id="receipts">Read receipts</h2>
          <p>
            Every read, allowed or refused, leaves a receipt: id, time, assistant, format, and for each fact returned its name, version and content hash. Never the value. Receipts live in
            their own list (newest 300 per project), so a read can never overwrite a grant change made at the same moment.
          </p>
          <p>
            A batch can be anchored on chain as a Merkle root. Leaf = <code>keccak256(abi.encode(string id, bytes32 keccak256(keyId), uint64 at, bytes32 keccak256(concat(items))))</code> with item ={" "}
            <code>keccak256(abi.encode(bytes32 factKey, uint32 version, bytes32 contentHash))</code>; pairs hashed in sorted order.
          </p>

          <h2 id="chain">What goes on chain</h2>
          <p>
            <b>RexsonFactLedger</b> on {CHAIN.name} ({ledgerLive() ? <code>{CONTRACTS.ledger}</code> : "not deployed yet"}) is a public change log. It stores only hashes: <code>keccak256(name)</code> as the fact key,{" "}
            <code>keccak256</code> of the version&apos;s canonical JSON as the content hash, <code>keccak256(keyId)</code> for a grant, and receipt roots. Fact text, sources and secrets never go on chain. It holds no funds,
            has no admin over anyone&apos;s project and cannot be upgraded. Writing to it costs a little ETH gas. See the <Link href="/ledger">ledger page</Link>.
          </p>
          <p>
            A grant issued on chain is <b>linked</b> to its key: before every read with that key the server calls <code>checkReads</code> and drops any fact the chain refuses. If the chain cannot be read, that key reads nothing
            (it fails closed).
          </p>

          <h2 id="storage">Where data lives, and who can see it</h2>
          <ul>
            <li>Practice mode: only in your browser (localStorage). Nothing is sent.</li>
            <li>Hosted projects: in the site&apos;s store (kv-gateway, Redis-compatible), kept 180 days after the last change. Without it configured, in one server instance&apos;s memory, and the app says so.</li>
            <li>The operator of the server can technically read hosted facts. Do not store secrets; Rexson refuses the obvious ones.</li>
            <li>Deleting a fact removes it and its history from the project at once. Receipts keep only names, versions and hashes.</li>
          </ul>

          <h2 id="status">Prototype and concept</h2>
          <ul>
            <li><StatusBadge status="Prototype" /> facts, review, grants, read API, JSON-RPC tool, receipts, practice mode, hosted projects, the ledger contract and its tab.</li>
            <li><StatusBadge status="Concept" /> several editors and reviewers in one hosted project (the contract already has the roles), more than one project per wallet, receipt proofs served to third parties.</li>
            <li><StatusBadge status="Concept" /> token features: more projects, facts and assistant keys for {BRAND.symbol} holders. Not built; the product works fully without the token.</li>
          </ul>
          <p>
            {BRAND.name} gives assistants the current approved facts. It does not make an assistant correct, and it cannot reach copies you pasted elsewhere. It is not affiliated with Robinhood and is not advice.
          </p>

          <h2 id="faq">FAQ</h2>
          {FAQ.map((f) => (
            <div key={f.q} className="mt-5">
              <h3 className="!mt-0">{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
