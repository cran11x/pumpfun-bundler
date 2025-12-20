import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { loadKeypairs } from "../createKeys";
import { connection, wallet, payer } from "../../config";
import * as fs from "fs";
import path from "path";
import { Logger } from "./logger";

const keyInfoPath = path.join(__dirname, "../keyInfo.json");

export interface ValidationResult {
	success: boolean;
	errors: string[];
	warnings: string[];
}

export async function validatePreLaunch(): Promise<ValidationResult> {
	const result: ValidationResult = {
		success: true,
		errors: [],
		warnings: [],
	};

	Logger.info("Pokretanje pre-launch validacije...");

	// 1. Validacija RPC konekcije
	try {
		const slot = await connection.getSlot();
		Logger.info(`RPC konekcija OK - Slot: ${slot}`);
	} catch (error) {
		result.success = false;
		const errorMsg = `RPC konekcija neuspešna: ${error}`;
		result.errors.push(errorMsg);
		Logger.error(errorMsg);
	}

	// 2. Validacija keyInfo.json
	if (!fs.existsSync(keyInfoPath)) {
		result.success = false;
		result.errors.push("keyInfo.json ne postoji!");
		Logger.error("keyInfo.json ne postoji!");
	} else {
		try {
			const keyInfo = JSON.parse(fs.readFileSync(keyInfoPath, "utf-8"));

			if (!keyInfo.addressLUT) {
				result.errors.push("LUT adresa nije postavljena!");
				result.success = false;
				Logger.error("LUT adresa nije postavljena!");
			}

			if (!keyInfo.numOfWallets || keyInfo.numOfWallets === 0) {
				result.errors.push("Nema generisanih novčanika!");
				result.success = false;
				Logger.error("Nema generisanih novčanika!");
			}
		} catch (error) {
			result.success = false;
			const errorMsg = `Greška pri čitanju keyInfo.json: ${error}`;
			result.errors.push(errorMsg);
			Logger.error(errorMsg);
		}
	}

	// 3. Validacija balansa novčanika
	try {
		const keypairs = loadKeypairs();
		if (keypairs.length === 0) {
			result.errors.push("Nema učitanih keypair-ova!");
			result.success = false;
			Logger.error("Nema učitanih keypair-ova!");
		} else {
			const keyInfo = JSON.parse(fs.readFileSync(keyInfoPath, "utf-8"));

			// Dev wallet balans
			try {
				const devBalance = await connection.getBalance(wallet.publicKey);
				const devInfo = keyInfo[wallet.publicKey.toString()];
				const requiredDev = devInfo
					? parseFloat(devInfo.solAmount || "0") * 1.1
					: 0;
				if (devBalance < requiredDev * 1e9) {
					const warning = `Dev wallet ima nizak balans: ${(devBalance / 1e9).toFixed(4)} SOL (potrebno: ${requiredDev.toFixed(4)} SOL)`;
					result.warnings.push(warning);
					Logger.warn(warning);
				} else {
					Logger.info(
						`Dev wallet balans OK: ${(devBalance / 1e9).toFixed(4)} SOL`
					);
				}
			} catch (error) {
				const errorMsg = `Greška pri proveri dev wallet balansa: ${error}`;
				result.errors.push(errorMsg);
				Logger.error(errorMsg);
			}

			// Payer wallet balans (za LUT i fees)
			try {
				const payerBalance = await connection.getBalance(payer.publicKey);
				const totalRequired =
					keypairs.reduce((sum, kp) => {
						const solAmount = parseFloat(
							keyInfo[kp.publicKey.toString()]?.solAmount || "0"
						);
						return sum + solAmount * 1.015 + 0.0025;
					}, 0) + 0.1; // +0.1 za LUT i fees

				if (payerBalance < totalRequired * 1e9) {
					const errorMsg = `Payer wallet nema dovoljno SOL: ${(payerBalance / 1e9).toFixed(4)} SOL (potrebno: ${totalRequired.toFixed(4)} SOL)`;
					result.errors.push(errorMsg);
					result.success = false;
					Logger.error(errorMsg);
				} else {
					Logger.info(
						`Payer wallet balans OK: ${(payerBalance / 1e9).toFixed(4)} SOL`
					);
				}
			} catch (error) {
				const errorMsg = `Greška pri proveri payer wallet balansa: ${error}`;
				result.errors.push(errorMsg);
				Logger.error(errorMsg);
			}

			// Sub-wallet balansi
			for (const keypair of keypairs) {
				const pubkeyStr = keypair.publicKey.toString();
				const solAmount = parseFloat(keyInfo[pubkeyStr]?.solAmount || "0");

				if (!solAmount || solAmount === 0) {
					const warning = `Wallet ${pubkeyStr} nema postavljen solAmount`;
					result.warnings.push(warning);
					Logger.warn(warning);
				} else {
					try {
						const balance = await connection.getBalance(keypair.publicKey);
						const required = (solAmount * 1.015 + 0.0025) * 1e9;
						if (balance < required) {
							const warning = `Wallet ${pubkeyStr} ima nizak balans: ${(balance / 1e9).toFixed(4)} SOL`;
							result.warnings.push(warning);
							Logger.warn(warning);
						}
					} catch (error) {
						const warning = `Ne mogu proveriti balans za ${pubkeyStr}`;
						result.warnings.push(warning);
						Logger.warn(warning);
					}
				}
			}
		}
	} catch (error) {
		const errorMsg = `Greška pri validaciji novčanika: ${error}`;
		result.errors.push(errorMsg);
		result.success = false;
		Logger.error(errorMsg);
	}

	// 4. Validacija LUT postojanja
	try {
		const keyInfo = JSON.parse(fs.readFileSync(keyInfoPath, "utf-8"));
		if (keyInfo.addressLUT) {
			const lut = new PublicKey(keyInfo.addressLUT);
			const lutAccount = await connection.getAddressLookupTable(lut);
			if (!lutAccount.value) {
				result.errors.push("LUT ne postoji na chain-u!");
				result.success = false;
				Logger.error("LUT ne postoji na chain-u!");
			} else {
				const addressCount = lutAccount.value.state.addresses.length;
				Logger.info(`LUT postoji sa ${addressCount} adresa`);
			}
		}
	} catch (error) {
		const errorMsg = `Greška pri proveri LUT: ${error}`;
		result.errors.push(errorMsg);
		result.success = false;
		Logger.error(errorMsg);
	}

	// 5. Validacija slike
	if (!(await validateImageExists())) {
		result.warnings.push("Slika nije pronađena u /img folderu!");
		Logger.warn("Slika nije pronađena u /img folderu!");
	} else {
		Logger.info("Slika validirana");
	}

	return result;
}

export async function validateImageExists(): Promise<boolean> {
	const imgDir = path.join(__dirname, "../../img");
	if (!fs.existsSync(imgDir)) {
		return false;
	}
	const files = fs.readdirSync(imgDir);
	return files.length === 1 && files[0].match(/\.(jpg|jpeg|png|gif)$/i) !== null;
}

