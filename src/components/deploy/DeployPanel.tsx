"use client";

import { useState } from "react";
import artifacts from "@/lib/contracts/artifacts.json";
import { CHAIN, explorerAddress, explorerTx } from "@/config/brand";
import { ledgerLive, CONTRACTS } from "@/config/contracts";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { explain, waitForReceipt } from "@/lib/client";

/* Owner tool (local only): deploys RexsonFactLedger from the owner's wallet with this build's exact creation code. */
export function DeployPanel() {
  const { address, chainId, sendTransaction } = useWallet();
  const { open } = useWalletModal();
  const [state, setState] = useState<{ tx?: string; address?: string | null; block?: number; error?: string; busy?: boolean }>({});
  const art = artifacts.contracts.RexsonFactLedger;
  const deploy = async () => {
    if (!address) return open();
    setState({ busy: true });
    try {
      const tx = await sendTransaction({ data: art.creation });
      const r = await waitForReceipt(tx, 300_000);
      setState({ tx, address: r.contractAddress, block: r.blockNumber, error: r.ok ? undefined : "The deployment reverted." });
    } catch (e) {
      setState({ error: explain(e) });
    }
  };
  return (
    <div className="panel grid gap-4">
      <h3>Deploy RexsonFactLedger</h3>
      <p className="text-[14px] text-[var(--muted)]">
        No constructor arguments. Creation code sha256 <span className="mono">{art.sha256.slice(0, 16)}…</span> ({(art.creation.length - 2) / 2} bytes). Measured deploy gas: about 2.2 M on {CHAIN.name}. Wallet chain:{" "}
        {chainId ?? "not connected"} (needs {CHAIN.id}).
      </p>
      {ledgerLive() ? <p className="note warn">Already configured: {CONTRACTS.ledger}. Deploying again creates a second, unrelated ledger.</p> : null}
      <button type="button" className="btn btn-accent w-max" disabled={state.busy} onClick={deploy} data-testid="deploy-ledger">
        {state.busy ? "Confirm in wallet, then wait…" : address ? "Deploy from this wallet" : "Connect the owner's wallet"}
      </button>
      {state.error ? <p className="note bad">{state.error}</p> : null}
      {state.tx ? (
        <div className="note ok grid gap-1 text-[13px]" data-testid="deploy-result">
          <span>
            Tx <a className="underline" href={explorerTx(state.tx)} target="_blank" rel="noreferrer">{state.tx}</a>
          </span>
          {state.address ? (
            <span>
              Address <a className="underline" href={explorerAddress(state.address)} target="_blank" rel="noreferrer">{state.address}</a> · block {state.block}
            </span>
          ) : null}
          <span>Next: put address, block and tx in src/config/contracts.ts, run npm run verify-deployment, verify on the explorer.</span>
        </div>
      ) : null}
    </div>
  );
}
