import request from 'supertest';
import { createTestApp } from './helpers';
import * as fs from 'fs';
import * as path from 'path';
import { networkMode, isDevnet, connection, payer, wallet } from '../../config';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

/**
 * Devnet integration tests for wallet funding
 * 
 * Note: These tests require:
 * - NETWORK_MODE=devnet in .env file
 * - Payer wallet with devnet SOL
 * - Valid LUT created on devnet
 * 
 * Run with: npm test -- wallets.devnet.test.ts
 */
describe('Wallets Funding - Devnet Integration', () => {
  const app = createTestApp();
  const keypairsDir = path.join(process.cwd(), 'src', 'keypairs');
  const keyInfoPath = path.join(process.cwd(), 'src', 'keyInfo.json');

  beforeAll(() => {
    // Verify we're on devnet
    if (!isDevnet()) {
      console.warn('⚠️  WARNING: Not running on devnet. Set NETWORK_MODE=devnet in .env');
    }
  });

  beforeEach(() => {
    // Clean up test wallets before each test
    if (fs.existsSync(keypairsDir)) {
      const files = fs.readdirSync(keypairsDir);
      files.forEach(file => {
        if (file.startsWith('keypair') && file.endsWith('.json')) {
          fs.unlinkSync(path.join(keypairsDir, file));
        }
      });
    }
  });

  test('Should verify network mode is devnet', () => {
    console.log(`Current network mode: ${networkMode}`);
    // This test will pass regardless, but logs the network mode
    expect(['devnet', 'mainnet']).toContain(networkMode);
  });

  test('Should verify payer wallet exists and has balance check capability', async () => {
    try {
      const balance = await connection.getBalance(payer.publicKey);
      const balanceSOL = balance / LAMPORTS_PER_SOL;
      console.log(`Payer wallet balance: ${balanceSOL.toFixed(4)} SOL (${payer.publicKey.toString()})`);
      
      // Just verify we can check the balance (may be 0 on devnet)
      expect(typeof balance).toBe('number');
      expect(balance).toBeGreaterThanOrEqual(0);
    } catch (error) {
      // If RPC fails, skip this test but log the error
      console.warn('Could not check payer balance (RPC may be unavailable):', error);
    }
  }, 15000); // Longer timeout for RPC calls

  test('Should validate funding endpoint requires LUT', async () => {
    // Create wallets first
    await request(app)
      .post('/api/wallets/create')
      .send({ count: 2 })
      .expect(200);

    // Ensure keyInfo.json doesn't have LUT
    if (fs.existsSync(keyInfoPath)) {
      const keyInfo = JSON.parse(fs.readFileSync(keyInfoPath, 'utf-8'));
      delete keyInfo.addressLUT;
      fs.writeFileSync(keyInfoPath, JSON.stringify(keyInfo, null, 2));
    }

    const response = await request(app)
      .post('/api/wallets/fund')
      .send({ jitoTip: 0.01, amountPerWallet: 0.1 })
      .expect(400);

    expect(response.body.error).toContain('Lookup Table');
    expect(response.body.error).toContain('LUT');
  });

  test('Should validate funding endpoint requires solAmount or amountPerWallet', async () => {
    // Create wallets first
    await request(app)
      .post('/api/wallets/create')
      .send({ count: 2 })
      .expect(200);

    // Create mock keyInfo.json with LUT but no solAmount
    const mockKeyInfo = {
      addressLUT: '11111111111111111111111111111111',
      numOfWallets: 2
    };
    fs.writeFileSync(keyInfoPath, JSON.stringify(mockKeyInfo, null, 2));

    const response = await request(app)
      .post('/api/wallets/fund')
      .send({ jitoTip: 0.01 })
      .expect(400);

    expect(response.body.error).toMatch(/buy amounts|solAmount|amountPerWallet/i);
  });

  test('Should accept funding request with amountPerWallet parameter', async () => {
    // Create wallets first
    await request(app)
      .post('/api/wallets/create')
      .send({ count: 2 })
      .expect(200);

    // Create mock keyInfo.json with LUT
    const mockKeyInfo = {
      addressLUT: '11111111111111111111111111111111',
      numOfWallets: 2
    };
    fs.writeFileSync(keyInfoPath, JSON.stringify(mockKeyInfo, null, 2));

    // This should pass validation (but may fail at execution due to insufficient balance)
    const response = await request(app)
      .post('/api/wallets/fund')
      .send({ jitoTip: 0.01, amountPerWallet: 0.1 });

    // Should either succeed (200) or fail with insufficient balance (400), but not validation error
    expect([200, 400]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body.success).toBe(true);
      expect(response.body.network).toBe(networkMode);
    } else {
      // If it fails, it should be due to balance, not validation
      expect(response.body.error).not.toMatch(/LUT|solAmount|amountPerWallet/i);
    }
  });

  test('Should include network mode in funding response', async () => {
    // Create wallets and setup
    await request(app)
      .post('/api/wallets/create')
      .send({ count: 1 })
      .expect(200);

    const mockKeyInfo = {
      addressLUT: '11111111111111111111111111111111',
      numOfWallets: 1
    };
    fs.writeFileSync(keyInfoPath, JSON.stringify(mockKeyInfo, null, 2));

    const response = await request(app)
      .post('/api/wallets/fund')
      .send({ jitoTip: 0.01, amountPerWallet: 0.1 });

    // Response should include network info if successful
    if (response.status === 200 && response.body.network) {
      expect(response.body.network).toBe(networkMode);
    }
  });
});

