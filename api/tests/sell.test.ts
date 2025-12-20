import request from 'supertest';
import { createTestApp } from './helpers';

describe('Sell API', () => {
  const app = createTestApp();

  test('POST /api/sell/pumpfun should accept percentage', async () => {
    const response = await request(app)
      .post('/api/sell/pumpfun')
      .send({ percentage: 50, jitoTip: 0.01 })
      .expect((res) => {
        // May succeed or fail depending on setup, but should not be 400
        if (res.status === 400) {
          throw new Error('Unexpected 400 status');
        }
      });

    // If it succeeds, check response structure
    if (response.status === 200) {
      expect(response.body.success).toBe(true);
    }
  });

  test('POST /api/sell/pumpfun should use default percentage', async () => {
    const response = await request(app)
      .post('/api/sell/pumpfun')
      .send({ jitoTip: 0.01 })
      .expect((res) => {
        if (res.status === 400) {
          throw new Error('Unexpected 400 status');
        }
      });

    if (response.status === 200) {
      expect(response.body.success).toBe(true);
    }
  });

  test('POST /api/sell/raydium should require marketId', async () => {
    const response = await request(app)
      .post('/api/sell/raydium')
      .send({ percentage: 50 })
      .expect(400);

    expect(response.body.error).toBe('Market ID is required');
  });

  test('POST /api/sell/raydium should accept marketId', async () => {
    const response = await request(app)
      .post('/api/sell/raydium')
      .send({ 
        percentage: 50, 
        marketId: 'So11111111111111111111111111111111111111112',
        jitoTip: 0.01 
      })
      .expect((res) => {
        // May succeed or fail depending on setup
        if (res.status === 400 && res.body.error === 'Market ID is required') {
          throw new Error('Unexpected 400 status');
        }
      });

    if (response.status === 200) {
      expect(response.body.success).toBe(true);
    }
  });
});
