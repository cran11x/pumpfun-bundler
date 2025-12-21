// API Wrapper functions that accept parameters instead of prompting
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as fs from "fs";
import path from "path";
import * as anchor from "@coral-xyz/anchor";
import axios from "axios";
import { connection, wallet, payer, rpc } from "../config";
import { loadKeypairs } from "./createKeys";
import { sendBundle as sendBundleUtil } from "./utils/bundleSender";
import * as spl from "@solana/spl-token";
import bs58 from "bs58";
import { getRandomTipAccount } from "./clients/config";
import BN from "bn.js";
import { PUMP_PROGRAM, global, feeRecipient, eventAuthority, MPL_TOKEN_METADATA_PROGRAM_ID, mintAuthority } from "../config";
import { SystemProgram, VersionedTransaction, TransactionMessage, TransactionInstruction, PublicKey, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";

const keyInfoPath = path.join(__dirname, "keyInfo.json");

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
  }, params.imagePath);
}

// Wrapper for sellXPercentagePF with parameters
export async function sellPumpFunWithParams(percentage: number, jitoTip: number = 0.01) {
  const provider = new anchor.AnchorProvider(new anchor.web3.Connection(rpc), new anchor.Wallet(wallet), { commitment: "confirmed" });
  const IDL_PumpFun = JSON.parse(fs.readFileSync("./pumpfun-IDL.json", "utf-8")) as anchor.Idl;
  const pfprogram = new anchor.Program(IDL_PumpFun, provider);
  
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
  const [bondingCurve] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mintKp.publicKey.toBytes()], pfprogram.programId);
  
  const supplyPercent = percentage / 100;
  const jitoTipAmt = jitoTip * LAMPORTS_PER_SOL;
  
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
      for (let keypair of chunk) {
        versionedTx.sign([keypair]);
      }
      bundledTxns.push(versionedTx);
    }
  }
  
  if (+mintInfo.value.amount * 0.25 <= sellTotalAmount) {
    throw new Error("Cannot sell more than 25% of supply at a time");
  }
  
  const payerNum = Math.floor(Math.random() * keypairs.length);
  const payerKey = keypairs[payerNum];
  
  const sellIx = await pfprogram.methods
    .sell(new BN(sellTotalAmount), new BN(0))
    .accounts({
      global,
      feeRecipient,
      mint: new PublicKey(poolInfo.mint),
      bondingCurve,
      user: payer.publicKey,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      program: PUMP_PROGRAM,
    })
    .instruction();
  
  const sellPayerIxs = [
    sellIx,
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
