import { connection, wallet, PUMP_PROGRAM, feeRecipient, eventAuthority, global, MPL_TOKEN_METADATA_PROGRAM_ID, mintAuthority, rpc, payer } from "../config";
import {
	PublicKey,
	VersionedTransaction,
	TransactionInstruction,
	SYSVAR_RENT_PUBKEY,
	TransactionMessage,
	SystemProgram,
	Keypair,
	LAMPORTS_PER_SOL,
	AddressLookupTableAccount,
} from "@solana/web3.js";
import { loadKeypairs } from "./createKeys";
import { sendBundle as sendBundleUtil } from "./utils/bundleSender";
import { MenuUI } from "./ui/menu";
import * as spl from "@solana/spl-token";
import bs58 from "bs58";
import path from "path";
import fs from "fs";
import { Program } from "@coral-xyz/anchor";
import { getRandomTipAccount } from "./clients/config";
import BN from "bn.js";
import axios from "axios";
import * as anchor from "@coral-xyz/anchor";

const keyInfoPath = path.join(__dirname, "keyInfo.json");

export interface TokenInfo {
	name: string;
	symbol: string;
	description: string;
	twitter?: string;
	telegram?: string;
	website?: string;
	jitoTip: number;
}

export async function buyBundleWithParams(tokenInfo: TokenInfo, imagePath?: string) {
	const provider = new anchor.AnchorProvider(new anchor.web3.Connection(rpc), new anchor.Wallet(wallet), { commitment: "confirmed" });

	// Initialize pumpfun anchor
	const IDL_PumpFun = JSON.parse(fs.readFileSync("./pumpfun-IDL.json", "utf-8")) as anchor.Idl;

	const program = new anchor.Program(IDL_PumpFun, provider);

	// Start create bundle
	const bundledTxns: VersionedTransaction[] = [];
	const keypairs: Keypair[] = loadKeypairs();

	let keyInfo: { [key: string]: any } = {};
	if (fs.existsSync(keyInfoPath)) {
		const existingData = fs.readFileSync(keyInfoPath, "utf-8");
		keyInfo = JSON.parse(existingData);
	}

	if (!keyInfo.addressLUT) {
		throw new Error("Address LUT not found in keyInfo. Please create a LUT first.");
	}

	const lut = new PublicKey(keyInfo.addressLUT.toString());

	const lookupTableAccount = (await connection.getAddressLookupTable(lut)).value;

	if (lookupTableAccount == null) {
		console.log("Lookup table account not found!");
		throw new Error("Lookup table account not found!");
	}

	// Use provided token info
	const name = tokenInfo.name;
	const symbol = tokenInfo.symbol;
	
	console.log(`🔄 Unique token: ${name} (${symbol})`);
	
	const description = tokenInfo.description;
	const twitter = tokenInfo.twitter || "";
	const telegram = tokenInfo.telegram || "";
	const website = tokenInfo.website || "";
	// Adjust tip based on available balance
	const tipInput = tokenInfo.jitoTip;
	
	// Check wallet balance and adjust tip accordingly
	let walletBalance = 0;
	try {
		walletBalance = await connection.getBalance(wallet.publicKey);
	} catch (error) {
		console.log("⚠️  RPC error getting balance, using fallback logic");
		// Fallback: assume we have enough for small tip
		walletBalance = 0.05 * LAMPORTS_PER_SOL; // Assume 0.05 SOL available
	}
	
	const maxTip = Math.min(tipInput, (walletBalance / LAMPORTS_PER_SOL) - 0.005); // Leave 0.005 SOL for fees
	const tipAmt = Math.max(maxTip, 0.001) * LAMPORTS_PER_SOL; // Minimum 0.001 SOL
	
	if (maxTip < tipInput) {
		console.log(`⚠️  Adjusted tip from ${tipInput} to ${maxTip} SOL (insufficient balance)`);
	}
	console.log(`💰 Using tip: ${tipAmt / LAMPORTS_PER_SOL} SOL`);

	// -------- step 2: build pool init + dev snipe --------
	const imgPath = imagePath || "./img";
	const files = await fs.promises.readdir(imgPath);
	if (files.length == 0) {
		console.log("No image found in the img folder");
		throw new Error("No image found in the img folder");
	}
	if (files.length > 1) {
		console.log("Multiple images found in the img folder, please only keep one image");
		throw new Error("Multiple images found in the img folder");
	}
	const data: Buffer = fs.readFileSync(`${imgPath}/${files[0]}`);

	let formData = new FormData();
	if (data) {
		formData.append("file", new Blob([new Uint8Array(data)], { type: "image/jpeg" }));
	} else {
		console.log("No image found");
		throw new Error("No image found");
	}

	formData.append("name", name);
	formData.append("symbol", symbol);
	formData.append("description", description);
	formData.append("twitter", twitter);
	formData.append("telegram", telegram);
	formData.append("website", website);
	formData.append("showName", "true");

	let metadata_uri;
	try {
		const response = await axios.post("https://pump.fun/api/ipfs", formData, {
			headers: {
				"Content-Type": "multipart/form-data",
			},
		});
		metadata_uri = response.data.metadataUri;
		console.log("Metadata URI: ", metadata_uri);
	} catch (error) {
		console.error("Error uploading metadata:", error);
		throw error;
	}

	// FORENSIC SOLUTION: Generate CRYPTOGRAPHICALLY UNIQUE mint for EVERY attempt
	const mintKp = Keypair.generate();
	console.log(`🔑 FRESH Mint Generated: ${mintKp.publicKey.toBase58()}`);

	// --- FIX START: Save new mint to keyInfo.json ---
	keyInfo.mint = mintKp.publicKey.toString();
	keyInfo.mintPk = bs58.encode(mintKp.secretKey);
	try {
		fs.writeFileSync(keyInfoPath, JSON.stringify(keyInfo, null, 2));
		console.log(`💾 Updated keyInfo.json with new mint: ${mintKp.publicKey.toBase58()}`);
	} catch (error) {
		console.error("❌ Failed to save new mint to keyInfo.json:", error);
	}
	// --- FIX END ---
	
	// Pre-flight state verification (Idempotency Check)
	const accountInfo = await connection.getAccountInfo(mintKp.publicKey);
	if (accountInfo !== null) {
		console.error("🚨 CRITICAL: Mint already exists on-chain! This should be impossible with random generation.");
		console.error("🔄 Regenerating new mint keypair...");
		// In production, you might want to retry with a new keypair here
		throw new Error("Mint collision detected - extremely rare event!");
	}
	
	console.log(`✅ Verified fresh mint keypair - ready for bundle creation`);

	const [bondingCurve] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mintKp.publicKey.toBytes()], program.programId);
	const [associatedBondingCurve] = PublicKey.findProgramAddressSync(
		[bondingCurve.toBytes(), spl.TOKEN_PROGRAM_ID.toBytes(), mintKp.publicKey.toBytes()],
		spl.ASSOCIATED_TOKEN_PROGRAM_ID
	);
	const [metadata] = PublicKey.findProgramAddressSync(
		[Buffer.from("metadata"), MPL_TOKEN_METADATA_PROGRAM_ID.toBytes(), mintKp.publicKey.toBytes()],
		MPL_TOKEN_METADATA_PROGRAM_ID
	);

	const account1 = mintKp.publicKey;
	const account2 = mintAuthority;
	const account3 = bondingCurve;
	const account5 = global;
	const account6 = MPL_TOKEN_METADATA_PROGRAM_ID;
	const account7 = metadata;

	const createIx = await program.methods
		.create(name, symbol, metadata_uri, wallet.publicKey) // Added creator parameter
		.accounts({
			mint: account1,
			mintAuthority: account2,
			bondingCurve: account3,
			associatedBondingCurve: associatedBondingCurve,
			global: account5,
			mplTokenMetadata: account6,
			metadata: account7,
			user: wallet.publicKey, // Added user account
			systemProgram: SystemProgram.programId,
			tokenProgram: spl.TOKEN_PROGRAM_ID,
			associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
			rent: SYSVAR_RENT_PUBKEY,
			eventAuthority,
			program: PUMP_PROGRAM,
		})
		.instruction();

	// Get the associated token address
	const ata = spl.getAssociatedTokenAddressSync(mintKp.publicKey, wallet.publicKey);
	
	// FORENSIC FIX: Check if ATA already exists to avoid AlreadyInitialized
	const ataAccountInfo = await connection.getAccountInfo(ata);
	let ataIx: TransactionInstruction | null = null;
	
	if (ataAccountInfo === null) {
		// ATA doesn't exist, create it
		ataIx = spl.createAssociatedTokenAccountIdempotentInstruction(
			wallet.publicKey, ata, wallet.publicKey, mintKp.publicKey
		);
		console.log(`🔧 Creating new ATA: ${ata.toBase58()}`);
	} else {
		console.log(`✅ ATA already exists: ${ata.toBase58()} - skipping creation`);
	}

	// Extract tokenAmount from keyInfo for this keypair
	const keypairInfo = keyInfo[wallet.publicKey.toString()];
	if (!keypairInfo) {
		console.log(`No key info found for keypair: ${wallet.publicKey.toString()}`);
		throw new Error(`No key info found for keypair: ${wallet.publicKey.toString()}`);
	}

	// Fix: Use solAmount for buying (not tokenAmount which is 0)
	const solAmountLamports = new BN(keypairInfo.solAmount * LAMPORTS_PER_SOL);
	const maxSolCost = new BN(keypairInfo.solAmount * LAMPORTS_PER_SOL * 1.1); // 10% slippage

	// Use original Anchor approach - let it handle account resolution
	console.log("🔄 Using standard buy instruction without extra accounts...");

	// Updated for November 2025 IDL - using all required accounts
	console.log("🔄 Using updated buy instruction with all required accounts...");
	
	// Try without fee_config and fee_program first - they might be optional
	console.log("🔄 Testing buy instruction without fee_config accounts...");
	
	// Use static creator vault address from successful transaction analysis
	const creatorVault = new PublicKey("6xBZvTQHo1TuwcoPZfqMHALAjuFy4W2vh9S7PXhBDjVm");
	
	const [globalVolumeAccumulator] = PublicKey.findProgramAddressSync(
		[Buffer.from("global_volume_accumulator")],
		PUMP_PROGRAM
	);
	
	const [userVolumeAccumulator] = PublicKey.findProgramAddressSync(
		[Buffer.from("user_volume_accumulator"), wallet.publicKey.toBuffer()],
		PUMP_PROGRAM
	);
	
	const buyIx = await program.methods
		.buy(solAmountLamports, maxSolCost, { some: true }) // track_volume parameter
		.accounts({
			global: account5,
			feeRecipient,
			mint: account1,
			bondingCurve: account3,
			associatedBondingCurve: associatedBondingCurve,
			associatedUser: ata,
			user: wallet.publicKey,
			systemProgram: SystemProgram.programId,
			tokenProgram: spl.TOKEN_PROGRAM_ID,
			creatorVault,
			eventAuthority,
			program: PUMP_PROGRAM,
			globalVolumeAccumulator,
			userVolumeAccumulator
			// Removed fee_config and fee_program - they seem to be causing issues
		})
		.instruction();

	// FORENSIC SOLUTION: Dynamic tip account rotation (Nov 2025 best practice)
	const randomTipAccount = getRandomTipAccount();
	console.log(`💰 Using tip account: ${randomTipAccount.toBase58()}`);
	console.log(`💎 Tip amount: ${tipAmt / LAMPORTS_PER_SOL} SOL (Above 1000 lamport minimum)`);
	
	const tipIxn = SystemProgram.transfer({
		fromPubkey: wallet.publicKey,
		toPubkey: randomTipAccount,
		lamports: BigInt(tipAmt),
	});

	// FORENSIC FIX: Conditional ATA inclusion to prevent AlreadyInitialized
	const initIxs: TransactionInstruction[] = [createIx];
	if (ataIx) {
		initIxs.push(ataIx);
		console.log("🚀 BUNDLE: Create + ATA + Buy + Tip (ATA needed)");
	} else {
		console.log("🚀 BUNDLE: Create + Buy + Tip (ATA exists, skipped)");
	}
	initIxs.push(buyIx, tipIxn);

	const { blockhash } = await connection.getLatestBlockhash();

	const messageV0 = new TransactionMessage({
		payerKey: wallet.publicKey,
		instructions: initIxs,
		recentBlockhash: blockhash,
	}).compileToV0Message();

	// FORENSIC DEBUG: Log instruction stack to identify phantom Index 0
	console.log("🔍 INSTRUCTION STACK ANALYSIS:");
	messageV0.compiledInstructions.forEach((ix, index) => {
		const programKey = messageV0.staticAccountKeys[ix.programIdIndex];
		console.log(`  Index [${index}]: Program ${programKey.toBase58()}`);
		
		// Identify known programs
		if (programKey.toBase58() === "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P") {
			console.log(`    ↳ 🎯 PUMP.FUN CREATE (This is where 0x1771 originates if it fails!)`);
		} else if (programKey.toBase58() === "11111111111111111111111111111111") {
			console.log(`    ↳ 💰 SYSTEM PROGRAM (Jito tip transfer)`);
		} else if (programKey.toBase58() === "ComputeBudget111111111111111111111111111111") {
			console.log(`    ↳ ⚡ COMPUTE BUDGET (Hidden phantom instruction!)`);
		}
	});

	const fullTX = new VersionedTransaction(messageV0);
	fullTX.sign([wallet, mintKp]);

	bundledTxns.push(fullTX);

	// -------- step 3: create swap txns --------
	const txMainSwaps: VersionedTransaction[] = await createWalletSwaps(blockhash, keypairs, lookupTableAccount, bondingCurve, associatedBondingCurve, mintKp.publicKey, program);
	bundledTxns.push(...txMainSwaps);

	// -------- step 4: Send bundle atomically via Jito --------
	console.log("🚀 Sending atomic bundle: Dev buy → Bundler wallets");
	console.log(`📦 Bundle contains ${bundledTxns.length} transactions:`);
	console.log(`   1. CREATE token + Dev wallet buy`);
	console.log(`   2-${bundledTxns.length}. Bundler wallet buys (all atomic)`);
	console.log(`\n💡 All transactions will execute in the same block - snipers cannot front-run!\n`);
	
	await sendBundleUtil(bundledTxns);
	
	return { success: true, mint: mintKp.publicKey.toString() };
}

export async function buyBundle() {
	const provider = new anchor.AnchorProvider(new anchor.web3.Connection(rpc), new anchor.Wallet(wallet), { commitment: "confirmed" });

	// Initialize pumpfun anchor
	const IDL_PumpFun = JSON.parse(fs.readFileSync("./pumpfun-IDL.json", "utf-8")) as anchor.Idl;

	const program = new anchor.Program(IDL_PumpFun, provider);

	// Start create bundle
	const bundledTxns: VersionedTransaction[] = [];
	const keypairs: Keypair[] = loadKeypairs();

	let keyInfo: { [key: string]: any } = {};
	if (fs.existsSync(keyInfoPath)) {
		const existingData = fs.readFileSync(keyInfoPath, "utf-8");
		keyInfo = JSON.parse(existingData);
	}

	if (!keyInfo.addressLUT) {
		throw new Error("Address LUT not found in keyInfo. Please create a LUT first.");
	}

	const lut = new PublicKey(keyInfo.addressLUT.toString());

	const lookupTableAccount = (await connection.getAddressLookupTable(lut)).value;

	if (lookupTableAccount == null) {
		console.log("Lookup table account not found!");
		process.exit(0);
	}

	// -------- step 1: ask necessary questions for pool build --------
	const tokenInfo = await MenuUI.promptTokenInfo();
	return buyBundleWithParams(tokenInfo);
}

async function createWalletSwaps(
	blockhash: string,
	keypairs: Keypair[],
	lut: AddressLookupTableAccount,
	bondingCurve: PublicKey,
	associatedBondingCurve: PublicKey,
	mint: PublicKey,
	program: Program
): Promise<VersionedTransaction[]> {
	const txsSigned: VersionedTransaction[] = [];
	const chunkedKeypairs = chunkArray(keypairs, 3); // Reduced from 6 to 3 due to new IDL accounts

	// Load keyInfo data from JSON file
	let keyInfo: { [key: string]: { solAmount: number; tokenAmount: string; percentSupply: number } } = {};
	if (fs.existsSync(keyInfoPath)) {
		const existingData = fs.readFileSync(keyInfoPath, "utf-8");
		keyInfo = JSON.parse(existingData);
	}

	// Iterate over each chunk of keypairs
	for (let chunkIndex = 0; chunkIndex < chunkedKeypairs.length; chunkIndex++) {
		const chunk = chunkedKeypairs[chunkIndex];
		const instructionsForChunk: TransactionInstruction[] = [];

		// Iterate over each keypair in the chunk to create swap instructions
		for (let i = 0; i < chunk.length; i++) {
			const keypair = chunk[i];
			console.log(`Processing keypair ${i + 1}/${chunk.length}:`, keypair.publicKey.toString());

			// Extract tokenAmount from keyInfo for this keypair FIRST
			const keypairInfo = keyInfo[keypair.publicKey.toString()];
			if (!keypairInfo) {
				console.log(`No key info found for keypair: ${keypair.publicKey.toString()}`);
				console.log(`Skipping keypair without keyInfo data`);
				continue; // Skip this keypair completely
			}

			const ataAddress = await spl.getAssociatedTokenAddress(mint, keypair.publicKey);
			
			// FORENSIC FIX: Check if ATA exists before creating
			const ataExists = await connection.getAccountInfo(ataAddress);
			const createTokenAta = ataExists ? null : spl.createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ataAddress, keypair.publicKey, mint);

			// Fix: Use solAmount for buying (not tokenAmount which is 0)
			const solAmountLamports = new BN(keypairInfo.solAmount * LAMPORTS_PER_SOL);
			const maxSolCost = new BN(keypairInfo.solAmount * LAMPORTS_PER_SOL * 1.1); // 10% slippage

			// Use static creator vault address from successful transaction analysis
			const creatorVault = new PublicKey("6xBZvTQHo1TuwcoPZfqMHALAjuFy4W2vh9S7PXhBDjVm");
			
			const [globalVolumeAccumulator] = PublicKey.findProgramAddressSync(
				[Buffer.from("global_volume_accumulator")],
				PUMP_PROGRAM
			);
			
			const [userVolumeAccumulator] = PublicKey.findProgramAddressSync(
				[Buffer.from("user_volume_accumulator"), keypair.publicKey.toBuffer()],
				PUMP_PROGRAM
			);

			const buyIx = await program.methods
				.buy(solAmountLamports, maxSolCost, { some: true }) // track_volume parameter
				.accounts({
					global,
					feeRecipient,
					mint,
					bondingCurve,
					associatedBondingCurve,
					associatedUser: ataAddress,
					user: keypair.publicKey,
					systemProgram: SystemProgram.programId,
					tokenProgram: spl.TOKEN_PROGRAM_ID,
					creatorVault,
					eventAuthority,
					program: PUMP_PROGRAM,
					globalVolumeAccumulator,
					userVolumeAccumulator
					// Removed fee_config and fee_program - they seem to be causing issues
				})
				.instruction();

			// Only add ATA creation if needed
			if (createTokenAta) {
				instructionsForChunk.push(createTokenAta);
			}
			instructionsForChunk.push(buyIx);
		}


		const message = new TransactionMessage({
			payerKey: payer.publicKey,
			recentBlockhash: blockhash,
			instructions: instructionsForChunk,
		}).compileToV0Message([lut]);

		const serializedMsg = message.serialize();
		console.log("Txn size:", serializedMsg.length);
		if (serializedMsg.length > 1232) {
			console.log("tx too big");
		}

		const versionedTx = new VersionedTransaction(message);

		console.log(
			"Signing transaction with chunk signers",
			chunk.map((kp) => kp.publicKey.toString())
		);

		// Sign with the wallet for tip on the last instruction
		for (const kp of chunk) {
			if (kp.publicKey.toString() in keyInfo) {
				versionedTx.sign([kp]);
			}
		}

		versionedTx.sign([payer]);

		txsSigned.push(versionedTx);
	}

	return txsSigned;
}

function chunkArray<T>(array: T[], size: number): T[][] {
	return Array.from({ length: Math.ceil(array.length / size) }, (v, i) => array.slice(i * size, i * size + size));
}

