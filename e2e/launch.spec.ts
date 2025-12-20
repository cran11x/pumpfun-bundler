import { test, expect } from '@playwright/test';

test.describe('Launch Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/launch');
  });

  test('should display launch page', async ({ page }) => {
    await expect(page.getByText('Launch Token')).toBeVisible();
    await expect(page.getByText('Create and launch your token on Pump.Fun')).toBeVisible();
  });

  test('should have all required form fields', async ({ page }) => {
    await expect(page.getByLabel(/Token Name/i)).toBeVisible();
    await expect(page.getByLabel(/Symbol/i)).toBeVisible();
    await expect(page.getByLabel(/Description/i)).toBeVisible();
    await expect(page.getByLabel(/Jito Tip/i)).toBeVisible();
    await expect(page.getByLabel(/Token Image/i)).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    const submitButton = page.getByRole('button', { name: /Launch Token/i });
    await submitButton.click();

    // HTML5 validation should show
    const nameInput = page.getByLabel(/Token Name/i);
    const validity = await nameInput.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(validity).toBe(false);
  });

  test('should enable submit button when form is valid', async ({ page }) => {
    // Fill in required fields
    await page.getByLabel(/Token Name/i).fill('Test Token');
    await page.getByLabel(/Symbol/i).fill('TEST');
    await page.getByLabel(/Description/i).fill('Test description');

    // Upload a test image
    const fileInput = page.getByLabel(/Token Image/i).locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake image data'),
    });

    const submitButton = page.getByRole('button', { name: /Launch Token/i });
    await expect(submitButton).not.toBeDisabled();
  });

  test('should show optional social link fields', async ({ page }) => {
    await expect(page.getByLabel(/Twitter URL/i)).toBeVisible();
    await expect(page.getByLabel(/Telegram URL/i)).toBeVisible();
    await expect(page.getByLabel(/Website URL/i)).toBeVisible();
  });
});
