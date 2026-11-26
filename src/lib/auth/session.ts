import { getAddress, isAddress, recoverMessageAddress } from "viem";
import { BRAND } from "@/config/brand";

/*
 * Owner session: the wallet signs ONE plain EIP-4361 (Sign-In with Ethereum) message with personal_sign (no gas). Wallets that
 * understand SIWE warn when the message's domain is not the site asking. The signed message is the credential: the browser keeps it
 * in sessionStorage (this tab only) and sends it with each workspace request; the server checks, on every request:
 *   - the exact SIWE layout this site writes (anything else is refused),
 *   - domain and URI against a FIXED allowlist (never the request's Host / X-Forwarded-Host headers),
 *   - chain id 4663, version 1, issued-at not in the future, expiry in the future, lifetime at most 4 hours,
 *   - the signature recovers to the wallet in the message (EOA only in v1; ERC-1271 wallets cannot sign in),
 *  * No server secret is involved, so there is nothing to misconfigure.
 */

export const SESSION_CHAIN = 4663;
export const MAX_SESSION_SECONDS = 4 * 3600;
const SKEW = 120;
const STATEMENT = `Sign in to ${BRAND.name} to open your hosted workspace. No gas, nothing moves.`;
/** Local ports of this project (site and its e2e build); only allowed outside a hosted deployment. */
const LOCAL_PORTS = [6820, 6821];

export type SessionFields = { domain: string; uri: string; address: string; chainId: number; nonce: string; issuedAt: number; expiresAt: number };
export type SignedSession = { message: string; signature: string };
export type SessionCheck = { ok: true; address: `0x${string}`; expiresAt: number; nonce: string } | { ok: false; error: string };

/** True when running on a hosted deployment (Vercel sets VERCEL); local test hosts are then refused. */
const hosted = () => Boolean(process.env.VERCEL) || process.env.VERCEL_ENV === "production";

/** domain -> the only URI accepted with it. Fixed from config; request headers are never consulted. */
export function allowedOrigins(local = !hosted()): Map<string, string> {
  const m = new Map<string, string>([
    [BRAND.domain, `https://${BRAND.domain}`],
    [`www.${BRAND.domain}`, `https://www.${BRAND.domain}`],
  ]);
  // Until the domain points here, the site is served on its Vercel production host. Vercel sets this system variable itself
  // (from the project, not from any request), so it is as fixed as the brand domain.
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelHost && /^[a-z0-9-]+\.vercel\.app$/.test(vercelHost)) m.set(vercelHost, `https://${vercelHost}`);
  if (local) for (const p of LOCAL_PORTS) for (const h of ["localhost", "127.0.0.1"]) m.set(`${h}:${p}`, `http://${h}:${p}`);
  return m;
}

const iso = (t: number) => new Date(t * 1000).toISOString();

export function sessionMessage(f: SessionFields): string {
  return [
    `${f.domain} wants you to sign in with your Ethereum account:`,
    getAddress(f.address),
    "",
    STATEMENT,
    "",
    `URI: ${f.uri}`,
    "Version: 1",
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${iso(f.issuedAt)}`,
    `Expiration Time: ${iso(f.expiresAt)}`,
  ].join("\n");
}

/** A fresh message for this wallet on this site (domain + origin of the page), valid for `seconds` (≤ 4 h). */
export function newSession(domain: string, uri: string, address: string, now = Math.floor(Date.now() / 1000), seconds = MAX_SESSION_SECONDS, nonce?: string): string {
  const n = nonce ?? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
  return sessionMessage({ domain, uri, address, chainId: SESSION_CHAIN, nonce: n, issuedAt: now, expiresAt: now + Math.min(seconds, MAX_SESSION_SECONDS) });
}

export function parseSession(message: string): SessionFields | null {
  if (typeof message !== "string" || message.length > 1200) return null;
  const lines = message.split("\n");
  const head = lines[0]?.match(/^(\S+) wants you to sign in with your Ethereum account:$/);
  const get = (k: string) => message.match(new RegExp(`^${k}: (.+)$`, "m"))?.[1]?.trim() ?? null;
  const address = lines[1] ?? "";
  const uri = get("URI");
  const chain = get("Chain ID");
  const nonce = get("Nonce");
  const issued = get("Issued At");
  const expires = get("Expiration Time");
  if (!head || !isAddress(address) || !uri || !chain || !nonce || !issued || !expires) return null;
  if (!/^\d+$/.test(chain) || !/^[0-9a-f]{16,64}$/i.test(nonce)) return null;
  const issuedAt = Math.floor(Date.parse(issued) / 1000);
  const expiresAt = Math.floor(Date.parse(expires) / 1000);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
  const f = { domain: head[1], uri, address, chainId: Number(chain), nonce, issuedAt, expiresAt };
  // Exactly the message this site writes: no extra lines a visitor could be tricked into signing.
  return sessionMessage(f) === message ? f : null;
}

/** Checked on every workspace request. Domain and URI come from the fixed allowlist only. */
export async function verifySession(s: SignedSession | null | undefined, now = Math.floor(Date.now() / 1000), origins = allowedOrigins()): Promise<SessionCheck> {
  if (!s || typeof s.message !== "string" || typeof s.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(s.signature)) return { ok: false, error: "No signed session." };
  const f = parseSession(s.message);
  if (!f) return { ok: false, error: "The session message is not one this site issues." };
  if (origins.get(f.domain) !== f.uri) return { ok: false, error: "The session was signed for another site." };
  if (f.chainId !== SESSION_CHAIN) return { ok: false, error: "The session was signed for another chain." };
  if (f.issuedAt > now + SKEW) return { ok: false, error: "The session starts in the future." };
  if (f.expiresAt - f.issuedAt > MAX_SESSION_SECONDS) return { ok: false, error: "The session is longer than 4 hours." };
  if (now >= f.expiresAt) return { ok: false, error: "The session expired. Sign in again." };
  let signer: string;
  try {
    signer = await recoverMessageAddress({ message: s.message, signature: s.signature as `0x${string}` });
  } catch {
    return { ok: false, error: "The signature does not decode." };
  }
  if (getAddress(signer) !== getAddress(f.address)) return { ok: false, error: "The signature is not from this wallet (EOA only in v1)." };
  return { ok: true, address: getAddress(f.address), expiresAt: f.expiresAt, nonce: f.nonce.toLowerCase() };
}
