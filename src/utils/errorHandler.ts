export class BundlerError extends Error {
	constructor(
		message: string,
		public code: string,
		public recoverable: boolean = false
	) {
		super(message);
		this.name = "BundlerError";
	}
}

export interface ErrorAnalysis {
	message: string;
	recoverable: boolean;
	retryable: boolean;
	code?: string;
}

export function handleBundleError(error: any): ErrorAnalysis {
	const errMsg = error?.message || String(error);

	// Kategorizacija grešaka
	if (errMsg.includes("Bundle Dropped") || errMsg.includes("Bundle likely dropped")) {
		return {
			message: "Bundle je odbačen - nema dostupnih leader-a",
			recoverable: true,
			retryable: true,
			code: "BUNDLE_DROPPED",
		};
	}

	if (errMsg.includes("insufficient funds") || errMsg.includes("InsufficientFundsForFee")) {
		return {
			message: "Nedovoljno sredstava u novčaniku",
			recoverable: false,
			retryable: false,
			code: "INSUFFICIENT_FUNDS",
		};
	}

	if (errMsg.includes("Transaction too large") || errMsg.includes("tx too big")) {
		return {
			message: "Transakcija je prevelika - smanjite broj novčanika",
			recoverable: true,
			retryable: false,
			code: "TX_TOO_LARGE",
		};
	}

	if (errMsg.includes("Blockhash not found") || errMsg.includes("blockhash")) {
		return {
			message: "Blockhash je istekao - pokušajte ponovo",
			recoverable: true,
			retryable: true,
			code: "BLOCKHASH_EXPIRED",
		};
	}

	if (errMsg.includes("AccountNotFound") || errMsg.includes("account not found")) {
		return {
			message: "Račun nije pronađen - proverite LUT i adrese",
			recoverable: false,
			retryable: false,
			code: "ACCOUNT_NOT_FOUND",
		};
	}

	if (errMsg.includes("AlreadyInitialized")) {
		return {
			message: "Račun je već inicijalizovan",
			recoverable: true,
			retryable: false,
			code: "ALREADY_INITIALIZED",
		};
	}

	return {
		message: errMsg,
		recoverable: false,
		retryable: false,
		code: "UNKNOWN_ERROR",
	};
}

