import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { allowedOrigins, newSession, verifySession } from "@/lib/auth/session";

const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const ORIGINS = allowedOrigins(true);
const T = 1_800_000_000;

async function signed(domain: string, uri: string, now = T, seconds = 3600) {
  const message = newSession(domain, uri, acct.address, now, seconds);
  return { message, signature: await acct.signMessage({ message }) };
}

test("a session for this site verifies", async () => {
  const r = await verifySession(await signed("rexson.xyz", "https://rexson.xyz"), T + 10, ORIGINS);
  assert.ok(r.ok && r.address === acct.address);
});

test("wrong domain, expired, tampered or foreign signatures are refused", async () => {
  assert.equal((await verifySession(await signed("evil.example", "https://evil.example"), T, ORIGINS)).ok, false);
  assert.equal((await verifySession(await signed("rexson.xyz", "https://rexson.xyz"), T + 3601, ORIGINS)).ok, false);
  const s = await signed("rexson.xyz", "https://rexson.xyz");
  assert.equal((await verifySession({ ...s, message: s.message.replace("Rexson", "Rexsom") }, T, ORIGINS)).ok, false);
  const other = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
  assert.equal((await verifySession({ message: s.message, signature: await other.signMessage({ message: s.message }) }, T, ORIGINS)).ok, false);
  assert.equal((await verifySession(null, T, ORIGINS)).ok, false);
  assert.equal((await verifySession(await signed("localhost:6820", "http://localhost:6820"), T, allowedOrigins(false))).ok, false, "local hosts refused when hosted");
  assert.ok((await verifySession(await signed("localhost:6820", "http://localhost:6820"), T, ORIGINS)).ok);
});
