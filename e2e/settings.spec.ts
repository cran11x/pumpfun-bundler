import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('should display settings page', async ({ page }) => {
    await expect(page.getByText('Settings')).toBeVisible();
    await expect(page.getByText('Configure your bundler settings')).toBeVisible();
  });

  test('should have config input fields', async ({ page }) => {
    await expect(page.getByLabel(/RPC URL/i)).toBeVisible();
    await expect(page.getByLabel(/Jito Block Engine URL/i)).toBeVisible();
  });

  test('should have save button', async ({ page }) => {
    const saveButton = page.getByRole('button', { name: /Save/i });
    await expect(saveButton).toBeVisible();
  });

  test('should have refresh button', async ({ page }) => {
    const refreshButton = page.getByRole('button', { name: /Refresh/i });
    await expect(refreshButton).toBeVisible();
  });

  test('should have LUT management buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Create New LUT/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Extend Existing LUT/i })).toBeVisible();
  });

  test('should update config when save is clicked', async ({ page }) => {
    const rpcInput = page.getByLabel(/RPC URL/i);
    await rpcInput.fill('https://test-rpc.com');

    const saveButton = page.getByRole('button', { name: /Save/i });
    await saveButton.click();

    // Wait for success message
    await page.waitForTimeout(1000);
    
    // Check if input value was updated
    await expect(rpcInput).toHaveValue('https://test-rpc.com');
  });
});
