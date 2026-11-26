import { addAssistant, addDraft, addReceipt, approve, emptyWorkspace, readFor, receiptItems, type Workspace } from "@/lib/facts/model";

/*
 * The practice workspace: SAMPLE DATA, labelled as such wherever it shows. A release project with a launch date that moves, the
 * example the product is built around. Built with the same functions as a real workspace, so it obeys the same rules.
 */

export const PRACTICE_EDITOR = "editor (you)";
export const PRACTICE_REVIEWER = "reviewer (you)";

export function sampleWorkspace(now = Math.floor(Date.now() / 1000)): Workspace {
  let ws = emptyWorkspace("practice", "Release (sample)", "practice", now - 9 * 86400, false);
  ws = { ...ws, groups: ["General", "Product", "Release", "Pricing"] };
  const t = now - 8 * 86400;
  const drafts: [string, string, string, number, 0 | 1 | 2][] = [
    ["launch_date", "Monday, 7 December", "Release review notes, 3 Dec", 2, 0],
    ["product_name", "Rexson Notes (working name)", "Naming thread", 1, 0],
    ["support_hours", "Weekdays 09:00–17:00 UTC", "https://example.com/support-policy", 0, 0],
    ["freeze_rule", "Release branch freezes 48 hours before launch", "Engineering handbook", 2, 1],
    ["price_floor_note", "Do not quote below the signed budget", "Pricing call notes", 3, 2],
  ];
  const ids: string[] = [];
  for (const [key, value, source, group, visibility] of drafts) {
    const r = addDraft(ws, { key, value, source, group, visibility }, PRACTICE_EDITOR, t);
    ws = r.ws;
    ids.push(r.draft.id);
  }
  ws = approve(ws, ids, PRACTICE_REVIEWER, t + 3600);
  ws = addAssistant(ws, { label: "Writing assistant", groups: [0, 1, 2], maxVisibility: 0, days: 90 }, "rk_5a11e0c0de", t + 7200);
  ws = addAssistant(ws, { label: "Coding assistant", groups: [0, 2], maxVisibility: 1, days: 90 }, "rk_c0d1ac0ffe", t + 7200);
  ws = addAssistant(ws, { label: "Support assistant", groups: [0, 1], maxVisibility: 0, days: 30 }, "rk_50c1a1b0a7", t + 7200);
  for (const [id, dt] of [["rk_5a11e0c0de", 2], ["rk_c0d1ac0ffe", 3], ["rk_50c1a1b0a7", 5]] as const) {
    const r = readFor(ws, id, t + dt * 3600);
    if (r.ok) ws = addReceipt(ws, { at: t + dt * 3600, assistant: id, label: ws.assistants.find((a) => a.id === id)!.label, items: receiptItems(r.facts), withheld: r.withheld, via: "practice" }).ws;
  }
  // The launch moved: a new draft waits for review, based on rev 1.
  ws = addDraft(ws, { key: "launch_date", value: "Tuesday, 8 December", source: "Release review notes, 5 Dec", group: 2, visibility: 0 }, PRACTICE_EDITOR, now - 3600).ws;
  return ws;
}
