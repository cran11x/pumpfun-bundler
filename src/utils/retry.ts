import { Logger } from "./logger";
import { BundlerError } from "./errorHandler";

export async function retryOperation<T>(
	operation: () => Promise<T>,
	maxRetries: number = 3,
	delay: number = 1000,
	operationName: string = "Operation"
): Promise<T> {
	let lastError: any;

	for (let i = 0; i < maxRetries; i++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;

			// If the error is explicitly non-retryable, fail fast.
			if (error instanceof BundlerError && error.recoverable === false) {
				Logger.error(`${operationName} - Non-retryable error`, {
					code: error.code,
					message: error.message,
				});
				throw error;
			}

			if (i < maxRetries - 1) {
				Logger.warn(
					`${operationName} - Pokušaj ${i + 1}/${maxRetries} neuspešan, ponovo za ${delay}ms...`
				);
				await new Promise((resolve) => setTimeout(resolve, delay));
				delay *= 2; // Exponential backoff
			}
		}
	}

	Logger.error(`${operationName} - Svi pokušaji neuspešni`);
	throw lastError;
}

