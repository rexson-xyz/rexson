"use client";

import { useCallback, useEffect, useState } from "react";
import { newSession, type SignedSession } from "@/lib/auth/session";
import type { Workspace } from "@/lib/facts/model";
import { useWallet } from "@/components/wallet/WalletProvider";
import { storageKey } from "@/config/storage";

/*
 * Hosted workspace client: one signed Sign-In with Ethereum message (no gas) kept in sessionStorage for this tab, sent with every
 * /api/workspace call. The server checks it every time.
 */

export type HostedWorkspace = Workspace & { assistants: (Workspace["assistants"][number] & { hasSecret?: boolean })[] };
type Reply = { workspace: HostedWorkspace | null; token: string | null; storage: "shared" | "memory"; error?: string };

const SKEY = storageKey("session");

function readSession(address: string | null): SignedSession | null {
  try {
    const raw = sessionStorage.getItem(SKEY);
    if (!raw || !address) return null;
    const s = JSON.parse(raw) as SignedSession;
    return s.message.split("\n")[1]?.toLowerCase() === address.toLowerCase() ? s : null;
  } catch {
    return null;
  }
}

export function useHosted() {
  const { address, signMessage } = useWallet();
  const [session, setSession] = useState<SignedSession | null>(null);
  const [ws, setWs] = useState<HostedWorkspace | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [storage, setStorage] = useState<"shared" | "memory" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSession(readSession(address));
    setWs(null);
    setLoaded(false);
  }, [address]);

  const call = useCallback(
    async (op: Record<string, unknown>, s = session): Promise<Reply> => {
      if (!s) throw new Error("Sign in first.");
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: s, ...op }), cache: "no-store" });
        const body = (await res.json().catch(() => null)) as Reply | null;
        if (res.status === 401) {
          sessionStorage.removeItem(SKEY);
          setSession(null);
        }
        if (!res.ok || !body) throw new Error(body?.error ?? `Request failed (${res.status}).`);
        setWs(body.workspace);
        setStorage(body.storage);
        setLoaded(true);
        return body;
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        setError(m);
        throw new Error(m);
      } finally {
        setBusy(false);
      }
    },
    [session],
  );

  const signIn = useCallback(async () => {
    if (!address) throw new Error("Connect a wallet first.");
    const message = newSession(window.location.host, window.location.origin, address);
    const signature = await signMessage(message);
    const s = { message, signature };
    sessionStorage.setItem(SKEY, JSON.stringify(s));
    setSession(s);
    await call({ op: "load" }, s);
  }, [address, signMessage, call]);

  useEffect(() => {
    if (session && !loaded && !busy) call({ op: "load" }).catch(() => {});
  }, [session, loaded, busy, call]);

  const signOut = () => {
    sessionStorage.removeItem(SKEY);
    setSession(null);
    setWs(null);
    setLoaded(false);
  };

  return { address, session, ws, loaded, storage, busy, error, call, signIn, signOut };
}
