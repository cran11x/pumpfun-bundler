import request from 'supertest';
import { createTestApp } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

describe('Launch API', () => {
  const app = createTestApp();

  // Create a test image file
  const createTestImage = () => {
    const testImagePath = path.join(__dirname, 'test-image.jpg');
    // Create a minimal valid JPEG (1x1 pixel)
    const jpegHeader = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
      0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
      0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
      0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
      0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xFF, 0xC4,
      0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x0C,
      0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0x80, 0xFF, 0xD9
    ]);
    fs.writeFileSync(testImagePath, jpegHeader);
    return testImagePath;
  };

  afterEach(() => {
    // Clean up test image
    const testImagePath = path.join(__dirname, 'test-image.jpg');
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  test('POST /api/launch should require image', async () => {
    const response = await request(app)
      .post('/api/launch')
      .field('name', 'Test Token')
      .field('symbol', 'TEST')
      .field('description', 'Test description')
      .expect(400);

    expect(response.body.error).toBe('Image is required');
  });

  test('POST /api/launch should require name, symbol, and description', async () => {
    const testImagePath = createTestImage();

    const response = await request(app)
      .post('/api/launch')
      .attach('image', testImagePath)
      .field('name', 'Test Token')
      // Missing symbol and description
      .expect(400);

    expect(response.body.error).toContain('required');
  });

  test('POST /api/launch should accept valid token data', async () => {
    const testImagePath = createTestImage();

    const response = await request(app)
      .post('/api/launch')
      .attach('image', testImagePath)
      .field('name', 'Test Token')
      .field('symbol', 'TEST')
      .field('description', 'Test description')
      .field('jitoTip', '0.05')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('name', 'Test Token');
    expect(response.body.data).toHaveProperty('symbol', 'TEST');
    expect(response.body.data).toHaveProperty('description', 'Test description');
  });

  test('POST /api/launch should accept optional social links', async () => {
    const testImagePath = createTestImage();

    const response = await request(app)
      .post('/api/launch')
      .attach('image', testImagePath)
      .field('name', 'Test Token')
      .field('symbol', 'TEST')
      .field('description', 'Test description')
      .field('twitter', 'https://twitter.com/test')
      .field('telegram', 'https://t.me/test')
      .field('website', 'https://test.com')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.twitter).toBe('https://twitter.com/test');
    expect(response.body.data.telegram).toBe('https://t.me/test');
    expect(response.body.data.website).toBe('https://test.com');
  });
});
