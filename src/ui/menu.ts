import inquirer from 'inquirer';

export interface MainMenuChoice {
	action: 'launch' | 'wallet' | 'setup' | 'sell' | 'test' | 'exit';
}

export interface WalletMenuChoice {
	action: 'create' | 'fund' | 'balance' | 'back';
}

export interface SetupMenuChoice {
	action: 'lut' | 'extend' | 'simulate' | 'back';
}

export interface SellMenuChoice {
	action: 'pumpfun' | 'raydium' | 'back';
}

export interface TestMenuChoice {
	action: 'validate' | 'health' | 'balance' | 'rpc' | 'back';
}

export class MenuUI {
	static async showMainMenu(): Promise<MainMenuChoice> {
		console.clear();
		console.log('╔════════════════════════════════════════╗');
		console.log('║   🚀 Pump.Fun Bundler - Main Menu     ║');
		console.log('╚════════════════════════════════════════╝\n');

		const { action } = await inquirer.prompt<MainMenuChoice>({
			type: 'list',
			name: 'action',
			message: 'What would you like to do?',
			choices: [
				{
					name: '🚀 Launch New Token (Guided Flow)',
					value: 'launch',
				},
				{
					name: '💰 Wallet Management (Create, Fund, Check)',
					value: 'wallet',
				},
				{
					name: '🔧 Advanced Setup (LUT, Manual Bundles)',
					value: 'setup',
				},
			{
				name: '📉 Sell Tokens (Pump.Fun / Raydium)',
				value: 'sell',
			},
			{
				name: '🧪 Test & Validation Tools',
				value: 'test',
			},
			{
				name: '❌ Exit',
				value: 'exit',
			},
			],
		});

		return { action };
	}

	static async showWalletMenu(): Promise<WalletMenuChoice> {
		console.clear();
		console.log('╔════════════════════════════════════════╗');
		console.log('║      💰 Wallet Management Menu        ║');
		console.log('╚════════════════════════════════════════╝\n');

		const { action } = await inquirer.prompt<WalletMenuChoice>({
			type: 'list',
			name: 'action',
			message: 'Choose an option:',
			choices: [
				{
					name: '📝 Create New Wallets',
					value: 'create',
				},
				{
					name: '💸 Fund Wallets with SOL',
					value: 'fund',
				},
				{
					name: '📊 Check All Balances',
					value: 'balance',
				},
				{
					name: '⬅️  Back to Main Menu',
					value: 'back',
				},
			],
		});

		return { action };
	}

	static async showSetupMenu(): Promise<SetupMenuChoice> {
		console.clear();
		console.log('╔════════════════════════════════════════╗');
		console.log('║      🔧 Advanced Setup Menu            ║');
		console.log('╚════════════════════════════════════════╝\n');

		const { action } = await inquirer.prompt<SetupMenuChoice>({
			type: 'list',
			name: 'action',
			message: 'Choose an option:',
			choices: [
				{
					name: '📋 Create Lookup Table (LUT)',
					value: 'lut',
				},
				{
					name: '➕ Extend Lookup Table',
					value: 'extend',
				},
				{
					name: '🧮 Simulate Buy Amounts',
					value: 'simulate',
				},
				{
					name: '⬅️  Back to Main Menu',
					value: 'back',
				},
			],
		});

		return { action };
	}

	static async showSellMenu(): Promise<SellMenuChoice> {
		console.clear();
		console.log('╔════════════════════════════════════════╗');
		console.log('║      📉 Sell Tokens Menu               ║');
		console.log('╚════════════════════════════════════════╝\n');

		const { action } = await inquirer.prompt<SellMenuChoice>({
			type: 'list',
			name: 'action',
			message: 'Where do you want to sell?',
			choices: [
				{
					name: '💎 Sell on Pump.Fun (Pre-Migration)',
					value: 'pumpfun',
				},
				{
					name: '🔄 Sell on Raydium (Post-Migration)',
					value: 'raydium',
				},
				{
					name: '⬅️  Back to Main Menu',
					value: 'back',
				},
			],
		});

		return { action };
	}

	static async promptNumberWallets(): Promise<number> {
		const { count } = await inquirer.prompt<{ count: string }>({
			type: 'input',
			name: 'count',
			message: 'How many wallets do you want to create? (2-12 recommended, max 24):',
			default: '3',
			validate: (input: string) => {
				const num = parseInt(input);
				if (isNaN(num) || num <= 0 || num > 24) {
					return 'Please enter a number between 1 and 24.';
				}
				return true;
			},
		});

		return parseInt(count);
	}

	static async promptCreateOrUse(): Promise<'c' | 'u'> {
		const { action } = await inquirer.prompt<{ action: 'c' | 'u' }>({
			type: 'list',
			name: 'action',
			message: 'Do you want to create new wallets or use existing ones?',
			choices: [
				{
					name: '🆕 Create New Wallets (WARNING: Old wallets will be replaced!)',
					value: 'c',
				},
				{
					name: '♻️  Use Existing Wallets',
					value: 'u',
				},
			],
		});

		return action;
	}

	static async promptTokenInfo(): Promise<{
		name: string;
		symbol: string;
		description: string;
		twitter: string;
		telegram: string;
		website: string;
		jitoTip: number;
	}> {
		console.clear();
		console.log('╔════════════════════════════════════════╗');
		console.log('║      🚀 Token Launch Information      ║');
		console.log('╚════════════════════════════════════════╝\n');

		const answers = await inquirer.prompt([
			{
				type: 'input',
				name: 'name',
				message: 'Token Name:',
				validate: (input: string) => {
					if (!input || input.trim().length === 0) {
						return 'Token name is required.';
					}
					return true;
				},
			},
			{
				type: 'input',
				name: 'symbol',
				message: 'Token Symbol (max 10 chars):',
				validate: (input: string) => {
					if (!input || input.trim().length === 0) {
						return 'Token symbol is required.';
					}
					if (input.length > 10) {
						return 'Symbol must be 10 characters or less.';
					}
					return true;
				},
			},
			{
				type: 'input',
				name: 'description',
				message: 'Token Description:',
			},
			{
				type: 'input',
				name: 'twitter',
				message: 'Twitter URL (optional, press Enter to skip):',
				default: '',
			},
			{
				type: 'input',
				name: 'telegram',
				message: 'Telegram URL (optional, press Enter to skip):',
				default: '',
			},
			{
				type: 'input',
				name: 'website',
				message: 'Website URL (optional, press Enter to skip):',
				default: '',
			},
			{
				type: 'input',
				name: 'jitoTip',
				message: 'Jito Tip Amount (SOL, recommended 0.05):',
				default: '0.05',
				validate: (input: string) => {
					const num = parseFloat(input);
					if (isNaN(num) || num <= 0) {
						return 'Please enter a valid positive number.';
					}
					return true;
				},
			},
		]);

		return {
			name: answers.name.trim(),
			symbol: answers.symbol.trim().substring(0, 10),
			description: answers.description.trim(),
			twitter: answers.twitter.trim(),
			telegram: answers.telegram.trim(),
			website: answers.website.trim(),
			jitoTip: parseFloat(answers.jitoTip),
		};
	}

	static async promptSellPercentage(): Promise<number> {
		const { percentage } = await inquirer.prompt<{ percentage: string }>({
			type: 'input',
			name: 'percentage',
			message: 'What percentage of supply do you want to sell? (0-100):',
			validate: (input: string) => {
				const num = parseFloat(input);
				if (isNaN(num) || num < 0 || num > 100) {
					return 'Please enter a number between 0 and 100.';
				}
				return true;
			},
		});

		return parseFloat(percentage);
	}

	static async promptJitoTip(): Promise<number> {
		const { tip } = await inquirer.prompt<{ tip: string }>({
			type: 'input',
			name: 'tip',
			message: 'Jito Tip Amount (SOL, e.g. 0.01):',
			default: '0.01',
			validate: (input: string) => {
				const num = parseFloat(input);
				if (isNaN(num) || num <= 0) {
					return 'Please enter a valid positive number.';
				}
				return true;
			},
		});

		return parseFloat(tip);
	}

	static async promptConfirm(message: string): Promise<boolean> {
		const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>({
			type: 'confirm',
			name: 'confirmed',
			message: message,
			default: false,
		});

		return confirmed;
	}

	static async showTestMenu(): Promise<TestMenuChoice> {
		console.clear();
		console.log('╔════════════════════════════════════════╗');
		console.log('║      🧪 Test & Validation Menu        ║');
		console.log('╚════════════════════════════════════════╝\n');

		const { action } = await inquirer.prompt<TestMenuChoice>({
			type: 'list',
			name: 'action',
			message: 'Choose a test option:',
			choices: [
				{
					name: '✅ Pre-Launch Validacija',
					value: 'validate',
				},
				{
					name: '💚 Health Check (RPC & Jito)',
					value: 'health',
				},
				{
					name: '📊 Provera Balansa',
					value: 'balance',
				},
				{
					name: '🔗 Test RPC Konekcije',
					value: 'rpc',
				},
				{
					name: '⬅️  Back to Main Menu',
					value: 'back',
				},
			],
		});

		return { action };
	}
}

