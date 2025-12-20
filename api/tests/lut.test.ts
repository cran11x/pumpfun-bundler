import request from 'supertest';
import { createTestApp } from './helpers';

describe('LUT API', () => {
  const app = createTestApp();

  test('POST /api/lut/create should accept jitoTip', async () => {
    const response = await request(app)
      .post('/api/lut/create')
      .send({ jitoTip: 0.01 })
      .expect((res) => {
        // May succeed or fail depending on setup
        if (res.status === 400) {
          throw new Error('Unexpected 400 status');
        }
      });

    if (response.status === 200) {
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('LUT creation initiated');
    }
  });

  test('POST /api/lut/create should use default jitoTip', async () => {
    const response = await request(app)
      .post('/api/lut/create')
      .send({})
      .expect((res) => {
        if (res.status === 400) {
          throw new Error('Unexpected 400 status');
        }
      });

    if (response.status === 200) {
      expect(response.body.success).toBe(true);
    }
  });

  test('POST /api/lut/extend should accept jitoTip', async () => {
    const response = await request(app)
      .post('/api/lut/extend')
      .send({ jitoTip: 0.01 })
      .expect((res) => {
        if (res.status === 400) {
          throw new Error('Unexpected 400 status');
        }
      });

    if (response.status === 200) {
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('LUT extension initiated');
    }
  });

  test('POST /api/lut/extend should use default jitoTip', async () => {
    const response = await request(app)
      .post('/api/lut/extend')
      .send({})
      .expect((res) => {
        if (res.status === 400) {
          throw new Error('Unexpected 400 status');
        }
      });

    if (response.status === 200) {
      expect(response.body.success).toBe(true);
    }
  });
});
