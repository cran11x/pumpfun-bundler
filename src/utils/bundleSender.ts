import { VersionedTransaction } from "@solana/web3.js";
import { getConnection, getNetworkMode } from "../../config";
import { Logger } from "./logger";
import { BundlerError, handleBundleError } from "./errorHandler";
import { retryOperation } from "./retry";
import inquirer from "inquirer";
import bs58 from "bs58";

export interface BundleSendOptions {
	skipSimulation?: boolean;
	skipRetry?: boolean;
	maxRetries?: number;
	autoProceed?: boolean; // If true, automatically proceed without user confirmation
}

function formatBundleId(bundleId: unknown): string {
	if (typeof bundleId === "string") return bundleId;
	try {
		return JSON.stringify(bundleId);
	} catch {
		return String(bundleId);
	}
}

async function waitForBundleResult(params: {
	searcherClient: any;
	bundleId: string;
	timeoutMs?: number;
}): Promise<any | null> {
	const { searcherClient, bundleId, timeoutMs = 20_000 } = params;

	return await new Promise((resolve) => {
		let done = false;
		let unsubscribe: (() => void) | null = null;

		const timeout = setTimeout(() => {
			if (done) return;
			done = true;
			try {
				unsubscribe?.();
			} catch {
				// ignore
			}
			resolve(null);
		}, timeoutMs);

		try {
			unsubscribe = searcherClient.onBundleResult(
				(bundleResult: any) => {
					if (done) return;
					if (!bundleResult || bundleResult.bundleId !== bundleId) return;

					done = true;
					clearTimeout(timeout);
					try {
						unsubscribe?.();
					} catch {
						// ignore
					}
					resolve(bundleResult);
				},
				(e: Error) => {
					if (done) return;
					// Don't fail sending the bundle just because the status stream errored.
					Logger.warn("Bundle status stream error (non-fatal)", {
						message: e?.message ?? String(e),
					});
				}
			);
		} catch (e: any) {
			clearTimeout(timeout);
			Logger.warn("Failed to subscribe to bundle results (non-fatal)", {
				message: e?.message ?? String(e),
			});
			resolve(null);
		}
	});
}

export async function simulateBundle(
	bundledTxns: VersionedTransaction[]
): Promise<boolean> {
	Logger.info(`Simuliranje bundle-a sa ${bundledTxns.length} transakcija...`);
	const conn = getConnection();

	let allPassed = true;

	for (let i = 0; i < bundledTxns.length; i++) {
		const tx = bundledTxns[i];
		try {
			const simulationResult = await conn.simulateTransaction(tx, {
				commitment: "processed",
				replaceRecentBlockhash: true,
				sigVerify: false,
			});

			if (simulationResult.value.err) {
				Logger.error(
					`Transakcija ${i + 1} SIMULACIJA NEUSPEŠNA:`,
					simulationResult.value.err
				);
				// IMPORTANT: Bundles are atomic, but Solana simulation here is per-transaction.
				// If transaction N depends on accounts created in transaction 1..N-1 (same bundle),
				// standalone simulation for N can fail even though the bundle will land successfully.
				if (bundledTxns.length > 1 && i > 0) {
					Logger.warn(
						"Napomena: simulacija je rađena po transakciji. Ako Tx2+ zavisi od računa kreiranih u Tx1 (u istom bundle-u), ova greška može biti očekivana. Za konačan status koristite bundle result/proveru posle slanja."
					);
					// ATOMIC BUNDLE EXCEPTION: If Tx1 passed simulation, but Tx2+ fails with "IncorrectProgramId" or similar
					// (which happens when accounts created in Tx1 don't exist yet for independent Tx2 simulation),
					// we can consider this a "soft fail" and allow the bundle to proceed.
					const errStr = JSON.stringify(simulationResult.value.err);
					// Known dependency errors for Tx2+ inside an atomic bundle:
					// - IncorrectProgramId / AccountNotFound / InvalidAccountData: accounts created in Tx1 don't exist yet for standalone sim
					// - Custom 6023 (Pump.fun): NotEnoughTokensToSell, because Tx1 transfers tokens into payer ATA but Tx2 sim doesn't see it
					if (
						errStr.includes("IncorrectProgramId") ||
						errStr.includes("AccountNotFound") ||
						errStr.includes("InvalidAccountData") ||
						errStr.includes("\"Custom\":6023")
					) {
						Logger.warn("⚠️ Ignoring simulation error for dependent transaction (Tx2+) as it likely depends on Tx1 (Atomic Bundle).");
						continue; // Skip setting allPassed = false
					}
				}
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
		autoProceed = process.env.BUNDLER_NON_INTERACTIVE === "true",
	} = options;

	const network = getNetworkMode();
	const conn = getConnection();

	// Extract tx signatures up front for observability. These are the signatures that will appear on explorers if the bundle lands.
	const txSignatures = bundledTxns
		.map((tx) => tx.signatures?.[0])
		.filter((s): s is Uint8Array => !!s && s.length > 0)
		.map((s) => bs58.encode(Buffer.from(s)));
	if (txSignatures.length > 0) {
		Logger.info("Bundle tx signatures (for Solscan)", {
			count: txSignatures.length,
			sigs: txSignatures,
		});
	}

	// Simulacija pre slanja
	if (!skipSimulation) {
		const simulationPassed = await simulateBundle(bundledTxns);
		if (!simulationPassed) {
			Logger.warn("Neke simulacije nisu prošle!");
			
			// If autoProceed is true, skip user confirmation (for API calls)
			if (autoProceed) {
				// SAFETY CHANGE: Do NOT auto-proceed if simulation fails.
				// This protects the user from spending SOL on failed bundles.
				Logger.error("❌ SAFETY STOP: Simulation failed. Aborting launch to save SOL.");
				console.error("❌ Simulation failed - Launch aborted for safety.");
				throw new Error("Simulation failed - Launch aborted for safety. Check server logs for details.");
			} else {
				// Interactive mode - ask user
				const { proceed } = await inquirer.prompt([
					{
						type: "confirm",
						name: "proceed",
						message: "Simulacija nije prošla! Da li ste sigurni da želite da nastavite (Rizikujete gubitak SOL-a)?",
						default: false,
					},
				]);
				if (!proceed) {
					Logger.info("Slanje bundle-a otkazano od strane korisnika");
					throw new Error("Bundle send cancelled by user");
				}
			}
		}
	}

	// Devnet fallback: Jito is not available on devnet -> send directly via RPC
	if (network === "devnet") {
		Logger.info(
			`Devnet detected: sending ${bundledTxns.length} transaction(s) directly via RPC (no Jito bundle).`
		);

		for (let i = 0; i < bundledTxns.length; i++) {
			const tx = bundledTxns[i];
			try {
				const sig = await conn.sendRawTransaction(tx.serialize(), {
					skipPreflight: false,
					maxRetries: 3,
				});
				Logger.info(`Sent tx ${i + 1}/${bundledTxns.length}: ${sig}`);
				await conn.confirmTransaction(sig, "confirmed");
			} catch (error) {
				Logger.error(`Error sending tx ${i + 1}/${bundledTxns.length} on devnet`, error);
				throw error;
			}
		}

		Logger.info("Devnet funding transactions sent and confirmed.");
		return;
	}

	// Mainnet: Slanje bundle-a preko Jito
	const sendOperation = async () => {
		try {
			// Lazy-import Jito deps to avoid crashing devnet usage
			const [{ searcherClient, searcherClients }, { Bundle: JitoBundle }] = await Promise.all([
				import("../clients/jito"),
				import("jito-ts/dist/sdk/block-engine/types.js"),
			]);

			// IMPORTANT: The upstream comment says bundles are forwarded cross-region,
			// but in practice we see many "dropped" bundles. To improve inclusion,
			// send to all configured block engines in parallel and accept the first success.
			const clients = Array.isArray(searcherClients) && searcherClients.length > 0 ? searcherClients : [searcherClient];
			const bundle = new JitoBundle(bundledTxns, bundledTxns.length);

			const results = await Promise.allSettled(
				clients.map(async (c: any) => {
					const r = await c.sendBundle(bundle);
					if (!r || r.ok !== true) {
						const err = r?.error ?? r;
						throw err;
					}
					return { client: c, bundleId: r.value as string };
				})
			);

			const firstOk = results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ client: any; bundleId: string }> | undefined;
			if (!firstOk) {
				// Prefer the first rejection reason for debugging
				const firstErr = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
				throw firstErr?.reason ?? new Error("All block engines rejected the bundle");
			}

			const bundleId = firstOk.value.bundleId;
			const usedClient = firstOk.value.client;

			const bundleIdStr = formatBundleId(bundleId);

			Logger.info(`Bundle ${bundleIdStr} poslat`);
			console.log(`✅ Bundle ${bundleIdStr} sent.`);

			// Best-effort: poll signature statuses. This answers the most important question: did it land?
			if (txSignatures.length > 0) {
				const pollMs = Number(process.env.SIG_STATUS_POLL_MS ?? "2000");
				// Keep this relatively short so retries happen while the blockhash is still valid.
				const pollMaxMs = Number(process.env.SIG_STATUS_MAX_MS ?? "15000");
				const start = Date.now();
				let doneCount = 0;
				let seenAnyStatus = false;

				while (Date.now() - start < pollMaxMs) {
					try {
						const statuses = await conn.getSignatureStatuses(txSignatures, {
							searchTransactionHistory: true,
						});
						const values = statuses.value ?? [];
						doneCount = 0;

						for (let i = 0; i < txSignatures.length; i++) {
							const sig = txSignatures[i];
							const st = values[i];
							if (!st) continue;
							seenAnyStatus = true;
							if (st.err) {
								Logger.error("Transaction landed but failed", { sig, err: st.err });
								doneCount++;
								continue;
							}
							if (st.confirmationStatus === "finalized") {
								Logger.info("Transaction finalized", { sig });
								doneCount++;
							} else if (st.confirmationStatus === "confirmed") {
								Logger.info("Transaction confirmed", { sig });
								// keep polling for finalized, but count as landed
								doneCount++;
							} else if (st.confirmationStatus === "processed") {
								Logger.info("Transaction processed", { sig });
								doneCount++;
							}
						}

						if (doneCount === txSignatures.length) break;
					} catch (e: any) {
						Logger.warn("Signature status poll failed (non-fatal)", { message: e?.message ?? String(e) });
					}

					await new Promise((r) => setTimeout(r, Number.isFinite(pollMs) ? pollMs : 2000));
				}

				if (!seenAnyStatus) {
					// None of the tx signatures appeared on-chain within the polling window.
					// This almost always means the bundle was dropped / not included by a leader.
					Logger.error("Bundle likely dropped: no tx signatures found on-chain within polling window", {
						total: txSignatures.length,
						sigs: txSignatures,
						pollMaxMs,
					});
					// Throw a retryable BundlerError so we can retry quickly before blockhash expiration.
					throw new BundlerError(
						`Bundle likely dropped (no tx signatures found within ${pollMaxMs}ms). ` +
							`Try increasing jitoTip, trying again, or adding more block engines. ` +
							`Tx sigs: ${txSignatures.join(", ")}`,
						"BUNDLE_DROPPED",
						true
					);
				}

				if (doneCount < txSignatures.length) {
					Logger.warn("Some tx signatures did not reach a confirmed status in time (may still land)", {
						found: doneCount,
						total: txSignatures.length,
					});
				}
			}

			// Best-effort: wait briefly for a BundleResult update (accepted/processed/finalized/rejected/dropped).
			const statusTimeoutMs = Number(process.env.JITO_BUNDLE_STATUS_TIMEOUT_MS ?? "3000");
			const update = await waitForBundleResult({
				searcherClient: usedClient,
				bundleId,
				timeoutMs: Number.isFinite(statusTimeoutMs) ? statusTimeoutMs : 20_000,
			});

			if (!update) {
				Logger.warn("Nije dobijen bundle status u predviđenom vremenu (to ne znači da je bundle failovao).", {
					bundleId: bundleIdStr,
				});
				return bundleId;
			}

			// Normalize status for logs.
			if (update.rejected) {
				Logger.error("Bundle rejected by block engine", { bundleId: bundleIdStr, rejected: update.rejected });
			} else if (update.dropped) {
				Logger.error("Bundle dropped (accepted but did not land)", { bundleId: bundleIdStr, dropped: update.dropped });
			} else if (update.finalized) {
				Logger.info("Bundle finalized on-chain", { bundleId: bundleIdStr });
			} else if (update.processed) {
				Logger.info("Bundle processed on-chain", { bundleId: bundleIdStr, processed: update.processed });
			} else if (update.accepted) {
				Logger.info("Bundle accepted and forwarded to validator", { bundleId: bundleIdStr, accepted: update.accepted });
			} else {
				Logger.info("Bundle status update received", { bundleId: bundleIdStr, update });
			}

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

			// Convert to BundlerError so retryOperation can decide whether to retry.
			throw new BundlerError(
				errorAnalysis.message,
				errorAnalysis.code ?? "UNKNOWN_ERROR",
				Boolean(errorAnalysis.retryable)
			);
		}
	};

	if (skipRetry) {
		await sendOperation();
	} else {
		await retryOperation(sendOperation, maxRetries, 1000, "Bundle send");
	}
}

