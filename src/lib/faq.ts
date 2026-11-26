/* Questions answered on the docs page (and as FAQ structured data). Every answer is true of the site as built. */
import { BRAND, TOKEN } from "@/config/brand";

export type Faq = { q: string; a: string };

export const FAQ: Faq[] = [
  {
    q: "Can an assistant read my drafts?",
    a: "No. A key only ever receives approved versions, and only of facts in the groups its grant names, up to its level. A draft that is waiting for review is invisible to every assistant.",
  },
  {
    q: "Can an assistant change the memory?",
    a: `No. The read API and the JSON-RPC tool are read-only. Only the signed-in owner writes, reviews and approves facts in ${BRAND.name}.`,
  },
  {
    q: "What happens when I revoke a key?",
    a: "The next read with that key is refused and returns no fact text; the refusal is recorded as a receipt. If the key's grant was also issued on Robinhood Chain, revoking it there stops reads from the very next request too.",
  },
  {
    q: "Does this stop assistants from making things up?",
    a: `No, and nothing can promise that. ${BRAND.name} gives each assistant the current approved facts and their sources; what an assistant does with them is up to the assistant. It does cut down on repeating the same context and on answers built from an old version.`,
  },
  {
    q: "Is my memory stored on the blockchain?",
    a: "No. Fact text, sources and access keys never go on chain. The ledger on Robinhood Chain holds only hashes: the content hash of each approved version, the hash of each key's public id, the grant scope and the Merkle root of read receipts. It is a public change log you can check against.",
  },
  {
    q: "Where are facts stored, and who can see them?",
    a: "In the hosted workspace (kv-gateway, a Redis-compatible store run by the site operator), or only in your browser in practice mode. The operator of the server can technically read hosted facts: do not store secrets. Passwords, private keys, API keys and recovery phrases are refused before they are saved.",
  },
  {
    q: "Do I need tokens or ETH to use it?",
    a: `No. Practice mode needs nothing. The hosted workspace needs one free signature from your wallet (no gas, nothing moves). Only writing to the on-chain ledger costs a little ETH gas on Robinhood Chain. ${BRAND.symbol} is never required.`,
  },
  {
    q: `Is there a ${BRAND.symbol} token?`,
    a: TOKEN.isLive
      ? `Yes, the community token of ${BRAND.name} on Robinhood Chain at ${BRAND.ca}. Only trust this address. Token features (more projects, facts and assistant keys) are concepts, not built yet.`
      : `It has not launched; the contract address is TBA and the launchpad is TBA. Token features (more projects, facts and assistant keys) are concepts, not built yet. ${BRAND.name} works fully without it.`,
  },
  {
    q: `Is ${BRAND.name} connected to Robinhood?`,
    a: `No. ${BRAND.name} is an independent prototype that uses Robinhood Chain, a public network, for its change log. It is not advice of any kind.`,
  },
];
