import { VersionedTransaction } from "@solana/web3.js";
import { connection } from "../../config";
import { searcherClient } from "../clients/jito";
import { Bundle as JitoBundle } from "jito-ts/dist/sdk/block-engine/types.js";
import { Logger } from "./logger";
import { handleBundleError } from "./errorHandler";
import { retryOperation } from "./retry";
import inquirer from "inquirer";

export interface BundleSendOptions {
	skipSimulation?: boolean;
	skipRetry?: boolean;
	maxRetries?: number;
}

export async function simulateBundle(
	bundledTxns: VersionedTransaction[]
): Promise<boolean> {
	Logger.info(`Simuliranje bundle-a sa ${bundledTxns.length} transakcija...`);

	let allPassed = true;

	for (let i = 0; i < bundledTxns.length; i++) {
		const tx = bundledTxns[i];
		try {
			const simulationResult = await connection.simulateTransaction(tx, {
				commitment: "processed",
				replaceRecentBlockhash: true,
				sigVerify: false,
			});

			if (simulationResult.value.err) {
				Logger.error(
					`Transakcija ${i + 1} SIMULACIJA NEUSPEŠNA:`,
					simulationResult.value.err
				);
				allPassed = false;
			} else {
				const computeUnits =
					simulationResult.value.unitsConsumed || 0;
				Logger.info(
					`Transakcija ${i + 1} simulacija OK (${computeUnits} CU)`
				);
			}
		} catch (error) {
			Logger.error(`Greška pri simulaciji transakcije ${i + 1}:`, error);
			allPassed = false;
		}
	}

	return allPassed;
}

export async function sendBundle(
	bundledTxns: VersionedTransaction[],
	options: BundleSendOptions = {}
): Promise<void> {
	const {
		skipSimulation = false,
		skipRetry = false,
		maxRetries = 3,
	} = options;

	// Simulacija pre slanja
	if (!skipSimulation) {
		const simulationPassed = await simulateBundle(bundledTxns);
		if (!simulationPassed) {
			Logger.warn("Neke simulacije nisu prošle!");
			const { proceed } = await inquirer.prompt([
				{
					type: "confirm",
					name: "proceed",
					message: "Da li želite da nastavite sa slanjem bundle-a?",
					default: false,
				},
			]);
			if (!proceed) {
				Logger.info("Slanje bundle-a otkazano od strane korisnika");
				throw new Error("Bundle send cancelled by user");
			}
		}
	}

	// Slanje bundle-a
	const sendOperation = async () => {
		try {
			const bundleId = await searcherClient.sendBundle(
				new JitoBundle(bundledTxns, bundledTxns.length)
			);
			Logger.info(`Bundle ${bundleId} poslat`);
			console.log(`✅ Bundle ${bundleId} sent.`);
			return bundleId;
		} catch (error) {
			const errorAnalysis = handleBundleError(error);
			Logger.error("Greška pri slanju bundle-a", {
				message: errorAnalysis.message,
				code: errorAnalysis.code,
			});

			if (errorAnalysis.code === "BUNDLE_DROPPED") {
				console.error(
					"❌ Bundle je odbačen - nema dostupnih leader-a"
				);
			} else if (errorAnalysis.code === "INSUFFICIENT_FUNDS") {
				console.error("❌ Nedovoljno sredstava u novčaniku");
			} else {
				console.error(`❌ Neočekivana greška: ${errorAnalysis.message}`);
			}

			throw error;
		}
	};

	if (skipRetry) {
		await sendOperation();
	} else {
		await retryOperation(sendOperation, maxRetries, 1000, "Bundle send");
	}
}

