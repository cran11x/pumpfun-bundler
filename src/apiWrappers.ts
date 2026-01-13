// API Wrapper functions that accept parameters instead of prompting
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as fs from "fs";
import path from "path";
import * as anchor from "@coral-xyz/anchor";
import axios from "axios";
import { connection, wallet, payer, rpc } from "../config";
import { loadKeypairs } from "./createKeys";
import { sendBundle as sendBundleUtil } from "./utils/bundleSender";
import { simulateBundle } from "./utils/bundleSender";
import * as spl from "@solana/spl-token";
import bs58 from "bs58";
import { getRandomTipAccount } from "./clients/config";
import BN from "bn.js";
import { PUMP_PROGRAM, global, feeRecipient, eventAuthority, MPL_TOKEN_METADATA_PROGRAM_ID, mintAuthority } from "../config";
import { SystemProgram, VersionedTransaction, TransactionMessage, TransactionInstruction, PublicKey, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";

const keyInfoPath = path.join(__dirname, "keyInfo.json");

// Fee program constant from Pump.fun IDL
const FEE_PROGRAM = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");
// Fee config seed bytes from Pump.fun IDL
const FEE_CONFIG_SEED_BYTES = Buffer.from([
  1, 86, 224, 246, 147, 102, 90, 207, 68, 219, 21, 104, 191, 23, 91, 170, 81,
  137, 203, 151, 245, 210, 255, 59, 101, 93, 43, 182, 253, 109, 24, 176,
]);

// Wrapper for buyBundle with parameters
export async function buyBundleWithParams(params: {
  name: string;
  symbol: string;
  description: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  jitoTip: number;
  imagePath: string;
  dryRun?: boolean;
}) {
  const { buyBundleWithParams: buyBundle } = await import("./jitoPool");
  return buyBundle({
    name: params.name,
    symbol: params.symbol,
    description: params.description,
    twitter: params.twitter,
    telegram: params.telegram,
    website: params.website,
    jitoTip: params.jitoTip,
  }, params.imagePath, { dryRun: params.dryRun });
}

// Wrapper for sellXPercentagePF with parameters
export async function sellPumpFunWithParams(
  percentage: number,
  jitoTip: number = 0.01,
  options?: {
    dryRun?: boolean;
    mint?: string;
    mode?: "quick" | "consolidated" | "per-wallet";
    wallet?: string;
    wallets?: string[];
    walletPercentages?: Record<string, number>;
    autoFundWallets?: boolean;
  }
) {
  const provider = new anchor.AnchorProvider(new anchor.web3.Connection(rpc), new anchor.Wallet(wallet), { commitment: "confirmed" });
  const IDL_PumpFun = JSON.parse(fs.readFileSync("./pumpfun-IDL.json", "utf-8")) as anchor.Idl;
  const pfprogram = new anchor.Program(IDL_PumpFun, provider);
  
  const bundledTxns: VersionedTransaction[] = [];
  const subWalletKeypairs = loadKeypairs();
  
  let poolInfo: { [key: string]: any } = {};
  if (fs.existsSync(keyInfoPath)) {
    const data = fs.readFileSync(keyInfoPath, "utf-8");
    poolInfo = JSON.parse(data);
  }
  
  if (!poolInfo.addressLUT) {
    throw new Error("LUT must be set before selling");
  }

  if (!options?.mint && !poolInfo.mint) {
    throw new Error("Mint is required (either pass mint param or set keyInfo.json mint)");
  }
  const mintPubkey = new PublicKey(options?.mint ?? poolInfo.mint);
  
  const lut = new PublicKey(poolInfo.addressLUT.toString());
  const lookupTableAccount = (await connection.getAddressLookupTable(lut)).value;
  
  if (lookupTableAccount == null) {
    throw new Error("Lookup table account not found!");
  }
  
  const [bondingCurve] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mintPubkey.toBytes()], pfprogram.programId);
  const [associatedBondingCurve] = PublicKey.findProgramAddressSync(
    [bondingCurve.toBytes(), spl.TOKEN_PROGRAM_ID.toBytes(), mintPubkey.toBytes()],
    spl.ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Resolve creator for this bonding curve (needed for creatorVault PDA) so we can sell any mint, not just tokens created by our dev wallet.
  let bondingCurveCreator: PublicKey = wallet.publicKey;
  try {
    // Anchor account namespace is camelCase: bondingCurve (struct name: BondingCurve)
    const bc: any = await (pfprogram as any).account.bondingCurve.fetch(bondingCurve);
    if (bc?.creator) bondingCurveCreator = bc.creator as PublicKey;
  } catch {
    // fallback: keep dev wallet as creator (works for tokens created by this dev wallet)
  }
  const [creatorVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("creator-vault"), bondingCurveCreator.toBuffer()],
    PUMP_PROGRAM
  );
  
  const mode: "quick" | "consolidated" | "per-wallet" = options?.mode ?? "consolidated";

  const supplyPercentDefault = percentage / 100;
  // Jito bundles typically require a minimum tip transfer. Clamp to >= 1000 lamports.
  const requestedTipLamports = Math.floor(jitoTip * LAMPORTS_PER_SOL);
  const jitoTipLamports = Math.max(1000, requestedTipLamports);
  
  const mintInfo = await connection.getTokenSupply(mintPubkey);

  // Build a pubkey->keypair map that includes dev wallet and all sub-wallets
  const keypairByPubkey = new Map<string, Keypair>();
  keypairByPubkey.set(wallet.publicKey.toString(), wallet);
  for (const kp of subWalletKeypairs) keypairByPubkey.set(kp.publicKey.toString(), kp);

  const resolveWalletKeypairs = (pubkeys?: string[]): Keypair[] => {
    if (!pubkeys || pubkeys.length === 0) {
      // Default: dev wallet + all sub-wallets
      return [wallet, ...subWalletKeypairs];
    }
    const res: Keypair[] = [];
    for (const pk of pubkeys) {
      const kp = keypairByPubkey.get(pk);
      if (!kp) throw new Error(`Unknown wallet pubkey: ${pk} (not found in dev wallet or keypairs dir)`);
      res.push(kp);
    }
    // Deduplicate by pubkey
    const seen = new Set<string>();
    return res.filter((kp) => {
      const s = kp.publicKey.toString();
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });
  };

  const pctForWallet = (kp: Keypair): number => {
    const m = options?.walletPercentages;
    const pct = m?.[kp.publicKey.toString()];
    const value = typeof pct === "number" && Number.isFinite(pct) ? pct : percentage;
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(`Invalid percentage for wallet ${kp.publicKey.toString()}: ${value}`);
    }
    return value;
  };

  const [globalVolumeAccumulator] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_volume_accumulator")],
    PUMP_PROGRAM
  );
  const [feeConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("fee_config"), FEE_CONFIG_SEED_BYTES],
    FEE_PROGRAM
  );

  // Helper to build a sell instruction for a given user + ATA + amount
  const buildSellIx = async (params: { user: PublicKey; associatedUser: PublicKey; amount: BN }) => {
    const [userVolumeAccumulator] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_volume_accumulator"), params.user.toBuffer()],
      PUMP_PROGRAM
    );

    return await pfprogram.methods
      .sell(params.amount, new BN(0))
      .accounts({
        global,
        feeRecipient,
        mint: mintPubkey,
        bondingCurve,
        associatedBondingCurve,
        associatedUser: params.associatedUser,
        user: params.user,
        systemProgram: SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        creatorVault,
        rent: SYSVAR_RENT_PUBKEY,
        eventAuthority,
        program: PUMP_PROGRAM,
        globalVolumeAccumulator,
        userVolumeAccumulator,
        feeConfig,
        feeProgram: FEE_PROGRAM,
      })
      .instruction();
  };

  const ensureWalletsHaveSolForFees = async (walletsToFund: Keypair[]) => {
    // Only used for per-wallet / quick when wallets need SOL for fee payer + tip.
    // We keep this NON-atomic (RPC sends) to avoid simulation false negatives from dependent balances.
    const minTargetLamports = Math.floor(0.005 * LAMPORTS_PER_SOL) + jitoTipLamports + 10_000; // fee buffer
    const needFunding: { kp: Keypair; lamports: number }[] = [];

    for (const kp of walletsToFund) {
      // skip if kp is payer itself
      if (kp.publicKey.toString() === payer.publicKey.toString()) continue;
      const bal = await connection.getBalance(kp.publicKey);
      if (bal < minTargetLamports) {
        needFunding.push({ kp, lamports: minTargetLamports - bal });
      }
    }

    if (needFunding.length === 0) return;

    const { blockhash } = await connection.getLatestBlockhash();
    const ixs: TransactionInstruction[] = needFunding.map((w) =>
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: w.kp.publicKey,
        lamports: w.lamports,
      })
    );

    const msg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message([lookupTableAccount]);

    const tx = new VersionedTransaction(msg);
    tx.sign([payer]);

    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction(sig, "confirmed");
  };

  // QUICK MODE: one wallet sells its own tokens (wallet is trader)
  if (mode === "quick") {
    if (!options?.wallet) throw new Error("Quick sell requires `wallet` pubkey");
    const kp = resolveWalletKeypairs([options.wallet])[0];

    if (options?.autoFundWallets) {
      await ensureWalletsHaveSolForFees([kp]);
    }

    const pct = pctForWallet(kp);
    const sellAmount = await getSellBalance(kp, mintPubkey, pct / 100);
    if (sellAmount <= 0) throw new Error(`No tokens to sell for wallet ${kp.publicKey.toString()}`);

    const walletATA = await spl.getAssociatedTokenAddress(mintPubkey, kp.publicKey);
    const ataIx = spl.createAssociatedTokenAccountIdempotentInstruction(
      kp.publicKey,
      walletATA,
      kp.publicKey,
      mintPubkey
    );

    const sellIx = await buildSellIx({ user: kp.publicKey, associatedUser: walletATA, amount: new BN(sellAmount) });
    const tipIx = SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: getRandomTipAccount(),
      lamports: BigInt(jitoTipLamports),
    });

    const { blockhash } = await connection.getLatestBlockhash();
    const msg = new TransactionMessage({
      payerKey: kp.publicKey,
      recentBlockhash: blockhash,
      instructions: [ataIx, sellIx, tipIx],
    }).compileToV0Message([lookupTableAccount]);

    const tx = new VersionedTransaction(msg);
    tx.sign([kp]);
    bundledTxns.push(tx);

    if (options?.dryRun) {
      const simulationPassed = await simulateBundle(bundledTxns);
      return { success: simulationPassed, dryRun: true, simulationPassed, amount: sellAmount };
    }

    await sendBundleUtil(bundledTxns);
    return { success: true, amount: sellAmount };
  }

  // PER-WALLET MODE: each wallet sells independently (each wallet is trader)
  if (mode === "per-wallet") {
    const walletsToSell = resolveWalletKeypairs(options?.wallets);

    if (options?.autoFundWallets) {
      await ensureWalletsHaveSolForFees(walletsToSell);
    }

    let total = 0;
    for (const kp of walletsToSell) {
      const pct = pctForWallet(kp);
      if (pct <= 0) continue;
      const sellAmount = await getSellBalance(kp, mintPubkey, pct / 100);
      if (sellAmount <= 0) continue;
      total += sellAmount;

      const walletATA = await spl.getAssociatedTokenAddress(mintPubkey, kp.publicKey);
      const ataIx = spl.createAssociatedTokenAccountIdempotentInstruction(
        kp.publicKey,
        walletATA,
        kp.publicKey,
        mintPubkey
      );

      const sellIx = await buildSellIx({ user: kp.publicKey, associatedUser: walletATA, amount: new BN(sellAmount) });
      const tipIx = SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: getRandomTipAccount(),
        lamports: BigInt(jitoTipLamports),
      });

      const { blockhash } = await connection.getLatestBlockhash();
      const msg = new TransactionMessage({
        payerKey: kp.publicKey,
        recentBlockhash: blockhash,
        instructions: [ataIx, sellIx, tipIx],
      }).compileToV0Message([lookupTableAccount]);

      const tx = new VersionedTransaction(msg);
      tx.sign([kp]);
      bundledTxns.push(tx);
    }

    if (total <= 0) throw new Error("No tokens found to sell for selected wallets");

    if (options?.dryRun) {
      const simulationPassed = await simulateBundle(bundledTxns);
      return { success: simulationPassed, dryRun: true, simulationPassed, amount: total };
    }

    await sendBundleUtil(bundledTxns);
    return { success: true, amount: total };
  }

  // CONSOLIDATED MODE (default): collect into payer ATA, then one sell (payer is trader)
  let sellTotalAmount = 0;

  const walletsToSell = resolveWalletKeypairs(options?.wallets);
  const PayerTokenATA = await spl.getAssociatedTokenAddress(mintPubkey, payer.publicKey);
  const { blockhash } = await connection.getLatestBlockhash();

  // Transfer instructions (chunked to keep tx size/signers reasonable)
  const transferWallets = walletsToSell.filter((kp) => pctForWallet(kp) > 0);
  const chunks: Keypair[][] = [];
  for (let i = 0; i < transferWallets.length; i += 6) chunks.push(transferWallets.slice(i, i + 6));

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    const instructionsForChunk: TransactionInstruction[] = [];
    const isFirstChunk = chunkIndex === 0;

    // Ensure payer's ATA exists before consolidating (only once)
    if (isFirstChunk) {
      instructionsForChunk.push(
        spl.createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey,
          PayerTokenATA,
          payer.publicKey,
          mintPubkey
        )
      );
    }

    const signers: Keypair[] = [payer];

    for (const kp of chunk) {
      const pct = pctForWallet(kp);
      const transferAmount = await getSellBalance(kp, mintPubkey, pct / 100);
      if (transferAmount <= 0) continue;
      sellTotalAmount += transferAmount;

      const tokenATA = await spl.getAssociatedTokenAddress(mintPubkey, kp.publicKey);
      // If the wallet is payer itself, no transfer needed; tokens already in payer ATA.
      if (kp.publicKey.toString() === payer.publicKey.toString()) continue;

      instructionsForChunk.push(
        spl.createTransferInstruction(tokenATA, PayerTokenATA, kp.publicKey, transferAmount)
      );
      signers.push(kp);
    }

    if (instructionsForChunk.length === 0) continue;

    const msg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: instructionsForChunk,
    }).compileToV0Message([lookupTableAccount]);

    const tx = new VersionedTransaction(msg);
    tx.sign(signers);
    bundledTxns.push(tx);
  }

  if (sellTotalAmount <= 0) {
    throw new Error("No tokens found to sell (sellTotalAmount=0). Ensure your wallets actually hold the token.");
  }
  
  if (+mintInfo.value.amount * 0.25 <= sellTotalAmount) {
    throw new Error("Cannot sell more than 25% of supply at a time");
  }
  
  // Sell tx should use the main payer as fee payer to avoid requiring SOL on a random sub-wallet.
  const feePayerKeypair = payer;
  
  const sellIx = await buildSellIx({
    user: payer.publicKey,
    associatedUser: PayerTokenATA,
    amount: new BN(sellTotalAmount),
  });
  
  const sellPayerIxs = [
    sellIx,
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: getRandomTipAccount(),
      lamports: BigInt(jitoTipLamports),
    })
  ];
  
  const sellMessage = new TransactionMessage({
    payerKey: feePayerKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions: sellPayerIxs,
  }).compileToV0Message([lookupTableAccount]);
  
  const sellTx = new VersionedTransaction(sellMessage);
  sellTx.sign([payer]);
  bundledTxns.push(sellTx);
  
  if (options?.dryRun) {
    const simulationPassed = await simulateBundle(bundledTxns);
    return { success: simulationPassed, dryRun: true, simulationPassed, amount: sellTotalAmount };
  }

  await sendBundleUtil(bundledTxns);
  return { success: true, amount: sellTotalAmount };
}

async function getSellBalance(keypair: Keypair, mint: PublicKey, supplyPercent: number) {
  let amount;
  try {
    const tokenAccountPubKey = spl.getAssociatedTokenAddressSync(mint, keypair.publicKey);
    const balance = await connection.getTokenAccountBalance(tokenAccountPubKey);
    amount = Math.floor(Number(balance.value.amount) * supplyPercent);
  } catch (e) {
    amount = 0;
  }
  return amount;
}

// Wrapper for createLUT with parameters
export async function createLUTWithParams(jitoTip: number = 0.01) {
  const { createLUT } = await import("./createLUT");
  return createLUT(jitoTip);
}

// Wrapper for extendLUT with parameters
export async function extendLUTWithParams(jitoTip: number = 0.01) {
  const { extendLUT } = await import("./createLUT");
  return extendLUT(jitoTip);
}

// Wrapper for sellXPercentageRAY with parameters
export async function sellRaydiumWithParams(percentage: number, marketId: string, jitoTip: number = 0.01) {
  const bundledTxns = [];
  const keypairs = loadKeypairs();
  
  let poolInfo: { [key: string]: any } = {};
  if (fs.existsSync(keyInfoPath)) {
    const data = fs.readFileSync(keyInfoPath, "utf-8");
    poolInfo = JSON.parse(data);
  }
  
  if (!poolInfo.addressLUT || !poolInfo.mint) {
    throw new Error("LUT and mint must be set before selling");
  }
  
  const lut = new PublicKey(poolInfo.addressLUT.toString());
  const lookupTableAccount = (await connection.getAddressLookupTable(lut)).value;
  
  if (lookupTableAccount == null) {
    throw new Error("Lookup table account not found!");
  }
  
  const mintKp = Keypair.fromSecretKey(Uint8Array.from(bs58.decode(poolInfo.mintPk)));
  const marketID = new PublicKey(marketId);
  const supplyPercent = percentage / 100;
  const jitoTipAmt = jitoTip * LAMPORTS_PER_SOL;
  
  if (supplyPercent > 0.25) {
    throw new Error("Cannot sell more than 25% at a time");
  }
  
  const { derivePoolKeys } = await import("./clients/poolKeysReassigned");
  const keys = await derivePoolKeys(marketID);
  
  if (keys == null) {
    throw new Error("Pool keys not found!");
  }
  
  const mintInfo = await connection.getTokenSupply(mintKp.publicKey);
  let sellTotalAmount = 0;
  
  const chunkedKeypairs = [];
  for (let i = 0; i < keypairs.length; i += 6) {
    chunkedKeypairs.push(keypairs.slice(i, i + 6));
  }
  
  const PayerTokenATA = await spl.getAssociatedTokenAddress(new PublicKey(poolInfo.mint), payer.publicKey);
  const { blockhash } = await connection.getLatestBlockhash();
  
  for (let chunkIndex = 0; chunkIndex < chunkedKeypairs.length; chunkIndex++) {
    const chunk = chunkedKeypairs[chunkIndex];
    const instructionsForChunk = [];
    const isFirstChunk = chunkIndex === 0;
    
    if (isFirstChunk) {
      const transferAmount = await getSellBalance(wallet, new PublicKey(poolInfo.mint), supplyPercent);
      sellTotalAmount += transferAmount;
      
      const ataIx = spl.createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, PayerTokenATA, payer.publicKey, new PublicKey(poolInfo.mint));
      const TokenATA = await spl.getAssociatedTokenAddress(new PublicKey(poolInfo.mint), wallet.publicKey);
      const transferIx = spl.createTransferInstruction(TokenATA, PayerTokenATA, wallet.publicKey, transferAmount);
      instructionsForChunk.push(ataIx, transferIx);
    }
    
    for (let keypair of chunk) {
      const transferAmount = await getSellBalance(keypair, new PublicKey(poolInfo.mint), supplyPercent);
      sellTotalAmount += transferAmount;
      const TokenATA = await spl.getAssociatedTokenAddress(new PublicKey(poolInfo.mint), keypair.publicKey);
      const transferIx = spl.createTransferInstruction(TokenATA, PayerTokenATA, keypair.publicKey, transferAmount);
      instructionsForChunk.push(transferIx);
    }
    
    if (instructionsForChunk.length > 0) {
      const message = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: blockhash,
        instructions: instructionsForChunk,
      }).compileToV0Message([lookupTableAccount]);
      
      const versionedTx = new VersionedTransaction(message);
      versionedTx.sign([payer]);
      if (isFirstChunk) {
        versionedTx.sign([wallet]);
      }
      bundledTxns.push(versionedTx);
    }
  }
  
  if (+mintInfo.value.amount * 0.25 <= sellTotalAmount) {
    throw new Error("Cannot sell more than 25% of supply at a time");
  }
  
  const payerNum = Math.floor(Math.random() * keypairs.length);
  const payerKey = keypairs[payerNum];
  
  const PayerwSolATA = await spl.getAssociatedTokenAddress(spl.NATIVE_MINT, payer.publicKey);
  const { sellIxs } = makeSwapForSell(keys, PayerwSolATA, PayerTokenATA, true, payer, sellTotalAmount);
  
  const { RayLiqPoolv4 } = await import("../config");
  
  const sellPayerIxs = [
    spl.createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, PayerwSolATA, payer.publicKey, spl.NATIVE_MINT),
    ...sellIxs,
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: getRandomTipAccount(),
      lamports: BigInt(jitoTipAmt),
    })
  ];
  
  const sellMessage = new TransactionMessage({
    payerKey: payerKey.publicKey,
    recentBlockhash: blockhash,
    instructions: sellPayerIxs,
  }).compileToV0Message([lookupTableAccount]);
  
  const sellTx = new VersionedTransaction(sellMessage);
  sellTx.sign([payer, payerKey]);
  bundledTxns.push(sellTx);
  
  await sendBundleUtil(bundledTxns);
  return { success: true, amount: sellTotalAmount };
}

function makeSwapForSell(poolKeys: any, wSolATA: PublicKey, TokenATA: PublicKey, reverse: boolean, keypair: Keypair, amountIn: number | bigint, minAmountOut = 0) {
  const { RayLiqPoolv4 } = require("../config");
  const account1 = spl.TOKEN_PROGRAM_ID;
  const account2 = poolKeys.id;
  const account3 = poolKeys.authority;
  const account4 = poolKeys.openOrders;
  const account5 = poolKeys.targetOrders;
  const account6 = poolKeys.baseVault;
  const account7 = poolKeys.quoteVault;
  const account8 = poolKeys.marketProgramId;
  const account9 = poolKeys.marketId;
  const account10 = poolKeys.marketBids;
  const account11 = poolKeys.marketAsks;
  const account12 = poolKeys.marketEventQueue;
  const account13 = poolKeys.marketBaseVault;
  const account14 = poolKeys.marketQuoteVault;
  let account16 = wSolATA;
  let account17 = TokenATA;
  const account18 = keypair.publicKey;
  
  if (reverse === true) {
    account16 = TokenATA;
    account17 = wSolATA;
  }
  
  const args = {
    amountIn: new BN(amountIn.toString()),
    minimumAmountOut: new BN(minAmountOut),
  };
  
  const buffer = Buffer.alloc(16);
  args.amountIn.toArrayLike(Buffer, "le", 8).copy(buffer, 0);
  args.minimumAmountOut.toArrayLike(Buffer, "le", 8).copy(buffer, 8);
  const prefix = Buffer.from([0x09]);
  const instructionData = Buffer.concat([prefix, buffer]);
  const accountMetas = [
    { pubkey: account1, isSigner: false, isWritable: false },
    { pubkey: account2, isSigner: false, isWritable: true },
    { pubkey: account3, isSigner: false, isWritable: false },
    { pubkey: account4, isSigner: false, isWritable: true },
    { pubkey: account5, isSigner: false, isWritable: true },
    { pubkey: account6, isSigner: false, isWritable: true },
    { pubkey: account7, isSigner: false, isWritable: true },
    { pubkey: account8, isSigner: false, isWritable: false },
    { pubkey: account9, isSigner: false, isWritable: true },
    { pubkey: account10, isSigner: false, isWritable: true },
    { pubkey: account11, isSigner: false, isWritable: true },
    { pubkey: account12, isSigner: false, isWritable: true },
    { pubkey: account13, isSigner: false, isWritable: true },
    { pubkey: account14, isSigner: false, isWritable: true },
    { pubkey: account16, isSigner: false, isWritable: true },
    { pubkey: account17, isSigner: false, isWritable: true },
    { pubkey: account18, isSigner: true, isWritable: true },
  ];
  
  const swap = new TransactionInstruction({
    keys: accountMetas,
    programId: RayLiqPoolv4,
    data: instructionData,
  });
  
  let sellIxs: TransactionInstruction[] = [];
  if (reverse === true) {
    sellIxs.push(swap);
  }
  
  return { buyIxs: [], sellIxs };
}

// Wrapper for generateATAandSOL with parameters
export async function fundWalletsWithParams(jitoTip: number = 0.01) {
  try {
    if (jitoTip < 0 || isNaN(jitoTip)) {
      throw new Error(`Invalid jitoTip parameter: ${jitoTip}. Must be a non-negative number.`);
    }

    const { generateATAandSOL } = await import("./senderUI");
    return await generateATAandSOL(jitoTip);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[fundWalletsWithParams] Error:`, errorMsg);
    throw error; // Re-throw to allow API endpoint to handle
  }
}

// Wrapper for reclaiming SOL from sub-wallets back to payer/main wallet
export async function reclaimWalletsWithParams(jitoTip: number = 0) {
  try {
    if (jitoTip < 0 || isNaN(jitoTip)) {
      throw new Error(`Invalid jitoTip parameter: ${jitoTip}. Must be a non-negative number.`);
    }

    const { reclaimSOLToPayer } = await import("./senderUI");
    return await reclaimSOLToPayer(jitoTip);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[reclaimWalletsWithParams] Error:`, errorMsg);
    throw error;
  }
}