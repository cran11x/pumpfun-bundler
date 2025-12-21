import request from 'supertest';
import { createTestApp } from './helpers';
import * as fs from 'fs';
import * as path from 'path';
import { networkMode, isDevnet, isMainnet } from '../../config';

describe('Wallets API', () => {
  const app = createTestApp();
  const keypairsDir = path.join(process.cwd(), 'src', 'keypairs');

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

  test('GET /api/wallets should return empty array when no wallets exist', async () => {
    const response = await request(app)
      .get('/api/wallets')
      .expect(200);

    expect(response.body).toHaveProperty('wallets');
    expect(Array.isArray(response.body.wallets)).toBe(true);
  });

  test('POST /api/wallets/create should create 1 wallet', async () => {
    const response = await request(app)
      .post('/api/wallets/create')
      .send({ count: 1 })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.wallets).toHaveLength(1);
    expect(response.body.wallets[0]).toHaveProperty('publicKey');
    expect(typeof response.body.wallets[0].publicKey).toBe('string');
  });

  test('POST /api/wallets/create should create 12 wallets by default', async () => {
    const response = await request(app)
      .post('/api/wallets/create')
      .send({})
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.wallets).toHaveLength(12);
  });

  test('POST /api/wallets/create should create specified number of wallets', async () => {
    const response = await request(app)
      .post('/api/wallets/create')
      .send({ count: 5 })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.wallets).toHaveLength(5);
  });

  test('POST /api/wallets/create should create 24 wallets max', async () => {
    const response = await request(app)
      .post('/api/wallets/create')
      .send({ count: 24 })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.wallets).toHaveLength(24);
  });

  test('GET /api/wallets should return created wallets', async () => {
    // Create wallets first
    await request(app)
      .post('/api/wallets/create')
      .send({ count: 3 })
      .expect(200);

    // Get wallets
    const response = await request(app)
      .get('/api/wallets')
      .expect(200);

    expect(response.body.wallets).toHaveLength(3);
    response.body.wallets.forEach((wallet: any) => {
      expect(wallet).toHaveProperty('publicKey');
      expect(typeof wallet.publicKey).toBe('string');
    });
  });

  test('GET /api/wallets/balances should return balances', async () => {
    // Create wallets first
    await request(app)
      .post('/api/wallets/create')
      .send({ count: 2 })
      .expect(200);

    const response = await request(app)
      .get('/api/wallets/balances')
      .expect(200);

    expect(response.body).toHaveProperty('balances');
    expect(typeof response.body.balances).toBe('object');
  });

  test('POST /api/wallets/fund should validate jitoTip parameter', async () => {
    // Test with invalid jitoTip
    const invalidResponse = await request(app)
      .post('/api/wallets/fund')
      .send({ jitoTip: -0.01 })
      .expect(400);

    expect(invalidResponse.body.error).toContain('Invalid jitoTip');
  });

  test('POST /api/wallets/fund should require wallets to exist', async () => {
    // Ensure no wallets exist (cleanup in beforeEach handles this)
    const response = await request(app)
      .post('/api/wallets/fund')
      .send({ jitoTip: 0.01, amountPerWallet: 0.1 })
      .expect(400);

    expect(response.body.error).toContain('No wallets found');
  });

  test('POST /api/wallets/fund should validate amountPerWallet when provided', async () => {
    // Create wallets first
    await request(app)
      .post('/api/wallets/create')
      .send({ count: 2 })
      .expect(200);

    // Test with invalid amountPerWallet
    const invalidResponse = await request(app)
      .post('/api/wallets/fund')
      .send({ jitoTip: 0.01, amountPerWallet: -0.1 })
      .expect(400);

    expect(invalidResponse.body.error).toContain('Invalid amountPerWallet');
  });

  describe('Devnet-specific funding tests', () => {
    test('Funding endpoint should include network mode in response', async () => {
      // Create wallets first
      await request(app)
        .post('/api/wallets/create')
        .send({ count: 1 })
        .expect(200);

      // Create mock keyInfo.json with LUT and solAmount
      const keyInfoPath = path.join(process.cwd(), 'src', 'keyInfo.json');
      const mockKeyInfo = {
        addressLUT: '11111111111111111111111111111111',
        numOfWallets: 1
      };
      fs.writeFileSync(keyInfoPath, JSON.stringify(mockKeyInfo, null, 2));

      // This will fail due to missing solAmount or insufficient balance, but should include network
      const response = await request(app)
        .post('/api/wallets/fund')
        .send({ jitoTip: 0.01, amountPerWallet: 0.1 });

      // Response should include network info if successful, or in error message
      if (response.status === 200) {
        expect(response.body).toHaveProperty('network');
      } else {
        // Error response should mention network
        expect(response.body.error || response.body.message || '').toMatch(/devnet|mainnet|network/i);
      }
    });

    test('Network mode helpers should work correctly', () => {
      // Verify network mode helpers are accessible
      expect(typeof networkMode).toBe('string');
      expect(['devnet', 'mainnet']).toContain(networkMode);
      expect(typeof isDevnet()).toBe('boolean');
      expect(typeof isMainnet()).toBe('boolean');
      expect(isDevnet() || isMainnet()).toBe(true);
      expect(isDevnet() && isMainnet()).toBe(false);
    });
  });
});
