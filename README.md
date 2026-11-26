# Rexson

Rexson is approved project memory for people who use several AI assistants. Instead of explaining the same project to every assistant and correcting answers built on old information, you keep one versioned set of facts: each fact has a source, is approved before anyone reads it, and each assistant gets its own access key scoped to the facts it may see. Assistants read the current approved version over plain HTTP, and every read leaves a receipt.

Approved memory for AI assistants. Current facts, scoped access and read receipts for Robinhood Chain.

## Read this before anything else

This repository is the working code behind https://rexson.xyz.

- **What runs today:** facts with sources and versions, drafts, all-or-nothing batch approval, stale-draft detection, retire and delete; assistant keys scoped to fact groups, a level and an expiry; the read API (`GET /api/facts` as JSON or plain text, and a read-only JSON-RPC tool at `POST /api/mcp`); read receipts without fact text. A practice workspace runs in the browser on sample data with no wallet; a hosted project needs one free wallet signature.
- **Live data:** the latest Robinhood Chain block, gas price and the Chainlink ETH/USD feed, read through the site's own relay; the ledger page reads the contract's events from chain logs.
- **The contract:** `RexsonFactLedger` records hashes only (approved content hashes, grant scopes per assistant key hash, receipt Merkle roots) as a public change log. It is live on Robinhood Chain at `0x1b9ecaaa58e28e2a9f3edd2175c649b844a232ce` (verified on Blockscout). When a grant is issued on chain, the server checks it with `checkReads` before every read and refuses the read if the chain says no.
- **Planned, not built:** several editors and reviewers in one hosted project (the contract already has the roles), more than one project per wallet, and token features for $REXSON.
- **What nothing here claims:** Rexson does not make an assistant correct and cannot reach copies of a fact you pasted elsewhere. The server operator can read hosted facts; do not store secrets. $REXSON has no promised value. Not affiliated with Robinhood.

## Layout

| Path | What it is |
|---|---|
| `src/app/` | Pages (`/`, `/app`, `/docs`, `/ledger`, `/token`) and API routes (`facts`, `mcp`, `workspace`, `ledger`, `chain`, `rpc`). |
| `src/components/` | Interface components: home sections, the workspace app, the chain tab, the wallet dialog. |
| `src/config/` | `brand.ts` (name, ticker, token address, links) and `contracts.ts` (deployed contract address). Every brand value is read from here. |
| `src/lib/facts/` | The workspace rules (drafts, batch approval, grants, reads, receipts, hashing, Merkle roots), shared by the browser and the server. |
| `src/lib/server/` | Hosted storage (locked, compare-and-set writes; receipts in their own list), the assistant read path, the on-chain grant check. |
| `contracts/` | Solidity sources (`src/`) and Foundry tests (`test/`). |
| `examples/assistant.mjs` | A dependency-free client that reads facts as text, JSON or through the JSON-RPC tool. |
| `scripts/` | `verify-deployment` and the contract artifact builder. |
| `public/` | Brand images and wallet icons. |

## Run the tests

Node.js 20 or newer.

```
npm install
npm run typecheck
npm test
```

Contracts use [Foundry](https://book.getfoundry.sh/):

```
cd contracts
bash setup.sh
forge test
forge test --match-contract Fork --fork-url <Robinhood Chain RPC> --evm-version cancun
```

### What was checked for this snapshot

2026-11-26 (UTC), Node.js 25.8.2, forge 1.5.1: `npm run typecheck` exit 0; `npm test` 41 pass / 0 fail (workspace rules, reason-bit parity with the Solidity library, Merkle proofs, sign-in sessions, concurrent storage writes, relay limits, verify-deployment); `next build` 21 routes; `forge test` 38 passed (33 unit and fuzz tests in `RexsonFactLedger.t.sol`, 5 invariants in `RexsonFactLedger.invariant.t.sol`) and 2 fork tests on Robinhood Chain. An end-to-end run on a local fork (chain id 4663) with injected test wallets passed 11 of 11 steps, and `verify-deployment` printed MATCH for the deployed test copy; that run needs a local chain and is not part of `npm test`.

## Look at the site

```
npm install
npm run build
npm start
```

Open http://localhost:6820. The practice workspace, the docs and the live chain figures work with no configuration. Without `KV_REST_API_URL` and `KV_REST_API_TOKEN` hosted projects live in one server instance's memory, and the app says "Not configured: saved data may be lost on restart". Without `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` the WalletConnect row says "Not configured on this site yet".

## Contracts

| Contract | Address | Explorer |
|---|---|---|
| RexsonFactLedger (with internal library RexsonLedgerMath) | `0x1b9ecaaa58e28e2a9f3edd2175c649b844a232ce` | [Blockscout](https://robinhoodchain.blockscout.com/address/0x1b9ecaaa58e28e2a9f3edd2175c649b844a232ce) |

Projects have an owner who names editors and reviewers. An editor proposes a fact version based on the current one; a reviewer approves up to 20 drafts in one transaction, all or none, and cannot approve their own draft unless the project allows solo approval. The owner issues, changes and revokes grants (assistant key hash, groups, level, expiry). `checkRead`, `checkPropose` and `checkApprove` return every refusal as a reason bit before anything is signed. Receipt batches are anchored as Merkle roots. Fact text never goes on chain. There is no global owner, no admin over anyone's project, no fee, no upgrade, and it holds no funds.

## Verify a deployment

```
npm run verify-deployment -- --ledger <address> --ledger-tx <creation tx>
```

The script compares the bytecode on Robinhood Chain with the build in this repository and prints MATCH or the first difference. `VERIFY_RPC_URL` points it at another RPC.

## Add the network to your wallet

| Field | Value |
|---|---|
| Network | Robinhood Chain |
| Chain ID | 4663 |
| Currency | ETH |
| RPC | https://rpc.mainnet.chain.robinhood.com |
| Explorer | https://robinhoodchain.blockscout.com |

The site offers to add it when you connect.

## Data sources and limits

- Robinhood Chain RPC (official endpoint, with public fallbacks for reads): latest block, gas price, Chainlink ETH/USD, contract reads and logs. Answers are cached for a few seconds; a failed read shows "—", never an old number presented as new.
- The ledger page scans the contract's logs from its deployment block and says which blocks could not be read.
- Hosted facts, keys (hashes only) and receipts: kv-gateway (Redis-compatible) when configured, else one instance's bounded memory. Projects expire 180 days after their last change; receipts keep the newest 300.
- Every API route is rate limited per network and per key or wallet.

## Token

$REXSON is the community token of Rexson on Robinhood Chain. Contract address: announced on https://rexson.xyz at launch. It has no promised value. Token features (more projects, facts and assistant keys for holders) are a concept, not built; Rexson works fully without the token.

## Deploy your own

1. Import the repository into a Next.js host (preset Next.js, root `./`).
2. Optional environment variables (names and formats only):

| Variable | What it is for | Format |
|---|---|---|
| `KV_REST_API_URL` | Shared store for hosted projects, receipts and rate limits | `https://…` |
| `KV_REST_API_TOKEN` | Token for that store | string |
| `ROBINHOOD_RPC_URL` | Private Robinhood Chain RPC for server reads and log scans | `https://…` |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | Public RPC override for the browser | `https://…` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect in the wallet dialog | 32 hex characters |
| `STORE_KEY_PREFIX` | Key prefix in a shared store | e.g. `rexson:` |

3. Point your domain at it and check `/` (200), `/api/chain` (JSON with a block number) and `/llms.txt`.
4. Contract: `RexsonFactLedger` takes no constructor arguments. Deploy it from your own wallet (one creation transaction), put the address, block and creation transaction into `src/config/contracts.ts`, then run `npm run verify-deployment`.

## Contributing

Fork the repository, branch from `main`, and run `npm run typecheck`, `npm test` and `npm run build`, and `bash setup.sh && forge test` in `contracts/` before opening a pull request. For a bug, open an issue with the expected and actual behavior and minimal steps. Keep private keys, seed phrases and environment values out of issues.

## Security

Please do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. The contract, the API routes, key handling and storage are in scope; wallets, RPC providers, explorers and launchpads are not. There is no bug bounty.

## Notices and license

This project's original code is released under the [MIT License](LICENSE). Fonts: Space Grotesk and JetBrains Mono, self-hosted under the SIL Open Font License (`src/fonts/`). Wallet logos in `public/wallets/` belong to their projects and are used only to identify each wallet. The Rexson name, logo and artwork belong to the project and are not licensed for reuse as a brand.
