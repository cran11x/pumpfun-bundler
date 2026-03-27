# PumpFun Bundler - Complete Guide

## What Is This?

A Solana token launcher that creates tokens on **Pump.Fun** and atomically executes bundled buys from multiple wallets in the **same block** using **Jito MEV bundles**. This prevents snipers from front-running your launch because all buy transactions execute atomically -- they either all succeed or all fail together.

The project has three interfaces:
- **Web UI** (Next.js) at `http://localhost:3000` - visual dashboard for the full workflow
- **REST API** (Express) at `http://localhost:3001` - programmatic control
- **CLI** (interactive menu) via `npm start` - terminal-based workflow

---

## Architecture

```
+-------------------+       +-------------------+       +-------------------+
|   Frontend (UI)   | ----> |   API Server      | ----> |   Solana / Jito   |
|   Next.js :3000   |       |   Express :3001   |       |   Blockchain      |
+-------------------+       +-------------------+       +-------------------+
                                     |
                                     v
                            +-------------------+
                            |   Local Files     |
                            |   src/keypairs/   |
                            |   src/keyInfo.json|
                            +-------------------+
```

**Frontend** (`frontend/`) - Next.js app with Zustand state management, Tailwind CSS, and Lucide icons. Pages: Dashboard, Settings, Wallets, Launch, Sell.

**API Server** (`api/server.ts`) - Express server handling all operations. Talks to Solana RPC (via Helius) and Jito block engines.

**Core Logic** (`src/`) - Token creation, wallet management, LUT operations, selling -- all in TypeScript.

---

## Prerequisites

- **Node.js** v18+
- **Helius API Key** (free at https://helius.xyz) - provides Solana RPC access
- **SOL** in your main wallet (for funding sub-wallets and paying fees)
- A token image file (placed in `./img/` directory before launch)

---

## Setup

### 1. Install Dependencies

```bash
npm install
cd frontend && npm install && cd ..
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in:

```env
# Network: "mainnet" or "devnet" (use devnet for testing without real money)
NETWORK_MODE=devnet

# Your Helius API key
HELIUS_API_KEY=your-api-key-here
```

That's it. RPC URLs are auto-generated from your Helius API key:
- Devnet: `https://devnet.helius-rpc.com/?api-key=YOUR_KEY`
- Mainnet: `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY`

### 3. Start the Application

```bash
# Start both API + Frontend together:
npm run dev

# Or start them separately:
npm run dev:api       # API on :3001
npm run dev:frontend  # Frontend on :3000

# Or use the CLI instead:
npm start
```

---

## How It Works - Step by Step

### The Full Token Launch Workflow

```
1. Generate Wallets  -->  2. Create LUT  -->  3. Fund Wallets
                                                     |
                                                     v
6. Sell Tokens  <--  5. Tokens Trading  <--  4. Launch Token
```

### Step 1: Generate Bundler Wallets

**What:** Creates multiple Solana keypairs (sub-wallets) that will each buy your token at launch.

**Why:** Having multiple wallets buy simultaneously makes your token look organic and prevents a single wallet from holding too much supply.

**How it works:**
- Generates N random Solana keypairs (default: 12)
- Saves each as `src/keypairs/keypair1.json`, `keypair2.json`, etc.
- Your main wallet (`src/keypairs/main-wallet.json`) is never deleted
- Updates `src/keyInfo.json` with wallet public keys

**Web UI:** Settings page > "Create Wallets" button
**API:** `POST /api/wallets/create` with `{ "count": 12 }`
**CLI:** Main Menu > Wallet Management > Create Wallets

### Step 2: Create Lookup Table (LUT)

**What:** Creates a Solana Address Lookup Table containing all addresses used in the launch.

**Why:** Solana transactions have a size limit. LUTs compress addresses from 32 bytes to 1-byte indexes, fitting more instructions per transaction.

**How it works:**
- Creates a new LUT on-chain via `AddressLookupTableProgram`
- Adds all addresses: protocol programs (SPL Token, Metaplex, Pump.Fun, Raydium), all wallet pubkeys + their ATAs, mint + bonding curve PDAs
- Chunks addresses into groups of 30 (Solana limit per extend instruction)
- Sends as a Jito bundle (4 transactions: create + 3 extends)
- Saves LUT address to `src/keyInfo.json`

**Web UI:** Settings page > "Create LUT" button
**API:** `POST /api/lut/create` with `{ "jitoTip": 0.001 }`
**CLI:** Main Menu > Setup > Create LUT

### Step 3: Fund Wallets

**What:** Transfers SOL from your main wallet to all sub-wallets so they can buy tokens.

**Why:** Each wallet needs SOL to execute its buy transaction (token cost + fees).

**How it works:**
- Reads buy amounts from `src/keyInfo.json` (set via buy amount generation)
- Adds 1.5% buffer for transaction fees
- Creates chunked transfer transactions (max 45 instructions per tx)
- Sends via Jito bundle on mainnet, or directly on devnet

**Buy Amount Generation:**
- You can set amounts per wallet in EUR or SOL
- Variance parameter randomizes amounts (so wallets don't all buy identical amounts)
- Example: target 300 EUR with 30 EUR variance = each wallet buys 270-330 EUR worth

**Web UI:** Wallets page > "Fund Wallets" button (set amounts on Launch page first)
**API:** `POST /api/wallets/fund` with `{ "devWalletAmount": 1.0, "amountPerOtherWallet": 0.5 }`
**CLI:** Main Menu > Wallet Management > Fund Wallets

### Step 4: Launch Token

**What:** Creates your token on Pump.Fun and executes all buys atomically.

**Why:** Atomic execution means snipers can't front-run. All wallets buy in the same block.

**How it works:**

1. **Image Upload:** Reads image from `./img/` directory, uploads to `pump.fun/api/ipfs`, gets a `metadataUri`

2. **Mint Preparation:** Uses pre-generated mint keypair from `keyInfo.json` (or generates new one). Verifies mint doesn't already exist on-chain.

3. **Build Atomic Bundle:**
   - **Transaction 1 (Dev Wallet):** Creates token on Pump.Fun (create instruction) + creates ATA + buys tokens + pays Jito tip
   - **Transactions 2-5 (Bundler Wallets):** Each wallet creates its ATA + buys tokens. One tx per wallet (max 4 bundler wallets due to Jito's 5-tx-per-bundle limit)

4. **Simulate:** All transactions are simulated before sending to catch errors early

5. **Send via Jito:** Bundle sent to multiple Jito block engines (Frankfurt, NY, Tokyo) in parallel for redundancy

6. **Poll for confirmation:** Checks transaction signatures for finalized status (up to 15 seconds)

**Important limits:**
- Max 5 transactions per Jito bundle = 1 dev wallet + 4 bundler wallets per atomic launch
- Additional wallets would need a second bundle (not in same block)

**Web UI:** Launch page > Fill in token details + image > "Launch Token"
**API:** `POST /api/launch` (multipart form with name, symbol, description, image, jitoTip)
**CLI:** Main Menu > Launch Token

### Step 5: Sell Tokens

**What:** Sells a percentage of your token supply back for SOL.

**Two selling modes:**

**A) Pump.Fun Sell** - While token is still on the bonding curve:
- Gathers tokens from all wallets into the payer's ATA
- Executes sell instruction against the bonding curve
- Max 25% of total supply per sell (price impact protection)

**B) Raydium Sell** - After token migrates to Raydium:
- Requires the Raydium market ID (shown after migration)
- Derives all Raydium pool keys from the market
- Swaps tokens for WSOL via Raydium AMM

**Web UI:** Sell page > Choose Pump.Fun or Raydium > Set percentage
**API:** `POST /api/sell/pumpfun` with `{ "percentage": 25, "jitoTip": 0.001 }`
**CLI:** Main Menu > Sell > Choose mode

### Step 6: Reclaim SOL

**What:** Pulls remaining SOL from all sub-wallets back to your main wallet.

**Web UI:** Wallets page > "Reclaim SOL"
**API:** `POST /api/wallets/reclaim`
**CLI:** Main Menu > Wallet Management > Reclaim SOL

---

## Web UI Pages

### Dashboard (`/`)
- System status: RPC connection, Jito block engine, current network
- Wallet overview: total wallets, total balance, average balance
- Quick action buttons: Launch Token, Manage Wallets, Sell Tokens

### Settings (`/settings`)
- Switch network (mainnet/devnet)
- Generate new main wallet
- Create bundler wallets (set count)
- Create LUT
- View current configuration

### Wallets (`/wallets`)
- View all wallet public keys and balances
- Fund wallets with SOL
- Reclaim SOL from sub-wallets
- Check individual wallet balances

### Launch (`/launch`)
- Token metadata form: name, symbol, description, socials (twitter, telegram, website, tiktok, youtube)
- Image upload with preview
- Buy amount configuration: currency (EUR/SOL), target amount, variance
- Per-wallet manual amount override
- Mint address display (pre-generated)
- Jito tip setting
- Launch button

### Sell (`/sell`)
- Choose sell mode: Pump.Fun or Raydium
- Set sell percentage (max 25%)
- Set Jito tip
- Execute sell

---

## API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | System health: RPC, Jito, network, slot |
| GET | `/api/validate` | Pre-launch validation checks |
| GET | `/api/wallets` | List all bundler wallets |
| POST | `/api/wallets/create` | Create N new wallets `{ count: 12 }` |
| GET | `/api/wallets/main` | Dev + payer wallet info and balances |
| GET | `/api/wallets/balances` | All wallet SOL balances |
| POST | `/api/wallets/fund` | Fund wallets with SOL |
| POST | `/api/wallets/reclaim` | Reclaim SOL from sub-wallets |
| GET | `/api/prices/sol` | SOL price in EUR/USD (cached) |
| POST | `/api/wallets/buy-amounts/generate` | Generate randomized buy amounts |
| POST | `/api/wallets/buy-amounts/set` | Manually set buy amounts per wallet |
| GET | `/api/mint` | Get current mint address |
| POST | `/api/mint/generate` | Generate or reuse mint keypair |
| POST | `/api/launch` | Launch token (multipart form) |
| POST | `/api/sell/pumpfun` | Sell on Pump.Fun bonding curve |
| POST | `/api/lut/create` | Create new Lookup Table |
| POST | `/api/lut/extend` | Extend LUT with new mint |
| GET | `/api/network` | Get current network mode |
| PUT | `/api/network` | Switch network (mainnet/devnet) |
| POST | `/api/reset` | Reset wallets/mint/LUT config |

---

## File-by-File Reference

### Root
| File | Purpose |
|------|---------|
| `main.ts` | CLI entry point with interactive menu loop |
| `config.ts` | Network config, wallet loading, RPC connection, Pump.Fun program constants |
| `package.json` | Dependencies and npm scripts |
| `.env` | Environment variables (HELIUS_API_KEY, NETWORK_MODE) |
| `pumpfun-IDL.json` | Pump.Fun program IDL (interface definition) |

### `src/` - Core Logic
| File | Purpose |
|------|---------|
| `createKeys.ts` | Generate, save, and load Solana keypairs |
| `createLUT.ts` | Create and extend Address Lookup Tables |
| `jitoPool.ts` | Token creation + atomic bundled buys via Jito |
| `sellFunc.ts` | Sell tokens on Pump.Fun bonding curve |
| `sellRay.ts` | Sell tokens on Raydium after migration |
| `senderUI.ts` | Fund wallets, reclaim SOL, check balances, simulate buys |
| `apiWrappers.ts` | Non-interactive wrappers for API server use |
| `keyInfo.json` | Persistent config: wallet pubkeys, LUT address, mint, buy amounts |

### `src/clients/` - External Integrations
| File | Purpose |
|------|---------|
| `config.ts` | Jito tip accounts, block engine URLs, convict config schema |
| `jito.ts` | Jito searcher client initialization |
| `LookupTableProvider.ts` | LUT caching and optimal table selection |
| `poolKeysReassigned.ts` | Derive Raydium pool keys from Serum market ID |

### `src/utils/` - Utilities
| File | Purpose |
|------|---------|
| `bundleSender.ts` | Simulate, send, and poll Jito bundles |
| `validations.ts` | Pre-launch checks (RPC, LUT, balances) |
| `healthCheck.ts` | RPC and Jito health status |
| `logger.ts` | Structured logging with timestamps |
| `errorHandler.ts` | Error classification and retry decisions |
| `retry.ts` | Exponential backoff retry logic |

### `src/ui/` - CLI Interface
| File | Purpose |
|------|---------|
| `menu.ts` | Interactive CLI menus (inquirer-based) |

### `api/` - REST API
| File | Purpose |
|------|---------|
| `server.ts` | Express server with all REST endpoints |

### `frontend/` - Web UI
| File | Purpose |
|------|---------|
| `app/page.tsx` | Dashboard page |
| `app/settings/page.tsx` | Settings and configuration |
| `app/wallets/page.tsx` | Wallet management |
| `app/launch/page.tsx` | Token launch form |
| `app/sell/page.tsx` | Token selling |
| `lib/api.ts` | Axios API client (talks to Express server) |
| `lib/store.ts` | Zustand state stores (health, network, wallets) |

---

## Key Concepts

### Jito Bundles
Jito is a Solana MEV (Maximal Extractable Value) protocol. Bundles are atomic groups of up to 5 transactions that execute together in the same block. You pay a "tip" to Jito validators for priority inclusion. If any transaction fails, the entire bundle is reverted.

### Address Lookup Tables (LUTs)
Solana transactions have a 1232-byte size limit. Each account reference normally costs 32 bytes. LUTs store frequently-used addresses on-chain, replacing 32-byte addresses with 1-byte indexes. This dramatically reduces transaction size, allowing more instructions per transaction.

### Pump.Fun Bonding Curve
Pump.Fun tokens start on a bonding curve (automated market maker). Price increases as more tokens are bought. The formula is constant product: `k = virtualSol * virtualTokens`. When enough SOL accumulates, the token "migrates" to Raydium (full DEX liquidity pool).

### PDAs (Program Derived Addresses)
Deterministic addresses derived from seeds + a program ID. Used for bonding curve accounts, associated token accounts, metadata accounts. No private key exists for PDAs -- they're controlled by the program.

### Jito Tip
A SOL payment to Jito validators for including your bundle. Higher tips = higher priority. The bundler automatically caps the tip to your available balance minus reserves. Typical tips: 0.001-0.05 SOL.

---

## Troubleshooting

### "HELIUS_API_KEY environment variable is required"
Create a `.env` file with your Helius API key. Get one free at https://helius.xyz.

### "No wallets found"
Create wallets first: Settings > Create Wallets, or `POST /api/wallets/create`.

### "Lookup Table (LUT) not found"
Create a LUT first: Settings > Create LUT, or `POST /api/lut/create`.

### "Insufficient balance in payer wallet"
Your main wallet needs enough SOL to fund all sub-wallets. Send SOL to the address shown on the Dashboard.

### Bundle dropped / not finalized
Jito bundles can be dropped if the tip is too low or the block is full. Increase the Jito tip and retry. The system automatically retries up to 3 times.

### "Account not found" during simulation
This is often expected -- transactions later in the bundle depend on accounts created by earlier transactions. The simulator warns but proceeds.

### Token already exists on-chain
The mint was already used. Generate a new mint: `POST /api/mint/generate` with `{ "force": true }`.

### Devnet vs Mainnet
Always test on devnet first. Get free devnet SOL from https://faucet.solana.com. Switch networks in Settings or change `NETWORK_MODE` in `.env`.

---

## npm Scripts

```bash
npm start            # CLI interactive menu
npm run dev          # Start API + Frontend together (concurrently)
npm run dev:api      # Start API server only (:3001)
npm run dev:frontend # Start frontend only (:3000)
npm run api          # Start API server (alias)
npm test             # Run Jest tests
npm run test:api     # Run API tests only
npm run test:e2e     # Run Playwright E2E tests
```
