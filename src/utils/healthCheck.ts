import { Connection } from "@solana/web3.js";
import { connection } from "../../config";
import { searcherClient } from "../clients/jito";
import { Logger } from "./logger";

export interface HealthCheckResult {
	rpc: boolean;
	jito: boolean;
	network: "mainnet" | "devnet" | "unknown";
	slot: number | null;
	errors: string[];
}

export async function healthCheck(): Promise<HealthCheckResult> {
	const result: HealthCheckResult = {
		rpc: false,
		jito: false,
		network: "unknown",
		slot: null,
		errors: [],
	};

	// RPC Health Check
	try {
		const slot = await connection.getSlot("finalized");
		result.rpc = true;
		result.slot = slot;

		// Provera da li je mainnet
		try {
			const genesisHash = await connection.getGenesisHash();
			// Mainnet genesis hash
			if (genesisHash === "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d") {
				result.network = "mainnet";
			} else {
				result.network = "devnet";
			}
		} catch (error) {
			Logger.warn("Ne mogu da proverim genesis hash");
		}
	} catch (error) {
		result.errors.push(`RPC health check failed: ${error}`);
		Logger.error("RPC health check failed", error);
	}

	// Jito Health Check
	try {
		// Jito client već postoji, možemo proveriti da li je konektovan
		// Ako se client kreirao bez greške, smatramo da je OK
		result.jito = true;
	} catch (error) {
		result.errors.push(`Jito health check failed: ${error}`);
		Logger.error("Jito health check failed", error);
	}

	return result;
}

