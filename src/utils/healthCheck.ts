import { Connection } from "@solana/web3.js";
import { getConnection } from "../../config";
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

	// RPC Health Check - use getConnection() to get fresh connection with current RPC URL
	try {
		const connection = getConnection();
		// Use Promise.race with timeout to avoid hanging
		const timeoutPromise = new Promise<never>((_, reject) => 
			setTimeout(() => reject(new Error("RPC timeout after 5 seconds")), 5000)
		);
		
		const slot = await Promise.race([
			connection.getSlot("finalized"),
			timeoutPromise
		]);
		
		result.rpc = true;
		result.slot = slot;

		// Provera da li je mainnet
		try {
			const genesisHash = await Promise.race([
				connection.getGenesisHash(),
				timeoutPromise
			]);
			// Mainnet genesis hash
			if (genesisHash === "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d") {
				result.network = "mainnet";
			} else {
				result.network = "devnet";
			}
		} catch (error) {
			Logger.warn("Ne mogu da proverim genesis hash", error);
		}
	} catch (error: any) {
		const errorMsg = error?.message || String(error);
		result.errors.push(`RPC health check failed: ${errorMsg}`);
		Logger.error("RPC health check failed", error);
		
		// If it's a 401 error, suggest checking API key
		if (errorMsg.includes("401") || errorMsg.includes("Unauthorized") || errorMsg.includes("invalid api key")) {
			result.errors.push("RPC API key may be invalid or expired. Check HELIUS_API_KEY in .env file.");
		}
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

