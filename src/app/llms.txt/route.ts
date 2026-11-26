import { BRAND, CHAIN } from "@/config/brand";
import { CONTRACTS, ledgerLive } from "@/config/contracts";

export const dynamic = "force-static";

export function GET() {
  const lines = [
    `# ${BRAND.name}`,
    "",
    `> ${BRAND.slogan} ${BRAND.tagline} A project's facts (name, value, source, version, group, visibility) are written as drafts, reviewed and approved in batches (all or nothing; drafts built on an older version are held back). Each assistant gets its own access key scoped to fact groups, a level (shareable, or shareable and internal) and an expiry; workspace-only facts are never sent. Assistants read the current approved versions over HTTP, and every read leaves a receipt without fact text. RexsonFactLedger on ${CHAIN.name} (chain ${CHAIN.id}) holds hashes only: approved content hashes, grant scopes, receipt Merkle roots. Prototype; no token needed. Not affiliated with Robinhood.`,
    "",
    `App (practice mode needs no wallet): ${BRAND.url}/app`,
    `Docs and API: ${BRAND.url}/docs`,
    `Read API: GET ${BRAND.url}/api/facts?format=json|text with Authorization: Bearer rk_<id>.<secret>`,
    `JSON-RPC tool (read_facts): POST ${BRAND.url}/api/mcp with the same key`,
    `On-chain change log: ${BRAND.url}/ledger`,
    `RexsonFactLedger: ${ledgerLive() ? CONTRACTS.ledger : "not deployed yet"}`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
