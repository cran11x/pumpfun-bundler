import request from 'supertest';
import { createTestApp } from './helpers';

describe('Config API', () => {
  const app = createTestApp();
  const originalRpcUrl = process.env.HELIUS_RPC_URL;
  const originalJitoUrl = process.env.BLOCKENGINEURL;

  afterEach(() => {
    // Restore original env vars
    if (originalRpcUrl) {
      process.env.HELIUS_RPC_URL = originalRpcUrl;
    }
    if (originalJitoUrl) {
      process.env.BLOCKENGINEURL = originalJitoUrl;
    }
  });

  test('GET /api/config should return current config', async () => {
    const response = await request(app)
      .get('/api/config')
      .expect(200);

    expect(response.body).toHaveProperty('rpcUrl');
    expect(response.body).toHaveProperty('jitoUrl');
    expect(typeof response.body.rpcUrl).toBe('string');
    expect(typeof response.body.jitoUrl).toBe('string');
  });

  test('PUT /api/config should update config', async () => {
    const response = await request(app)
      .put('/api/config')
      .send({
        rpcUrl: 'https://test-rpc-url.com',
        jitoUrl: 'test-jito-url.com'
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.config.rpcUrl).toBe('https://test-rpc-url.com');
    expect(response.body.config.jitoUrl).toBe('test-jito-url.com');
  });

  test('PUT /api/config should update only rpcUrl', async () => {
    const response = await request(app)
      .put('/api/config')
      .send({
        rpcUrl: 'https://test-rpc-url-2.com'
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.config.rpcUrl).toBe('https://test-rpc-url-2.com');
  });

  test('PUT /api/config should update only jitoUrl', async () => {
    const response = await request(app)
      .put('/api/config')
      .send({
        jitoUrl: 'test-jito-url-2.com'
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.config.jitoUrl).toBe('test-jito-url-2.com');
  });
});
