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

// Fee program constant from IDL
const FEE_PROGRAM = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");
// Fee config seed bytes from IDL
const FEE_CONFIG_SEED_BYTES = Buffer.from([1, 86, 224, 246, 147, 102, 90, 207, 68, 219, 21, 104, 191, 23, 91, 170, 81, 137, 203, 151, 245, 210, 255, 59, 101, 93, 43, 182, 253, 109, 24, 176]);
import { loadKeypairs } from "./createKeys";
import { sendBundle as sendBundleUtil, simulateBundle } from "./utils/bundleSender";
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
	tiktok?: string;
	youtube?: string;
	jitoTip: number;
	metadataUri?: string;
}

export async function buyBundleWithParams(
	tokenInfo: TokenInfo,
	imagePath?: string,
	options?: { dryRun?: boolean }
) {
	const provider = new anchor.AnchorProvider(new anchor.web3.Connection(rpc), new anchor.Wallet(wallet), { commitment: "confirmed" });

	// Initialize pumpfun anchor
	const IDL_PumpFun = JSON.parse(fs.readFileSync("./pumpfun-IDL.json", "utf-8")) as anchor.Idl;

	const program = new anchor.Program(IDL_PumpFun, provider);

	// Start create bundle
	const bundledTxns: VersionedTransaction[] = [];
	const loadedKeypairs: Keypair[] = loadKeypairs();

	// IMPORTANT: ensure bundler wallets are distinct and not the dev wallet.
	// If keypair files accidentally contain the same secret key as the dev wallet,
	// the dev wallet will "buy multiple times" (dev buy + bundler buys) and look like duplicates.
	const devPkStr = wallet.publicKey.toBase58();
	console.log(`🔑 Dev wallet public key: ${devPkStr}`);
	console.log(`📦 Loaded ${loadedKeypairs.length} bundler keypair(s) from keypairs directory`);
	const seenBundlerPks = new Set<string>();
	const keypairs: Keypair[] = [];
	for (const kp of loadedKeypairs) {
		const pkStr = kp.publicKey.toBase58();
		if (pkStr === devPkStr) {
			console.warn(`⚠️  Bundler keypair matches dev wallet (${pkStr}). Skipping to avoid duplicate dev buys.`);
			continue;
		}
		if (seenBundlerPks.has(pkStr)) {
			console.warn(`⚠️  Duplicate bundler keypair detected (${pkStr}). Skipping duplicate.`);
			continue;
		}
		seenBundlerPks.add(pkStr);
		keypairs.push(kp);
	}
	if (keypairs.length !== loadedKeypairs.length) {
		console.log(`ℹ️  Bundler wallets loaded: ${loadedKeypairs.length}, using: ${keypairs.length} (after dedupe/excluding dev).`);
	} else {
		console.log(`✅ Using all ${keypairs.length} bundler wallet(s)`);
	}

	// Jito bundle hard limit: max 5 transactions per bundle.
	// Our design is 1 tx for (create + dev buy) + 1 tx per bundler wallet (for correct attribution on explorers).
	// Therefore max bundler wallets in an atomic bundle = 4.
	const maxBundleTxs = Number(process.env.JITO_MAX_BUNDLE_TXS ?? "5");
	const maxBundlerWallets = Math.max(0, maxBundleTxs - 1);
	if (keypairs.length > maxBundlerWallets) {
		console.warn(
			`⚠️  Jito bundle limit hit: would create ${1 + keypairs.length} txs (dev+create + ${keypairs.length} bundler buys), but max is ${maxBundleTxs}. ` +
				`Capping bundler wallets from ${keypairs.length} → ${maxBundlerWallets} to keep the launch atomic. ` +
				`(Set env JITO_MAX_BUNDLE_TXS to adjust; hard limit is 5 on mainnet.)`
		);
		keypairs.splice(maxBundlerWallets);
	}

	console.log(
		`💼 Final buy breakdown: 1 dev wallet (${devPkStr.substring(0, 8)}...) + ${keypairs.length} bundler wallet(s) = ${1 + keypairs.length} total buys`
	);

	let keyInfo: { [key: string]: any } = {};
	if (fs.existsSync(keyInfoPath)) {
		const existingData = fs.readFileSync(keyInfoPath, "utf-8");
		keyInfo = JSON.parse(existingData);
	}

	if (!keyInfo.addressLUT) {
		throw new Error("Address LUT not found in keyInfo. Please create a LUT first.");
	}

	// Guard against placeholder/default values (common when keyInfo.json is preseeded)
	const lutStr = String(keyInfo.addressLUT).trim();
	if (lutStr === "11111111111111111111111111111111") {
		throw new Error(
			"Invalid LUT address in src/keyInfo.json (addressLUT is set to the System Program placeholder).\n" +
				"Create a Lookup Table (LUT) first (Website: Settings → LUT → Create, or POST /api/lut/create)."
		);
	}

	const lut = new PublicKey(lutStr);

	const lookupTableAccount = (await connection.getAddressLookupTable(lut)).value;

	if (lookupTableAccount == null) {
		console.log("Lookup table account not found! Trying to recreate...");
        // Instead of crashing, let's suggest the user to recreate the LUT or handle it
		throw new Error(`Lookup table account (${lut.toBase58()}) not found on-chain. Please create a new LUT in Settings.`);
	}

	// Use provided token info
	const name = tokenInfo.name;
	const symbol = tokenInfo.symbol;
	
	console.log(`🔄 Unique token: ${name} (${symbol})`);
	
	const description = tokenInfo.description;
	const twitter = tokenInfo.twitter || "";
	const telegram = tokenInfo.telegram || "";
	const website = tokenInfo.website || "";
	const tiktok = tokenInfo.tiktok || "";
	const youtube = tokenInfo.youtube || "";
	// Tip requested by user (SOL). We'll compute the actual tip later,
	// after we know how much SOL we need for create + dev buy + rent/fees buffer.
	const tipInputSol = tokenInfo.jitoTip;
	
	// Check wallet balance and adjust tip accordingly
	let walletBalanceLamports = 0;
	try {
		walletBalanceLamports = await connection.getBalance(wallet.publicKey);
	} catch (error) {
		console.log("⚠️  RPC error getting balance, using fallback logic");
		// Fallback: assume we have enough for small tip
		walletBalanceLamports = 0.05 * LAMPORTS_PER_SOL; // Assume 0.05 SOL available
	}

	// -------- step 2: build pool init + dev snipe --------
	let metadata_uri = tokenInfo.metadataUri?.trim();
	if (!metadata_uri) {
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

		const formData = new FormData();
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
		formData.append("tiktok", tiktok);
		formData.append("youtube", youtube);
		formData.append("showName", "true");

		try {
			console.log("Uploading metadata to IPFS...");
			const response = await axios.post("https://pump.fun/api/ipfs", formData, {
				headers: {
					"Content-Type": "multipart/form-data",
				},
			});
			metadata_uri = response.data.metadataUri;
			console.log("Metadata URI: ", metadata_uri);
		} catch (error: any) {
			console.error("Error uploading metadata to Pump.Fun IPFS:", error.message);
			if (error.response) {
				console.error("Response status:", error.response.status);
				console.error("Response data:", error.response.data);
			}
			throw new Error(`Metadata upload failed: ${error.message}`);
		}
	} else {
		console.log("Using pre-uploaded metadata URI.");
	}

	// Use pre-generated mint if present, otherwise generate a fresh one
	let mintKp: Keypair;
	if (keyInfo.mintPk) {
		try {
			mintKp = Keypair.fromSecretKey(bs58.decode(String(keyInfo.mintPk)));
			if (!keyInfo.mint || keyInfo.mint !== mintKp.publicKey.toString()) {
				keyInfo.mint = mintKp.publicKey.toString();
				fs.writeFileSync(keyInfoPath, JSON.stringify(keyInfo, null, 2));
			}
			console.log(`🔑 Using pre-generated mint: ${mintKp.publicKey.toBase58()}`);
		} catch (error) {
			throw new Error("Invalid mintPk in keyInfo.json. Please regenerate mint.");
		}
	} else {
		mintKp = Keypair.generate();
		console.log(`🔑 FRESH Mint Generated: ${mintKp.publicKey.toBase58()}`);

		// Save new mint to keyInfo.json
		keyInfo.mint = mintKp.publicKey.toString();
		keyInfo.mintPk = bs58.encode(mintKp.secretKey);
		try {
			fs.writeFileSync(keyInfoPath, JSON.stringify(keyInfo, null, 2));
			console.log(`💾 Updated keyInfo.json with new mint: ${mintKp.publicKey.toBase58()}`);
		} catch (error) {
			console.error("❌ Failed to save new mint to keyInfo.json:", error);
		}
	}
	
	// Pre-flight state verification (Idempotency Check)
	const accountInfo = await connection.getAccountInfo(mintKp.publicKey);
	if (accountInfo !== null) {
		throw new Error(
			"Mint already exists on-chain. Generate a new mint first (Settings/Launch -> Generate Mint)."
		);
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
		.create(name, symbol, metadata_uri, wallet.publicKey) // Add creator arg (4th parameter)
		.accounts({
			mint: account1,
			mintAuthority: account2, // camelCase
			bondingCurve: account3, // camelCase
			associatedBondingCurve: associatedBondingCurve, // camelCase
			global: account5,
			mplTokenMetadata: account6, // camelCase
			metadata: account7,
			user: wallet.publicKey,
			systemProgram: SystemProgram.programId, // camelCase
			tokenProgram: spl.TOKEN_PROGRAM_ID, // camelCase
			associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID, // camelCase
			rent: SYSVAR_RENT_PUBKEY,
			eventAuthority: eventAuthority, // camelCase
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

	// keyInfo.json often stores numbers as strings (e.g. "0.01"). Normalize.
	const devSolAmountNum =
		typeof keypairInfo.solAmount === "string"
			? parseFloat(keypairInfo.solAmount)
			: Number(keypairInfo.solAmount);
	if (!Number.isFinite(devSolAmountNum) || devSolAmountNum <= 0) {
		throw new Error(
			`Invalid solAmount for dev wallet (${wallet.publicKey.toString()}): ${keypairInfo.solAmount}`
		);
	}

	// Fix: Use solAmount for buying (not tokenAmount which is 0)
	const spendableSolInLamports = new BN(Math.floor(devSolAmountNum * LAMPORTS_PER_SOL));
	// Pump.fun IDL:
	// - buy(amount, max_sol_cost) => amount is TOKEN amount (base units)
	// - buy_exact_sol_in(spendable_sol_in, min_tokens_out) => spend SOL budget (what we want here)
	const minTokensOut = new BN(1); // minimal slippage protection

	// ---------------- TIP CALC (IMPORTANT) ----------------
	// Old logic only ensured "walletBalance - 0.005 SOL", but did NOT account for:
	// - the dev buy amount (solAmountLamports)
	// - rent / account creation costs during create+ATA
	//
	// When tip is too high, the last instruction (SystemProgram.transfer) fails with a custom error (often 0x1),
	// and Jito rejects the whole bundle with simulationFailure.
	const feeAndRentReserveLamports = Math.floor(0.03 * LAMPORTS_PER_SOL); // conservative buffer
	const requestedTipLamports = Math.floor(tipInputSol * LAMPORTS_PER_SOL);
	const budgetForTipLamports =
		walletBalanceLamports - spendableSolInLamports.toNumber() - feeAndRentReserveLamports;

	const tipAmtLamports = Math.max(
		1000, // Jito minimum tip transfer size is tiny; we just ensure >0 and integer.
		Math.min(requestedTipLamports, budgetForTipLamports)
	);

	if (budgetForTipLamports < requestedTipLamports) {
		console.log(
			`⚠️  Adjusted tip from ${tipInputSol} to ${tipAmtLamports / LAMPORTS_PER_SOL} SOL (budget after buy+reserve)`
		);
	}
	console.log(`💰 Using tip: ${tipAmtLamports / LAMPORTS_PER_SOL} SOL`);
	
	// Derive required PDAs for buy instruction
	const [creatorVault] = PublicKey.findProgramAddressSync(
		[Buffer.from("creator-vault"), wallet.publicKey.toBuffer()],
		PUMP_PROGRAM
	);
	
	const [globalVolumeAccumulator] = PublicKey.findProgramAddressSync(
		[Buffer.from("global_volume_accumulator")],
		PUMP_PROGRAM
	);
	
	const [userVolumeAccumulator] = PublicKey.findProgramAddressSync(
		[Buffer.from("user_volume_accumulator"), wallet.publicKey.toBuffer()],
		PUMP_PROGRAM
	);
	
	const [feeConfig] = PublicKey.findProgramAddressSync(
		[Buffer.from("fee_config"), FEE_CONFIG_SEED_BYTES],
		FEE_PROGRAM
	);
	
	// Build buy instruction with all accounts explicitly provided using camelCase keys
	// Anchor expects camelCase keys for accounts in the .accounts() method
	const buyIx = await program.methods
		.buyExactSolIn(spendableSolInLamports, minTokensOut, { some: true }) // spend SOL budget, receive >= minTokensOut
		.accounts({
			global: account5,
			feeRecipient: feeRecipient, // camelCase
			mint: account1,
			bondingCurve: account3, // camelCase
			associatedBondingCurve: associatedBondingCurve, // camelCase
			associatedUser: ata, // camelCase
			user: wallet.publicKey,
			systemProgram: SystemProgram.programId, // camelCase
			tokenProgram: spl.TOKEN_PROGRAM_ID, // camelCase
			creatorVault: creatorVault, // camelCase
			rent: SYSVAR_RENT_PUBKEY,
			eventAuthority: eventAuthority, // camelCase
			program: PUMP_PROGRAM,
			globalVolumeAccumulator: globalVolumeAccumulator, // camelCase
			userVolumeAccumulator: userVolumeAccumulator, // camelCase
			feeConfig: feeConfig, // camelCase
			feeProgram: FEE_PROGRAM, // camelCase
		})
		.instruction();

	// FORENSIC SOLUTION: Dynamic tip account rotation (Nov 2025 best practice)
	const randomTipAccount = getRandomTipAccount();
	console.log(`💰 Using tip account: ${randomTipAccount.toBase58()}`);
	console.log(`💎 Tip amount: ${tipAmtLamports / LAMPORTS_PER_SOL} SOL (Above 1000 lamport minimum)`);
	
	const tipIxn = SystemProgram.transfer({
		fromPubkey: wallet.publicKey,
		toPubkey: randomTipAccount,
		lamports: BigInt(tipAmtLamports),
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

	// DRY RUN: simulate only, do not send (safe for testing)
	if (options?.dryRun) {
		console.log("🧪 DRY RUN enabled: simulating bundle only (will NOT be sent).");
		const simulationPassed = await simulateBundle(bundledTxns);
		console.log(`🧪 DRY RUN simulation result: ${simulationPassed ? "PASS" : "FAIL"}`);
		return { success: simulationPassed, dryRun: true, simulationPassed, mint: mintKp.publicKey.toString() };
	}

	await sendBundleUtil(bundledTxns);

	// Return tx signatures so the caller can verify on explorers.
	const txSignatures = bundledTxns
		.map((tx) => tx.signatures?.[0])
		.filter((s): s is Uint8Array => !!s && s.length > 0)
		.map((s) => bs58.encode(Buffer.from(s)));

	return { success: true, mint: mintKp.publicKey.toString(), txSignatures };
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

	// Load keyInfo data from JSON file
	let keyInfo: { [key: string]: { solAmount: number; tokenAmount: string; percentSupply: number } } = {};
	if (fs.existsSync(keyInfoPath)) {
		const existingData = fs.readFileSync(keyInfoPath, "utf-8");
		keyInfo = JSON.parse(existingData);
	}

	// IMPORTANT:
	// We intentionally build *one transaction per bundler wallet* with that wallet as the fee payer.
	// Many UIs (Axiom etc) label the "trader" using the tx fee payer; if dev/payer pays fees for
	// all bundler buys, it will look like only the dev wallet bought.
	for (let i = 0; i < keypairs.length; i++) {
		const keypair = keypairs[i];
		console.log(`Processing bundler wallet ${i + 1}/${keypairs.length}:`, keypair.publicKey.toString());

		const keypairInfo = keyInfo[keypair.publicKey.toString()];
		if (!keypairInfo) {
			console.log(`No key info found for keypair: ${keypair.publicKey.toString()} — skipping`);
			continue;
		}

		const solAmountNum =
			typeof (keypairInfo as any).solAmount === "string"
				? parseFloat((keypairInfo as any).solAmount)
				: Number((keypairInfo as any).solAmount);
		if (!Number.isFinite(solAmountNum) || solAmountNum <= 0) {
			console.warn(
				`Skipping keypair with missing/invalid solAmount: ${keypair.publicKey.toString()} (solAmount=${(keypairInfo as any).solAmount})`
			);
			continue;
		}

		const instructions: TransactionInstruction[] = [];

		const ataAddress = await spl.getAssociatedTokenAddress(mint, keypair.publicKey);
		const ataExists = await connection.getAccountInfo(ataAddress);
		const devPaysAtaRent = process.env.BUNDLER_DEV_PAYS_ATA_RENT !== "false";
		if (!ataExists) {
			// IMPORTANT (root cause of dropped bundles):
			// Sub-wallets are often funded with ~solAmount only (e.g. 0.02 SOL) but ATA creation requires ~0.002 SOL rent.
			// If the sub-wallet also tries to spend 0.02 SOL in buyExactSolIn, the tx becomes invalid (insufficient funds),
			// and Jito drops/rejects the entire bundle.
			//
			// Fix: by default, dev wallet pays ATA rent while the sub-wallet remains the tx fee payer + user.
			const ataRentPayer = devPaysAtaRent ? wallet.publicKey : keypair.publicKey;
			instructions.push(
				spl.createAssociatedTokenAccountIdempotentInstruction(
					ataRentPayer,
					ataAddress,
					keypair.publicKey,
					mint
				)
			);
		}

		// Balance guard: bundler wallet must cover spendable SOL budget + tx fee buffer.
		// (Program-created accounts during buyExactSolIn are expected to be covered by spendable_sol_in itself.)
		const bundlerBalanceLamports = await connection.getBalance(keypair.publicKey);
		const txFeeReserveLamports = Math.floor(0.00002 * LAMPORTS_PER_SOL); // conservative fee buffer

		const spendableSolInLamports = new BN(Math.floor(solAmountNum * LAMPORTS_PER_SOL));
		const minTokensOut = new BN(1);
		if (bundlerBalanceLamports < spendableSolInLamports.toNumber() + txFeeReserveLamports) {
			const have = bundlerBalanceLamports / LAMPORTS_PER_SOL;
			const need = (spendableSolInLamports.toNumber() + txFeeReserveLamports) / LAMPORTS_PER_SOL;
			console.warn(
				`⚠️ Bundler wallet ${keypair.publicKey.toBase58()} insufficient SOL for buy. ` +
					`Have ${have.toFixed(6)} SOL, need >= ${need.toFixed(6)} SOL (buy ${solAmountNum} + fee buffer). ` +
					`Fund it more or reduce solAmount.`
			);
			continue;
		}

		const [creatorVault] = PublicKey.findProgramAddressSync(
			[Buffer.from("creator-vault"), wallet.publicKey.toBuffer()],
			PUMP_PROGRAM
		);
		const [globalVolumeAccumulator] = PublicKey.findProgramAddressSync(
			[Buffer.from("global_volume_accumulator")],
			PUMP_PROGRAM
		);
		const [userVolumeAccumulator] = PublicKey.findProgramAddressSync(
			[Buffer.from("user_volume_accumulator"), keypair.publicKey.toBuffer()],
			PUMP_PROGRAM
		);
		const [feeConfig] = PublicKey.findProgramAddressSync(
			[Buffer.from("fee_config"), FEE_CONFIG_SEED_BYTES],
			FEE_PROGRAM
		);

		const buyIx = await program.methods
			.buyExactSolIn(spendableSolInLamports, minTokensOut, { some: true })
			.accounts({
				global,
				feeRecipient: feeRecipient,
				mint,
				bondingCurve,
				associatedBondingCurve,
				associatedUser: ataAddress,
				user: keypair.publicKey,
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
		instructions.push(buyIx);

		const message = new TransactionMessage({
			payerKey: keypair.publicKey,
			recentBlockhash: blockhash,
			instructions,
		}).compileToV0Message([lut]);

		const serializedMsg = message.serialize();
		console.log(
			`Bundler tx payer=${keypair.publicKey.toBase58()} user=${keypair.publicKey.toBase58()} size=${serializedMsg.length} (ataCreate=${ataExists ? "no" : "yes"})`
		);

		const versionedTx = new VersionedTransaction(message);
		// Sign with bundler wallet always. If dev paid ATA rent in this tx, dev must sign too.
		if (!ataExists && devPaysAtaRent) {
			versionedTx.sign([keypair, wallet]);
		} else {
			versionedTx.sign([keypair]);
		}
		txsSigned.push(versionedTx);
	}

	return txsSigned;
}

function chunkArray<T>(array: T[], size: number): T[][] {
	return Array.from({ length: Math.ceil(array.length / size) }, (v, i) => array.slice(i * size, i * size + size));
}

