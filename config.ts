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



// ⚠️ WARNING: This file contains sensitive operations with private keys
// Never commit keypair files or expose private keys in version control

// PRIV KEY OF DEPLOYER - Using existing keypair for demo
const keypairData = JSON.parse(fs.readFileSync("./src/keypairs/keypair1.json", "utf-8"));
export const wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));


// PRIV KEY OF FEEPAYER - Using same keypair for demo (you should use different keypairs)
export const payer = Keypair.fromSecretKey(new Uint8Array(keypairData));


// RPC endpoint - Read from environment variable or use fallback
// Set HELIUS_RPC_URL in your .env file: HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
const defaultRpc = "https://mainnet.helius-rpc.com/?api-key=abc6870c-9384-4fcd-9eb1-f8865d035b43";
export const rpc = process.env.HELIUS_RPC_URL || defaultRpc; 




/* DONT TOUCH ANYTHING BELOW THIS */

export const connection = new Connection(rpc, "confirmed");

export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

export const RayLiqPoolv4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');

export const global = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");

export const mintAuthority = new PublicKey("TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM");

export const MPL_TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export const eventAuthority = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");

export const feeRecipient = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");