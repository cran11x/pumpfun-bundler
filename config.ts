import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import bs58 from "bs58";
import * as fs from "fs";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// ============================================
// NETWORK CONFIGURATION
// ============================================
// Network mode: "mainnet" | "devnet"
// Set NETWORK_MODE in .env file to switch networks
export type NetworkMode = "mainnet" | "devnet";

const heliusApiKey = process.env.HELIUS_API_KEY || "aad77f97-2471-47d4-ba2d-af877586f97e";

// Determine network mode from environment
export const networkMode: NetworkMode = (process.env.NETWORK_MODE === "devnet") ? "devnet" : "mainnet";

// Generate RPC URL based on network mode
const getHeliusRpcUrl = (network: NetworkMode, apiKey: string): string => {
  if (network === "devnet") {
    return `https://devnet.helius-rpc.com/?api-key=${apiKey}`;
  }
  return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
};

// RPC endpoint - Can be overridden with HELIUS_RPC_URL env var
const defaultRpc = getHeliusRpcUrl(networkMode, heliusApiKey);
export const rpc = process.env.HELIUS_RPC_URL || defaultRpc;

// Log current network on startup
console.log(`🌐 Network: ${networkMode.toUpperCase()}`);
console.log(`🔗 RPC: ${rpc.substring(0, 50)}...`);

// Helper function to verify we're on devnet
export function isDevnet(): boolean {
  return networkMode === "devnet";
}

// Helper function to verify we're on mainnet
export function isMainnet(): boolean {
  return networkMode === "mainnet";
}

// Helper function to get network mode with validation
export function getNetworkMode(): NetworkMode {
  return networkMode;
}

// ============================================
// WALLET CONFIGURATION
// ============================================
// ⚠️ WARNING: This file contains sensitive operations with private keys
// Never commit keypair files or expose private keys in version control

// PRIV KEY OF DEPLOYER - Using existing keypair for demo
// For tests, use a generated keypair if file doesn't exist
let wallet: Keypair;
let payer: Keypair;

const keypairPath = "./src/keypairs/keypair1.json";
if (fs.existsSync(keypairPath)) {
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
  payer = Keypair.fromSecretKey(new Uint8Array(keypairData));
} else {
  // For tests or when keypair file doesn't exist, generate a new keypair
  wallet = Keypair.generate();
  payer = Keypair.generate();
}

export { wallet, payer }; 




/* DONT TOUCH ANYTHING BELOW THIS */

export const connection = new Connection(rpc, "confirmed");

export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

export const RayLiqPoolv4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');

export const global = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");

export const mintAuthority = new PublicKey("TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM");

export const MPL_TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export const eventAuthority = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");

export const feeRecipient = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");