// Test setup file
// This runs before all tests

// Set default environment variables for tests if not already set
if (!process.env.HELIUS_API_KEY) {
  process.env.HELIUS_API_KEY = 'test-api-key-for-jest';
}
if (!process.env.NETWORK_MODE) {
  process.env.NETWORK_MODE = 'devnet';
}

// Increase timeout for Solana RPC calls
jest.setTimeout(30000);
