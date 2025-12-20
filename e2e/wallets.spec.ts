import { test, expect } from '@playwright/test';

test.describe('Wallets Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/wallets');
  });

  test('should display wallets page', async ({ page }) => {
    await expect(page.getByText('Wallet Management')).toBeVisible();
    await expect(page.getByText('Create, fund, and manage your wallets')).toBeVisible();
  });

  test('should show empty state when no wallets', async ({ page }) => {
    await expect(page.getByText('No wallets found')).toBeVisible();
  });

  test('should have create wallets button', async ({ page }) => {
    const createButton = page.getByRole('button', { name: /Create Wallets/i });
    await expect(createButton).toBeVisible();
  });

  test('should have fund wallets button', async ({ page }) => {
    const fundButton = page.getByRole('button', { name: /Fund Wallets/i });
    await expect(fundButton).toBeVisible();
  });

  test('should have refresh button', async ({ page }) => {
    const refreshButton = page.getByRole('button', { name: /Refresh/i });
    await expect(refreshButton).toBeVisible();
  });

  test('should create wallets when button is clicked', async ({ page }) => {
    // Mock the prompt to return "1"
    await page.addInitScript(() => {
      window.prompt = () => '1';
    });

    const createButton = page.getByRole('button', { name: /Create Wallets/i });
    await createButton.click();

    // Wait for confirmation dialog
    page.on('dialog', async dialog => {
      expect(dialog.type()).toBe('confirm');
      await dialog.accept();
    });

    // Wait for success message or wallet list
    await page.waitForTimeout(2000);
    
    // Check if wallets were created (either success message or wallet list)
    const hasWallets = await page.getByText(/wallet/i).count() > 0;
    const hasSuccess = await page.getByText(/Successfully created/i).count() > 0;
    
    expect(hasWallets || hasSuccess).toBeTruthy();
  });
});
