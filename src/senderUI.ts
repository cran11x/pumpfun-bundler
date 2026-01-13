import { Keypair, PublicKey, SystemProgram, TransactionInstruction, VersionedTransaction, LAMPORTS_PER_SOL, TransactionMessage, Blockhash } from "@solana/web3.js";
import { loadKeypairs } from "./createKeys";
import { wallet, payer, getConnection } from "../config";
import * as spl from "@solana/spl-token";
import { sendBundle as sendBundleUtil } from "./utils/bundleSender";
import { MenuUI } from "./ui/menu";
import inquirer from "inquirer";
import { createLUT, extendLUT } from "./createLUT";
import fs from "fs";
import path from "path";
import { getRandomTipAccount } from "./clients/config";
import BN from "bn.js";
const keyInfoPath = path.join(__dirname, "keyInfo.json");

let poolInfo: { [key: string]: any } = {};
if (fs.existsSync(keyInfoPath)) {
	const data = fs.readFileSync(keyInfoPath, "utf-8");
	poolInfo = JSON.parse(data);
}

interface Buy {
	pubkey: PublicKey;
	solAmount: Number;
	tokenAmount: BN;
	percentSupply: number;
}

async function generateSOLTransferForKeypairs(tipAmt: number, steps: number = 24): Promise<TransactionInstruction[]> {
	const keypairs: Keypair[] = loadKeypairs();
	const ixs: TransactionInstruction[] = [];

	let existingData: any = {};
	if (fs.existsSync(keyInfoPath)) {
		try {
			existingData = JSON.parse(fs.readFileSync(keyInfoPath, "utf-8"));
		} catch (error) {
			throw new Error(`Failed to read keyInfo.json: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	// Dev wallet send first
	if (!existingData[wallet.publicKey.toString()] || !existingData[wallet.publicKey.toString()].solAmount) {
		throw new Error(`Missing solAmount for dev wallet (${wallet.publicKey.toString()}). Please configure buy amounts first or provide amountPerWallet parameter.`);
	}

		const solAmount = parseFloat(existingData[wallet.publicKey.toString()].solAmount);

	if (isNaN(solAmount) || solAmount <= 0) {
		throw new Error(`Invalid solAmount for dev wallet: ${existingData[wallet.publicKey.toString()].solAmount}. Must be a positive number.`);
	}

	ixs.push(
		SystemProgram.transfer({
			fromPubkey: payer.publicKey,
			toPubkey: wallet.publicKey,
			lamports: Math.floor((solAmount * 1.015 + 0.0025) * LAMPORTS_PER_SOL),
		})
	);
	console.log(`Prepared transfer of ${(solAmount * 1.015 + 0.0025).toFixed(3)} SOL to dev wallet (${wallet.publicKey.toString()})`);

	// Loop through the keypairs and process each one
	let skippedWallets: string[] = [];
	for (let i = 0; i < Math.min(steps, keypairs.length); i++) {
		const keypair = keypairs[i];
		const keypairPubkeyStr = keypair.publicKey.toString();

		if (!existingData[keypairPubkeyStr] || !existingData[keypairPubkeyStr].solAmount) {
			console.warn(`Missing solAmount for wallet ${i + 1} (${keypairPubkeyStr}), skipping.`);
			skippedWallets.push(keypairPubkeyStr);
			continue;
		}

		const solAmount = parseFloat(existingData[keypairPubkeyStr].solAmount);

		if (isNaN(solAmount) || solAmount <= 0) {
			console.warn(`Invalid solAmount for wallet ${i + 1} (${keypairPubkeyStr}): ${existingData[keypairPubkeyStr].solAmount}, skipping.`);
			skippedWallets.push(keypairPubkeyStr);
			continue;
		}

		try {
			ixs.push(
				SystemProgram.transfer({
					fromPubkey: payer.publicKey,
					toPubkey: keypair.publicKey,
					lamports: Math.floor((solAmount * 1.015 + 0.0025) * LAMPORTS_PER_SOL),
				})
			);
			console.log(`Prepared transfer of ${(solAmount * 1.015 + 0.0025).toFixed(3)} SOL to Wallet ${i + 1} (${keypair.publicKey.toString()})`);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			console.error(`Error creating transfer instruction for wallet ${i + 1} (${keypairPubkeyStr}):`, errorMsg);
			skippedWallets.push(keypairPubkeyStr);
			continue;
		}
	}

	if (skippedWallets.length > 0) {
		console.warn(`Warning: ${skippedWallets.length} wallet(s) were skipped due to missing or invalid solAmount data.`);
	}

	// Check if we have any transfer instructions (should have at least dev wallet transfer)
	if (ixs.length === 0) {
		throw new Error(`No valid transfer instructions created. Check solAmount configuration for wallets.`);
	}

	// Add tip instruction at the end
	ixs.push(
		SystemProgram.transfer({
			fromPubkey: payer.publicKey,
			toPubkey: getRandomTipAccount(),
			lamports: BigInt(tipAmt),
		})
	);

	return ixs;
}

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
	const chunks = [];
	for (let i = 0; i < array.length; i += chunkSize) {
		chunks.push(array.slice(i, i + chunkSize));
	}
	return chunks;
}

async function createAndSignVersionedTxWithKeypairs(instructionsChunk: TransactionInstruction[], blockhash: Blockhash | string): Promise<VersionedTransaction> {
	let poolInfo: { [key: string]: any } = {};
	if (fs.existsSync(keyInfoPath)) {
		const data = fs.readFileSync(keyInfoPath, "utf-8");
		poolInfo = JSON.parse(data);
	}

	// Funding SOL transfers does NOT require a LUT.
	// If a LUT exists we can use it, but on devnet it's common for the LUT to be missing/invalid.
	// In that case we fall back to compiling without LUT.
	const lookupTableAccounts: any[] = [];
	if (poolInfo.addressLUT) {
		try {
			const lut = new PublicKey(poolInfo.addressLUT.toString());
			const lookupTableAccount = (await getConnection().getAddressLookupTable(lut)).value;
			if (lookupTableAccount) {
				lookupTableAccounts.push(lookupTableAccount);
			} else {
				console.warn(
					`[Funding] LUT not found at ${lut.toString()} - proceeding without LUT for SOL transfers.`
				);
			}
		} catch (e) {
			console.warn(
				`[Funding] Failed to load LUT (${poolInfo.addressLUT}) - proceeding without LUT for SOL transfers.`
			);
		}
	}

	const addressesMain: PublicKey[] = [];
	instructionsChunk.forEach((ixn) => {
		ixn.keys.forEach((key) => {
			addressesMain.push(key.pubkey);
		});
	});

	const message = new TransactionMessage({
		payerKey: payer.publicKey,
		recentBlockhash: blockhash,
		instructions: instructionsChunk,
	}).compileToV0Message(lookupTableAccounts);

	const versionedTx = new VersionedTransaction(message);

	versionedTx.sign([payer]);

	/*
    // Simulate each txn
    const simulationResult = await getConnection().simulateTransaction(versionedTx, { commitment: "processed" });

    if (simulationResult.value.err) {
    console.log("Simulation error:", simulationResult.value.err);
    } else {
    console.log("Simulation success. Logs:");
    simulationResult.value.logs?.forEach(log => console.log(log));
    }
    */

	return versionedTx;
}

async function processInstructionsSOL(ixs: TransactionInstruction[], blockhash: string | Blockhash): Promise<VersionedTransaction[]> {
	const txns: VersionedTransaction[] = [];
	const instructionChunks = chunkArray(ixs, 45);

	for (let i = 0; i < instructionChunks.length; i++) {
		const versionedTx = await createAndSignVersionedTxWithKeypairs(instructionChunks[i], blockhash);
		txns.push(versionedTx);
	}

	return txns;
}


export async function generateATAandSOL(jitoTipParam?: number) {
	try {
		const jitoTip = jitoTipParam !== undefined ? jitoTipParam : await MenuUI.promptJitoTip();
		
		if (jitoTip < 0 || isNaN(jitoTip)) {
			throw new Error(`Invalid jitoTip: ${jitoTip}. Must be a non-negative number.`);
		}

		const jitoTipAmt = jitoTip * LAMPORTS_PER_SOL;

		console.log(`[Funding] Starting wallet funding process with jitoTip: ${jitoTip} SOL`);
		
		const { blockhash } = await getConnection().getLatestBlockhash();
		const sendTxns: VersionedTransaction[] = [];

		console.log(`[Funding] Generating SOL transfer instructions...`);
		const solIxs = await generateSOLTransferForKeypairs(jitoTipAmt);
		
		if (solIxs.length === 0) {
			throw new Error("No transfer instructions generated. Check wallet configuration and solAmount data.");
		}

		console.log(`[Funding] Created ${solIxs.length} transfer instructions. Processing into transactions...`);
		const solTxns = await processInstructionsSOL(solIxs, blockhash);
		sendTxns.push(...solTxns);

		console.log(`[Funding] Sending ${sendTxns.length} transaction(s) via bundle...`);
		// Use autoProceed for API calls to skip user interaction
		await sendBundleUtil(sendTxns, { autoProceed: true });
		console.log(`[Funding] Wallet funding completed successfully.`);
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		console.error(`[Funding] Error in generateATAandSOL:`, errorMsg);
		throw error; // Re-throw to allow caller to handle
	}
}

export async function createReturns() {
	const txsSigned: VersionedTransaction[] = [];
	const keypairs = loadKeypairs();
	const chunkedKeypairs = chunkArray(keypairs, 7); // EDIT CHUNKS?

	const jitoTip = await MenuUI.promptJitoTip();
	const TipAmt = jitoTip * LAMPORTS_PER_SOL;

	const { blockhash } = await getConnection().getLatestBlockhash();

	// Iterate over each chunk of keypairs
	for (let chunkIndex = 0; chunkIndex < chunkedKeypairs.length; chunkIndex++) {
		const chunk = chunkedKeypairs[chunkIndex];
		const instructionsForChunk: TransactionInstruction[] = [];

		// Iterate over each keypair in the chunk to create swap instructions
		for (let i = 0; i < chunk.length; i++) {
			const keypair = chunk[i];
			console.log(`Processing keypair ${i + 1}/${chunk.length}:`, keypair.publicKey.toString());

			const balance = await getConnection().getBalance(keypair.publicKey);

			const sendSOLixs = SystemProgram.transfer({
				fromPubkey: keypair.publicKey,
				toPubkey: payer.publicKey,
				lamports: balance,
			});

			instructionsForChunk.push(sendSOLixs);
		}

		if (chunkIndex === chunkedKeypairs.length - 1) {
			const tipSwapIxn = SystemProgram.transfer({
				fromPubkey: payer.publicKey,
				toPubkey: getRandomTipAccount(),
				lamports: BigInt(TipAmt),
			});
			instructionsForChunk.push(tipSwapIxn);
			console.log("Jito tip added :).");
		}

		const lut = new PublicKey(poolInfo.addressLUT.toString());

		const message = new TransactionMessage({
			payerKey: payer.publicKey,
			recentBlockhash: blockhash,
			instructions: instructionsForChunk,
		}).compileToV0Message([poolInfo.addressLUT]);

		const versionedTx = new VersionedTransaction(message);

		const serializedMsg = versionedTx.serialize();
		console.log("Txn size:", serializedMsg.length);
		if (serializedMsg.length > 1232) {
			console.log("tx too big");
		}

		console.log(
			"Signing transaction with chunk signers",
			chunk.map((kp) => kp.publicKey.toString())
		);

		versionedTx.sign([payer]);

		for (const keypair of chunk) {
			versionedTx.sign([keypair]);
		}

		txsSigned.push(versionedTx);
	}

	await sendBundleUtil(txsSigned);
}

/**
 * Reclaim SOL from all sub-wallets back to the payer (main wallet).
 * - Designed for API usage: non-interactive, no LUT required
 * - Leaves a tiny reserve to keep the account usable for future fees (default 5000 lamports)
 */
export async function reclaimSOLToPayer(
	jitoTipParam: number = 0,
	reserveLamports: number = 5000
): Promise<{
	reclaimedLamports: number;
	skippedWallets: number;
	txCount: number;
}> {
	if (isNaN(jitoTipParam) || jitoTipParam < 0) {
		throw new Error(`Invalid jitoTip: ${jitoTipParam}. Must be a non-negative number.`);
	}

	const keypairs = loadKeypairs();
	if (keypairs.length === 0) {
		return { reclaimedLamports: 0, skippedWallets: 0, txCount: 0 };
	}

	const conn = getConnection();
	const { blockhash } = await conn.getLatestBlockhash();

	// System accounts still need to remain rent-exempt to avoid simulation/runtime failures.
	// For dataLen=0, mainnet rent-exempt minimum is ~0.00089088 SOL (890,880 lamports).
	const rentExemptMin = await conn.getMinimumBalanceForRentExemption(0);
	// Leave rent-exempt minimum + small fee buffer.
	const effectiveReserveLamports = Math.max(reserveLamports, rentExemptMin + 5000);

	const chunkedKeypairs = chunkArray(keypairs, 7);
	const txsSigned: VersionedTransaction[] = [];
	let reclaimedLamports = 0;
	let skippedWallets = 0;

	const tipLamports = Math.floor(jitoTipParam * LAMPORTS_PER_SOL);

	for (let chunkIndex = 0; chunkIndex < chunkedKeypairs.length; chunkIndex++) {
		const chunk = chunkedKeypairs[chunkIndex];
		const instructionsForChunk: TransactionInstruction[] = [];
		const signers: Keypair[] = [payer];

		for (const kp of chunk) {
			const balance = await conn.getBalance(kp.publicKey, "confirmed");
			const sendLamports = balance - effectiveReserveLamports;

			// Skip empty / too-small balances
			if (sendLamports <= 0) {
				skippedWallets++;
				continue;
			}

			instructionsForChunk.push(
				SystemProgram.transfer({
					fromPubkey: kp.publicKey,
					toPubkey: payer.publicKey,
					lamports: sendLamports,
				})
			);
			signers.push(kp);
			reclaimedLamports += sendLamports;
		}

		// Add optional Jito tip at the end (default 0)
		if (chunkIndex === chunkedKeypairs.length - 1 && tipLamports > 0) {
			instructionsForChunk.push(
				SystemProgram.transfer({
					fromPubkey: payer.publicKey,
					toPubkey: getRandomTipAccount(),
					lamports: BigInt(tipLamports),
				})
			);
		}

		// Nothing to do in this chunk
		if (instructionsForChunk.length === 0) continue;

		const message = new TransactionMessage({
			payerKey: payer.publicKey,
			recentBlockhash: blockhash,
			instructions: instructionsForChunk,
		}).compileToV0Message([]);

		const versionedTx = new VersionedTransaction(message);
		versionedTx.sign(signers);
		txsSigned.push(versionedTx);
	}

	if (txsSigned.length === 0) {
		return { reclaimedLamports: 0, skippedWallets, txCount: 0 };
	}

	// Reclaim is not latency sensitive; send directly via RPC for reliability (no Jito dependency).
	for (let i = 0; i < txsSigned.length; i++) {
		const tx = txsSigned[i];
		const sig = await conn.sendRawTransaction(tx.serialize(), {
			skipPreflight: false,
			maxRetries: 3,
		});
		await conn.confirmTransaction(sig, "confirmed");
	}

	return { reclaimedLamports, skippedWallets, txCount: txsSigned.length };
}

async function simulateAndWriteBuys() {
	const keypairs = loadKeypairs();

	const tokenDecimals = 10 ** 6;
	const tokenTotalSupply = 1000000000 * tokenDecimals;
	let initialRealSolReserves = 0;
	let initialVirtualTokenReserves = 1073000000 * tokenDecimals;
	let initialRealTokenReserves = 793100000 * tokenDecimals;
	let totalTokensBought = 0;
	const buys: { pubkey: PublicKey; solAmount: Number; tokenAmount: BN; percentSupply: number }[] = [];

	// Prompt for dev wallet first
	const devSolInput = await inquirer.prompt<{ amount: string }>({
		type: 'input',
		name: 'amount',
		message: 'Enter the amount of SOL for dev wallet:',
		validate: (input: string) => {
			const num = parseFloat(input);
			if (isNaN(num) || num <= 0) {
				return 'Please enter a valid positive number.';
			}
			return true;
		},
	});
	let solInput = Number(devSolInput.amount) * 1.21;
	let keypair = wallet;
	const solAmount = solInput * LAMPORTS_PER_SOL;
	const e = new BN(solAmount);
	const initialVirtualSolReserves = 30 * LAMPORTS_PER_SOL + initialRealSolReserves;
	const a = new BN(initialVirtualSolReserves).mul(new BN(initialRealTokenReserves));
	const i = new BN(initialVirtualSolReserves).add(e);
	const l = a.div(i).add(new BN(1));
	let tokensToBuy = new BN(initialVirtualTokenReserves).sub(l);
	tokensToBuy = BN.min(tokensToBuy, new BN(initialRealTokenReserves));
	const tokensBought = tokensToBuy.toNumber();
	const percentSupply = (tokensBought / tokenTotalSupply) * 100;
	console.log(`Wallet 0: Bought ${tokensBought / tokenDecimals} tokens for ${e.toNumber() / LAMPORTS_PER_SOL} SOL`);
	console.log(`Wallet 0: Owns ${percentSupply.toFixed(4)}% of total supply\n`);
	buys.push({ pubkey: keypair.publicKey, solAmount: Number(devSolInput.amount), tokenAmount: tokensToBuy, percentSupply });
	initialRealSolReserves += e.toNumber();
	initialRealTokenReserves -= tokensBought;
	initialVirtualTokenReserves -= tokensBought;
	totalTokensBought += tokensBought;

	// Prompt for bundle wallets
	for (let it = 1; it <= keypairs.length; it++) {
		const walletSolInput = await inquirer.prompt<{ amount: string }>({
			type: 'input',
			name: 'amount',
			message: `Enter the amount of SOL for wallet ${it} (or press Enter to skip remaining):`,
			validate: (input: string) => {
				if (!input || input.trim() === '') {
					return true; // Allow empty to skip
				}
				const num = parseFloat(input);
				if (isNaN(num) || num <= 0) {
					return 'Please enter a valid positive number or press Enter to skip.';
				}
				return true;
			},
		});

		if (!walletSolInput.amount || walletSolInput.amount.trim() === '') {
			console.log(`Skipping remaining wallets...`);
			break;
		}

		solInput = Number(walletSolInput.amount);
		keypair = keypairs[it - 1];
		const solAmount = solInput * LAMPORTS_PER_SOL;

		const e = new BN(solAmount);
		const initialVirtualSolReserves = 30 * LAMPORTS_PER_SOL + initialRealSolReserves;
		const a = new BN(initialVirtualSolReserves).mul(new BN(initialVirtualTokenReserves));
		const i = new BN(initialVirtualSolReserves).add(e);
		const l = a.div(i).add(new BN(1));
		let tokensToBuy = new BN(initialVirtualTokenReserves).sub(l);
		tokensToBuy = BN.min(tokensToBuy, new BN(initialRealTokenReserves));

		const tokensBought = tokensToBuy.toNumber();
		const percentSupply = (tokensBought / tokenTotalSupply) * 100;

		console.log(`Wallet ${it}: Bought ${tokensBought / tokenDecimals} tokens for ${e.toNumber() / LAMPORTS_PER_SOL} SOL`);
		console.log(`Wallet ${it}: Owns ${percentSupply.toFixed(4)}% of total supply\n`);

		buys.push({ pubkey: keypair.publicKey, solAmount: Number(solInput), tokenAmount: tokensToBuy, percentSupply });

		initialRealSolReserves += e.toNumber();
		initialRealTokenReserves -= tokensBought;
		initialVirtualTokenReserves -= tokensBought;
		totalTokensBought += tokensBought;
	}

	console.log("Final real sol reserves: ", initialRealSolReserves / LAMPORTS_PER_SOL);
	console.log("Final real token reserves: ", initialRealTokenReserves / tokenDecimals);
	console.log("Final virtual token reserves: ", initialVirtualTokenReserves / tokenDecimals);
	console.log("Total tokens bought: ", totalTokensBought / tokenDecimals);
	console.log("Total % of tokens bought: ", (totalTokensBought / tokenTotalSupply) * 100);
	console.log(); // \n

	const confirmed = await MenuUI.promptConfirm("Do you want to use these buys?");
	if (confirmed) {
		writeBuysToFile(buys);
	} else {
		console.log("Simulation aborted.");
	}
}

function writeBuysToFile(buys: Buy[]) {
	let existingData: any = {};

	if (fs.existsSync(keyInfoPath)) {
		existingData = JSON.parse(fs.readFileSync(keyInfoPath, "utf-8"));
	}

	// Convert buys array to an object keyed by public key
	const buysObj = buys.reduce((acc, buy) => {
		acc[buy.pubkey.toString()] = {
			solAmount: buy.solAmount.toString(),
			tokenAmount: buy.tokenAmount.toString(),
			percentSupply: buy.percentSupply,
		};
		return acc;
	}, existingData); // Initialize with existing data

	// Write updated data to file
	fs.writeFileSync(keyInfoPath, JSON.stringify(buysObj, null, 2), "utf8");
	console.log("Buys have been successfully saved to keyinfo.json");
}

async function checkAllBalances() {
	const keypairs = loadKeypairs();
	
	console.log("\n💰 Wallet SOL Balances:\n");
	
	// Check dev wallet
	try {
		const devBalance = await getConnection().getBalance(wallet.publicKey);
		const devSolBalance = devBalance / LAMPORTS_PER_SOL;
		console.log(`Dev Wallet (${wallet.publicKey.toString().substring(0, 8)}...): ${devSolBalance.toFixed(4)} SOL`);
	} catch (error) {
		console.log(`Dev Wallet: Error checking balance - ${error}`);
	}
	
	// Check payer wallet
	try {
		const payerBalance = await getConnection().getBalance(payer.publicKey);
		const payerSolBalance = payerBalance / LAMPORTS_PER_SOL;
		console.log(`Payer Wallet (${payer.publicKey.toString().substring(0, 8)}...): ${payerSolBalance.toFixed(4)} SOL\n`);
	} catch (error) {
		console.log(`Payer Wallet: Error checking balance - ${error}\n`);
	}
	
	// Check all bundle wallets
	console.log("Bundle Wallets:");
	let totalSol = 0;
	for (let i = 0; i < keypairs.length; i++) {
		try {
			const balance = await getConnection().getBalance(keypairs[i].publicKey);
			const solBalance = balance / LAMPORTS_PER_SOL;
			totalSol += solBalance;
			console.log(`  Wallet ${i + 1} (${keypairs[i].publicKey.toString().substring(0, 8)}...): ${solBalance.toFixed(4)} SOL`);
		} catch (error) {
			console.log(`  Wallet ${i + 1}: Error checking balance`);
		}
	}
	
	console.log(`\n📊 Total SOL in bundle wallets: ${totalSol.toFixed(4)} SOL`);
	
	// Check token balances if mint exists
	if (poolInfo.mint) {
		console.log("\n🪙 Token Balances:\n");
		const mint = new PublicKey(poolInfo.mint);
		
		// Dev wallet token balance
		try {
			const devTokenAccount = await spl.getAssociatedTokenAddress(mint, wallet.publicKey);
			const devTokenBalance = await getConnection().getTokenAccountBalance(devTokenAccount);
			const tokenAmount = Number(devTokenBalance.value.amount) / 1e6;
			console.log(`Dev Wallet: ${tokenAmount.toFixed(2)} tokens`);
		} catch (error) {
			console.log(`Dev Wallet: No tokens or error`);
		}
		
		// Bundle wallet token balances
		let totalTokens = 0;
		for (let i = 0; i < keypairs.length; i++) {
			try {
				const tokenAccount = await spl.getAssociatedTokenAddress(mint, keypairs[i].publicKey);
				const tokenBalance = await getConnection().getTokenAccountBalance(tokenAccount);
				const tokenAmount = Number(tokenBalance.value.amount) / 1e6;
				totalTokens += tokenAmount;
				console.log(`  Wallet ${i + 1}: ${tokenAmount.toFixed(2)} tokens`);
			} catch (error) {
				// Token account doesn't exist or no tokens - silently skip
			}
		}
		
		if (totalTokens > 0) {
			console.log(`\n📊 Total tokens in bundle wallets: ${totalTokens.toFixed(2)} tokens`);
		}
	} else {
		console.log("\n⚠️  No token mint found. Token balances will be available after launch.");
	}
	
	console.log("\n");
}

export { checkAllBalances };

export async function sender() {
	let running = true;

	while (running) {
		try {
			const setupChoice = await MenuUI.showSetupMenu();

			switch (setupChoice.action) {
				case "lut":
					await createLUT();
					break;
				case "extend":
					await extendLUT();
					break;
				case "simulate":
					await simulateAndWriteBuys();
					break;
				case "back":
					running = false;
					break;
			}

			if (running && setupChoice.action !== "back") {
				console.log("\nPress Enter to continue...");
				await new Promise((resolve) => {
					process.stdin.once("data", resolve);
				});
			}
		} catch (error) {
			console.error("\n❌ Error:", error);
			running = false;
		}
	}
}
