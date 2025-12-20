import { createKeypairs } from "./src/createKeys";
import { buyBundle } from "./src/jitoPool";
import { sender } from "./src/senderUI";
import { sellXPercentagePF } from "./src/sellFunc";
import { sellXPercentageRAY } from "./src/sellRay";
import { MenuUI } from "./src/ui/menu";
import inquirer from "inquirer";

async function main() {
	let running = true;

	while (running) {
		try {
			const mainChoice = await MenuUI.showMainMenu();

			switch (mainChoice.action) {
				case "launch":
					await buyBundle();
					break;
				case "wallet":
					running = await handleWalletMenu();
					break;
				case "setup":
					running = await handleSetupMenu();
					break;
				case "sell":
					running = await handleSellMenu();
					break;
				case "test":
					running = await handleTestMenu();
					break;
				case "exit":
					running = false;
					break;
			}

			if (running) {
				console.log("\nPress Enter to continue...");
				await new Promise((resolve) => {
					process.stdin.once("data", resolve);
				});
			}
		} catch (error) {
			if (error && typeof error === "object" && "isTtyError" in error) {
				console.error("Prompt couldn't be rendered in the current environment.");
				process.exit(1);
			} else {
				console.error("\n❌ Error:", error);
				console.log("\nPress Enter to continue...");
				await new Promise((resolve) => {
					process.stdin.once("data", resolve);
				});
			}
		}
	}

	console.log("\n👋 Thank you for using Pump.Fun Bundler!");
	console.log("DM me for support: https://t.me/benorizz0");
	console.log("solana-scripts.com\n");
	process.exit(0);
}

async function handleWalletMenu(): Promise<boolean> {
	const walletChoice = await MenuUI.showWalletMenu();

	switch (walletChoice.action) {
		case "create":
			await createKeypairs();
			return true;
		case "fund":
			// Fund wallets - this will show the setup menu with funding options
			const { generateATAandSOL, createReturns } = await import("./src/senderUI");
			const fundChoice = await inquirer.prompt<{ action: string }>({
				type: 'list',
				name: 'action',
				message: 'Choose funding option:',
				choices: [
					{ name: '💰 Send Simulation SOL Bundle', value: 'send' },
					{ name: '💸 Reclaim Buyers SOL', value: 'reclaim' },
					{ name: '⬅️  Back', value: 'back' },
				],
			});
			if (fundChoice.action === 'send') {
				await generateATAandSOL();
			} else if (fundChoice.action === 'reclaim') {
				await createReturns();
			}
			return true;
		case "balance":
			const { checkAllBalances } = await import("./src/senderUI");
			await checkAllBalances();
			return true;
		case "back":
			return true;
	}
	return true;
}

async function handleSetupMenu(): Promise<boolean> {
	const setupChoice = await MenuUI.showSetupMenu();

	switch (setupChoice.action) {
		case "lut":
		case "extend":
		case "simulate":
			await sender();
			return true;
		case "back":
			return true;
	}
	return true;
}

async function handleSellMenu(): Promise<boolean> {
	const sellChoice = await MenuUI.showSellMenu();

	switch (sellChoice.action) {
		case "pumpfun":
			await sellXPercentagePF();
			return true;
		case "raydium":
			await sellXPercentageRAY();
			return true;
		case "back":
			return true;
	}
	return true;
}

async function handleTestMenu(): Promise<boolean> {
	const testChoice = await MenuUI.showTestMenu();

	switch (testChoice.action) {
		case "validate":
			const { validatePreLaunch } = await import("./src/utils/validations");
			const result = await validatePreLaunch();
			console.log("\n📋 REZULTATI VALIDACIJE:");
			if (result.success) {
				console.log("✅ Sve validacije prošle!");
			} else {
				console.log("❌ Greške:");
				result.errors.forEach((err) => console.log(`   - ${err}`));
			}
			if (result.warnings.length > 0) {
				console.log("\n⚠️  Upozorenja:");
				result.warnings.forEach((warn) => console.log(`   - ${warn}`));
			}
			return true;

		case "health":
			const { healthCheck } = await import("./src/utils/healthCheck");
			const health = await healthCheck();
			console.log("\n💚 HEALTH CHECK:");
			console.log(`RPC: ${health.rpc ? "✅" : "❌"}`);
			console.log(`Jito: ${health.jito ? "✅" : "❌"}`);
			console.log(`Network: ${health.network}`);
			console.log(`Slot: ${health.slot || "N/A"}`);
			if (health.errors.length > 0) {
				console.log("\n❌ Greške:");
				health.errors.forEach((err) => console.log(`   - ${err}`));
			}
			return true;

		case "balance":
			const { checkAllBalances } = await import("./src/senderUI");
			await checkAllBalances();
			return true;

		case "rpc":
			const { connection } = await import("./config");
			console.log("\n🔗 Testiranje RPC konekcije...");
			try {
				const slot = await connection.getSlot("finalized");
				const blockHeight = await connection.getBlockHeight("finalized");
				console.log(`✅ RPC konekcija OK`);
				console.log(`   Slot: ${slot}`);
				console.log(`   Block Height: ${blockHeight}`);
			} catch (error) {
				console.error(`❌ RPC konekcija neuspešna: ${error}`);
			}
			return true;

		case "back":
			return true;
	}
	return true;
}

main().catch((err) => {
	console.error("Error:", err);
});
