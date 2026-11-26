// Single place to change project identity. Everything on the site reads from here.
// To publish the real contract address, replace the value of CA below. The header pill, the footer, the token page
// and every explorer link derive from it. Anything that is not a 0x + 40 hex address is treated as "not launched yet".

/** Contract address of $REXSON on Robinhood Chain. "TBA" until the token exists. */
const CA: string = "TBA";

/**
 * True once the domain points at this deployment. While false, the production *.vercel.app host is served as is (kept
 * out of search with noindex) instead of redirecting to a domain that does not serve the site.
 * DNS 26 Nov 2026 (DoH): rexson.xyz has no nameserver answer yet.
 */
export const DOMAIN_LIVE = false;

export const isAddress = (v: string): v is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(v);

const NAME = "Rexson";
/** Short name for the nav and tight spaces. */
const SHORT = "Rexson";
const SLUG = "rexson";
/** Shown upper case everywhere. The only place the ticker is written. */
const TICKER = "REXSON";
const DOMAIN = "rexson.xyz";
/** X account of the project (the owner's handle, exactly as written in the order). */
const X_HANDLE = "rexsonxyz";

export const BRAND = {
  name: NAME,
  short: SHORT,
  slug: SLUG,
  ticker: TICKER,
  symbol: `$${TICKER}`,
  domain: DOMAIN,
  url: `https://${DOMAIN}`,
  /** Token name: the owner wrote "rexson"; shown capitalised. */
  tokenName: "Rexson",
  slogan: "Approved memory for AI assistants.",
  tagline: "Current facts, scoped access and read receipts for Robinhood Chain.",
  category: "Approved project memory for AI assistants",
  chainName: "Robinhood Chain",
  description: `${NAME} keeps one versioned source of project facts for every AI assistant you use. You write a fact with its source, a reviewer approves it, and each assistant gets its own access key scoped to the fact groups you choose. Assistants read the current approved version over a plain HTTP API, and every read leaves a receipt: who read which version, and when. The approved versions and the grants can be anchored on Robinhood Chain as a public change log; the fact text never goes on chain.`,
  x: `https://x.com/${X_HANDLE}`,
  xHandle: `@${X_HANDLE}`,
  // Public source repository (owned by the project account since 26 Nov 2026).
  github: "https://github.com/rexson-xyz/rexson",
  ca: CA,
} as const;

/** True once BRAND.github points at an actual repository, not the bare host. */
export const hasGithub = /^https:\/\/github\.com\/[^/]+\/[^/]+/.test(BRAND.github);

// Public endpoints are the default. An operator can point the site at a private RPC with ROBINHOOD_RPC_URL
// (server) / NEXT_PUBLIC_ROBINHOOD_RPC_URL (browser). Both are optional.
const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";

export const CHAIN = {
  id: 4663,
  hex: "0x1237",
  name: "Robinhood Chain",
  nativeSymbol: "ETH",
  decimals: 18,
  publicRpc: PUBLIC_RPC,
  rpc: process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || PUBLIC_RPC,
  /** Second public endpoint, used for reads only when the first one fails. */
  fallbackRpc: "https://robinhood-rpc.publicnode.com",
  /** Third read endpoint for server code (some networks intercept the official host). */
  spareRpc: "https://robinhood.drpc.org",
  explorer: "https://robinhoodchain.blockscout.com",
} as const;

/** wallet_addEthereumChain parameters, used when the wallet does not know the chain yet (error 4902). */
export function addChainParams() {
  return {
    chainId: CHAIN.hex,
    chainName: CHAIN.name,
    rpcUrls: [CHAIN.publicRpc],
    blockExplorerUrls: [CHAIN.explorer],
    nativeCurrency: { name: "Ether", symbol: CHAIN.nativeSymbol, decimals: CHAIN.decimals },
  };
}

/** RPC for server code: the private endpoint when set, else the public one. */
export function serverRpc() {
  return process.env.ROBINHOOD_RPC_URL || process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || PUBLIC_RPC;
}

export const TOKEN = {
  get isLive() {
    return isAddress(BRAND.ca);
  },
  get explorerUrl() {
    return isAddress(BRAND.ca) ? explorerToken(BRAND.ca) : null;
  },
};

export function explorerAddress(address: string) {
  return `${CHAIN.explorer}/address/${address}`;
}
export function explorerToken(address: string) {
  return `${CHAIN.explorer}/token/${address}`;
}
export function explorerTx(hash: string) {
  return `${CHAIN.explorer}/tx/${hash}`;
}
export function shortAddress(address: string, head = 6, tail = 4) {
  if (address.length <= head + tail + 2) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/**
 * Chart links: DEXTools only. Robinhood Chain is listed there under the chain slug "robinhood".
 */
export const DEXTOOLS_CHAIN = "robinhood";
export function chartUrl(address: string): string | null {
  return isAddress(address) ? `https://www.dextools.io/app/en/${DEXTOOLS_CHAIN}/pair-explorer/${address.toLowerCase()}` : null;
}

/**
 * Where $REXSON is expected to launch: TBA in public copy (statements say "launchpad TBA"). Internal note: Pons on Robinhood Chain is the
 * likely launchpad, as for the owner's other launches. Before the CA is real, the buy button opens the launchpad home and says "At launch".
 * Rexson itself never needs the token.
 */
export const LAUNCHPAD = {
  name: "Pons",
  home: "https://ponsfamily.com/launchpad",
  tokenUrl: (address: string) => `https://ponsfamily.com/launchpad/${address.toLowerCase()}`,
} as const;

export function buyUrl(): string {
  return isAddress(BRAND.ca) ? LAUNCHPAD.tokenUrl(BRAND.ca) : LAUNCHPAD.home;
}
