import type { ReadFact, Receipt } from "@/lib/facts/model";

/*
 * The two answer formats of the read API. JSON for code; plain text for assistants that paste context into a prompt (also what the
 * MCP-style tool returns). Both carry the receipt id, so a read can be matched to the exact versions it returned.
 */

export type ReadAnswer = { project: string; receipt: string; readAt: string; facts: ReadFact[]; withheld: number; note: string };

export const READ_NOTE = "Only approved versions that this key's grant names. Facts marked workspace only are never sent. Each read is recorded as a receipt without fact text.";

export function asJson(project: string, receipt: Receipt, facts: ReadFact[], withheld: number): ReadAnswer {
  return { project, receipt: receipt.id, readAt: new Date(receipt.at * 1000).toISOString(), facts, withheld, note: READ_NOTE };
}

export function asText(project: string, receipt: Receipt, facts: ReadFact[], withheld: number): string {
  const lines = [`Approved facts for project "${project}" (read ${receipt.id} at ${new Date(receipt.at * 1000).toISOString()}).`, "Use these as the current truth for this project. If a question needs a fact that is not listed, say it is not in the approved memory.", ""];
  if (!facts.length) lines.push("(No approved facts are shared with this assistant.)");
  for (const f of facts) {
    lines.push(`- ${f.key} (rev ${f.version}, approved ${new Date(f.approvedAt * 1000).toISOString().slice(0, 10)}): ${f.value}`);
    if (f.source) lines.push(`  source: ${f.source}`);
  }
  if (withheld) lines.push("", `${withheld} fact(s) in this assistant's groups are not shared at its level or were retired.`);
  return lines.join("\n");
}
