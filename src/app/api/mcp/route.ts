import { NextResponse } from "next/server";
import { allow, allowPublic, readCapped, tooMany } from "@/lib/guard";
import { asText } from "@/lib/facts/format";
import { getStore } from "@/lib/server/store";
import { assistantRead, bearer } from "@/lib/server/read";
import { BRAND } from "@/config/brand";

export const dynamic = "force-dynamic";

/*
 * POST /api/mcp: a minimal JSON-RPC 2.0 endpoint in the shape of the Model Context Protocol's HTTP transport (stateless, JSON
 * responses, no streaming). Methods: initialize, notifications/initialized, ping, tools/list, tools/call. One read-only tool,
 * read_facts, which returns the same text as GET /api/facts?format=text and records a receipt. Auth: Bearer access key.
 * Tested with plain JSON-RPC requests (examples/assistant.mjs, E2E); compatibility with a given MCP client is not claimed.
 */

const TOOL = {
  name: "read_facts",
  description: `Read the current approved facts of this ${BRAND.name} project that your access key may see. Read-only. Optional: keys (list of fact names).`,
  inputSchema: { type: "object", properties: { keys: { type: "array", items: { type: "string" }, description: "Only these fact names (optional)." } }, additionalProperties: false },
};

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: string; arguments?: { keys?: unknown } } };
const reply = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const error = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function POST(request: Request) {
  const store = getStore();
  if (!(await allowPublic(store, request, "mcp", 120, 3000))) return tooMany();
  const token = bearer(request);
  if (!token) return NextResponse.json(error(null, -32001, "Send your access key as Authorization: Bearer rk_…"), { status: 401 });
  if (!(await allow(store, "mcp-key", [token.slice(0, 15)], 60, 60))) return tooMany();
  const text = await readCapped(request, 8192).catch(() => null);
  let msg: Rpc;
  try {
    msg = JSON.parse(text ?? "") as Rpc;
  } catch {
    return NextResponse.json(error(null, -32700, "Parse error"), { status: 400 });
  }
  const H = { "cache-control": "no-store" };
  switch (msg.method) {
    case "initialize":
      return NextResponse.json(reply(msg.id, { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: `${BRAND.slug}-facts`, version: "0.1.0" } }), { headers: H });
    case "notifications/initialized":
      return new NextResponse(null, { status: 202 });
    case "ping":
      return NextResponse.json(reply(msg.id, {}), { headers: H });
    case "tools/list":
      return NextResponse.json(reply(msg.id, { tools: [TOOL] }), { headers: H });
    case "tools/call": {
      if (msg.params?.name !== TOOL.name) return NextResponse.json(error(msg.id, -32602, `Unknown tool. The only tool is ${TOOL.name}.`), { headers: H });
      const keys = Array.isArray(msg.params?.arguments?.keys) ? (msg.params!.arguments!.keys as unknown[]).map(String).slice(0, 50) : undefined;
      const r = await assistantRead(token, "mcp", keys);
      if (!r.ok) return NextResponse.json(reply(msg.id, { content: [{ type: "text", text: `Error: ${r.error}` }], isError: true }), { headers: H });
      return NextResponse.json(reply(msg.id, { content: [{ type: "text", text: asText(r.project, r.receipt, r.facts, r.withheld) }], structuredContent: { receipt: r.receipt.id, facts: r.facts } }), { headers: H });
    }
    default:
      return NextResponse.json(error(msg.id, -32601, "Method not found"), { headers: H });
  }
}
