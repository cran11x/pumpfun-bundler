import { Keypair } from '@solana/web3.js';
import { config } from './config';
import { geyserClient as jitoGeyserClient } from 'jito-ts';

import {
  SearcherClient,
  searcherClient as jitoSearcherClient,
} from 'jito-ts/dist/sdk/block-engine/searcher.js';
import * as fs from 'fs';

const BLOCK_ENGINE_URLS = config.get('block_engine_urls');
const AUTH_KEYPAIR_PATH = config.get('auth_keypair_path');

const GEYSER_URL = config.get('geyser_url');
const GEYSER_ACCESS_TOKEN = config.get('geyser_access_token');

let keypair: Keypair;
try {
  if (!fs.existsSync(AUTH_KEYPAIR_PATH)) {
    console.error(`⚠️  Jito Auth Keypair not found at ${AUTH_KEYPAIR_PATH}. Jito functionality will fail on Mainnet.`);
    throw new Error(`Jito Auth Keypair not found at ${AUTH_KEYPAIR_PATH}`);
  }
  const decodedKey = new Uint8Array(
    JSON.parse(fs.readFileSync(AUTH_KEYPAIR_PATH).toString()) as number[],
  );
  keypair = Keypair.fromSecretKey(decodedKey);
} catch (error: any) {
  console.error(`❌ Failed to load Jito Auth Keypair: ${error.message}`);
  // Use a random keypair so the app doesn't crash on import, but Jito auth will fail later
  keypair = Keypair.generate();
}

export const privateKey = keypair

const searcherClients: SearcherClient[] = [];

for (const url of BLOCK_ENGINE_URLS) {
  const client = jitoSearcherClient(url, keypair, {
    'grpc.keepalive_timeout_ms': 4000,
  });
  searcherClients.push(client);
}

const geyserClient = jitoGeyserClient(GEYSER_URL, GEYSER_ACCESS_TOKEN, {
  'grpc.keepalive_timeout_ms': 4000,
});

// all bundles sent get automatically forwarded to the other regions.
// assuming the first block engine in the array is the closest one
const searcherClient = searcherClients[0];

export { searcherClient, searcherClients, geyserClient };