// A minimal assistant-side client for Rexson. No dependencies (Node 18+).
//   REXSON_URL=https://rexson.xyz REXSON_KEY=rk_<id>.<secret> node examples/assistant.mjs [text|json|mcp]
// text: GET /api/facts?format=text (paste into a prompt) · json: GET /api/facts · mcp: JSON-RPC tools/list + tools/call read_facts.
// Every read leaves a receipt in the owner's project. Exit code 0 on success, 1 on any refusal.
const base = (process.env.REXSON_URL || "http://127.0.0.1:6820").replace(/\/$/, "");
const key = process.env.REXSON_KEY;
const mode = process.argv[2] || "text";
if (!key) {
  console.error("Set REXSON_KEY to the key shown once when the assistant was added.");
  process.exit(2);
}
const auth = { authorization: `Bearer ${key}` };

if (mode === "mcp") {
  const call = async (id, method, params) => {
    const res = await fetch(`${base}/api/mcp`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
    return res.json();
  };
  const init = await call(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "example", version: "0" } });
  const tools = await call(2, "tools/list", {});
  const out = await call(3, "tools/call", { name: "read_facts", arguments: {} });
  console.log(JSON.stringify({ server: init.result?.serverInfo, tools: tools.result?.tools?.map((t) => t.name), result: out.result ?? out.error }, null, 2));
  process.exit(out.result && !out.result.isError ? 0 : 1);
}

const res = await fetch(`${base}/api/facts${mode === "text" ? "?format=text" : ""}`, { headers: auth });
const body = await res.text();
console.log(body);
console.error(`HTTP ${res.status} · receipt ${res.headers.get("x-rexson-receipt") ?? "none"}`);
process.exit(res.ok ? 0 : 1);
