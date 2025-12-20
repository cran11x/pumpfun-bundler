import request from 'supertest';
import { createTestApp } from './helpers';

describe('Health Check API', () => {
  const app = createTestApp();

  test('GET /api/health should return health status', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body).toHaveProperty('rpc');
    expect(response.body).toHaveProperty('jito');
    expect(response.body).toHaveProperty('network');
    expect(response.body).toHaveProperty('slot');
    expect(response.body).toHaveProperty('errors');
    expect(typeof response.body.rpc).toBe('boolean');
    expect(typeof response.body.jito).toBe('boolean');
    expect(['mainnet', 'devnet', 'unknown']).toContain(response.body.network);
  });

  test('GET /api/health should handle errors gracefully', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    // Should always return a response, even if there are errors
    expect(response.body).toBeDefined();
    expect(Array.isArray(response.body.errors)).toBe(true);
  });
});
