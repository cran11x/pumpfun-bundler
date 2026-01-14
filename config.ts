import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import bs58 from "bs58";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// ============================================
// NETWORK CONFIGURATION
// ============================================
// Network mode: "mainnet" | "devnet"
// Set NETWORK_MODE in .env file to switch networks
export type NetworkMode = "mainnet" | "devnet";

// ⚠️ SECURITY: Never hardcode API keys. Always use environment variables.
const heliusApiKey = process.env.HELIUS_API_KEY;
if (!heliusApiKey) {
  throw new Error("HELIUS_API_KEY environment variable is required. Please set it in your .env file.");
}

// Helper function to read .env file and get NETWORK_MODE
function readNetworkModeFromEnv(): NetworkMode {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    // Match NETWORK_MODE=value (with optional whitespace and quotes)
    const match = envContent.match(/NETWORK_MODE\s*=\s*["']?([^"'\n\r]+)["']?/i);
    if (match && match[1]) {
      const networkValue = match[1].trim().toLowerCase();
      if (networkValue === "devnet") {
        return "devnet";
      }
    }
  }
  // Also check process.env in case it was set differently
  if (process.env.NETWORK_MODE === "devnet") {
    return "devnet";
  }
  return "mainnet";
}

// Generate RPC URL based on network mode
const getHeliusRpcUrl = (network: NetworkMode, apiKey: string): string => {
  if (network === "devnet") {
    return `https://devnet.helius-rpc.com/?api-key=${apiKey}`;
  }
  return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
};

// Function to get current network mode (always reads from .env)
export function getNetworkMode(): NetworkMode {
  return readNetworkModeFromEnv();
}

// Function to get current RPC URL (always reads from .env)
export function getRpcUrl(): string {
  const network = getNetworkMode();
  const defaultRpc = getHeliusRpcUrl(network, heliusApiKey);
  return process.env.HELIUS_RPC_URL || defaultRpc;
}

// For backward compatibility, export networkMode and rpc as getters
// But these will be computed values that read from .env each time
export const networkMode: NetworkMode = readNetworkModeFromEnv();
export const rpc: string = getRpcUrl();

// Log current network on startup
console.log(`🌐 Network: ${networkMode.toUpperCase()}`);
console.log(`🔗 RPC: ${rpc.substring(0, 50)}...`);

// Helper function to verify we're on devnet
export function isDevnet(): boolean {
  return getNetworkMode() === "devnet";
}

// Helper function to verify we're on mainnet
export function isMainnet(): boolean {
  return getNetworkMode() === "mainnet";
}

// ============================================
// WALLET CONFIGURATION
// ============================================
// ⚠️ WARNING: This file contains sensitive operations with private keys
// Never commit keypair files or expose private keys in version control

// PRIV KEY OF DEPLOYER - Using existing keypair for demo
// Main wallet is stored separately and never deleted when creating sub-wallets
let wallet: Keypair;
let payer: Keypair;

// Main wallet path - this file is NEVER deleted when creating sub-wallets
const mainWalletPath = "./src/keypairs/main-wallet.json";
const keypairPath = "./src/keypairs/keypair1.json"; // Fallback for backward compatibility

// Try to load main wallet first, then fallback to keypair1.json for backward compatibility
let walletLoaded = false;

if (fs.existsSync(mainWalletPath)) {
  try {
    const keypairData = JSON.parse(fs.readFileSync(mainWalletPath, "utf-8"));
    wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
    payer = Keypair.fromSecretKey(new Uint8Array(keypairData));
    walletLoaded = true;
    console.log(`✅ Loaded main wallet from ${mainWalletPath}`);
  } catch (error) {
    console.warn(`Failed to load main wallet from ${mainWalletPath}:`, error);
  }
}

// Fallback to keypair1.json for backward compatibility
if (!walletLoaded && fs.existsSync(keypairPath)) {
  try {
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
    payer = Keypair.fromSecretKey(new Uint8Array(keypairData));
    walletLoaded = true;
    console.log(`✅ Loaded wallet from ${keypairPath} (backward compatibility)`);
    
    // Migrate to main-wallet.json for future use
    try {
      const keypairsDir = path.dirname(mainWalletPath);
      if (!fs.existsSync(keypairsDir)) {
        fs.mkdirSync(keypairsDir, { recursive: true });
      }
      fs.writeFileSync(mainWalletPath, JSON.stringify(Array.from(wallet.secretKey)));
      console.log(`✅ Migrated wallet to ${mainWalletPath}`);
    } catch (error) {
      console.warn(`Failed to migrate wallet to ${mainWalletPath}:`, error);
    }
  } catch (error) {
    console.warn(`Failed to load wallet from ${keypairPath}:`, error);
  }
}

// If no wallet file exists, generate a new one and save it
if (!walletLoaded) {
  console.log(`⚠️  No wallet file found. Generating new main wallet...`);
  wallet = Keypair.generate();
  payer = Keypair.generate();
  
  // Save the new wallet to main-wallet.json
  try {
    const keypairsDir = path.dirname(mainWalletPath);
    if (!fs.existsSync(keypairsDir)) {
      fs.mkdirSync(keypairsDir, { recursive: true });
    }
    fs.writeFileSync(mainWalletPath, JSON.stringify(Array.from(wallet.secretKey)));
    console.log(`✅ Generated and saved new main wallet to ${mainWalletPath}`);
    console.log(`   Public Key: ${wallet.publicKey.toString()}`);
  } catch (error) {
    console.error(`❌ Failed to save new wallet to ${mainWalletPath}:`, error);
  }
}

export { wallet, payer };

// Function to generate a new main wallet (for Settings page)
export function generateNewMainWallet(): { wallet: Keypair; payer: Keypair; publicKey: string } {
  const newWallet = Keypair.generate();
  const newPayer = Keypair.generate();
  
  try {
    const keypairsDir = path.dirname(mainWalletPath);
    if (!fs.existsSync(keypairsDir)) {
      fs.mkdirSync(keypairsDir, { recursive: true });
    }
    fs.writeFileSync(mainWalletPath, JSON.stringify(Array.from(newWallet.secretKey)));
    console.log(`✅ Generated new main wallet: ${newWallet.publicKey.toString()}`);
    
    return {
      wallet: newWallet,
      payer: newPayer,
      publicKey: newWallet.publicKey.toString()
    };
  } catch (error) {
    console.error(`❌ Failed to save new main wallet:`, error);
    throw error;
  }
} 




/* DONT TOUCH ANYTHING BELOW THIS */

// Cached connection object that updates when network changes
let cachedConnection: Connection | null = null;
let cachedRpcUrl: string = "";

// Function to invalidate connection cache (call this when network changes)
export function invalidateConnectionCache(): void {
  cachedConnection = null;
  cachedRpcUrl = "";
}

// Function to get connection with current RPC URL (cached for performance)
export function getConnection(): Connection {
  const currentRpc = getRpcUrl();
  // Recreate connection if RPC URL changed
  if (!cachedConnection || cachedRpcUrl !== currentRpc) {
    cachedConnection = new Connection(currentRpc, "confirmed");
    cachedRpcUrl = currentRpc;
  }
  return cachedConnection;
}

// For backward compatibility, export connection (but it uses initial RPC)
// For new code, use getConnection() instead
export const connection = new Connection(rpc, "confirmed");

export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

export const RayLiqPoolv4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');

export const global = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");

export const mintAuthority = new PublicKey("TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM");

export const MPL_TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export const eventAuthority = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");

export const feeRecipient = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");