import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should navigate to dashboard', async ({ page }) => {
    await expect(page.getByText('Dashboard')).toBeVisible();
  });

  test('should navigate to launch page from sidebar', async ({ page }) => {
    const launchLink = page.getByRole('link', { name: /Launch Token/i });
    await launchLink.click();
    
    await expect(page).toHaveURL(/.*\/launch/);
    await expect(page.getByText('Launch Token')).toBeVisible();
  });

  test('should navigate to wallets page from sidebar', async ({ page }) => {
    const walletsLink = page.getByRole('link', { name: /Wallets/i });
    await walletsLink.click();
    
    await expect(page).toHaveURL(/.*\/wallets/);
    await expect(page.getByText('Wallet Management')).toBeVisible();
  });

  test('should navigate to sell page from sidebar', async ({ page }) => {
    const sellLink = page.getByRole('link', { name: /Sell Tokens/i });
    await sellLink.click();
    
    await expect(page).toHaveURL(/.*\/sell/);
    await expect(page.getByText('Sell Tokens')).toBeVisible();
  });

  test('should navigate to settings page from sidebar', async ({ page }) => {
    const settingsLink = page.getByRole('link', { name: /Settings/i });
    await settingsLink.click();
    
    await expect(page).toHaveURL(/.*\/settings/);
    await expect(page.getByText('Settings')).toBeVisible();
  });

  test('should navigate to launch page from dashboard', async ({ page }) => {
    const launchButton = page.getByRole('link', { name: /Launch Token/i });
    await launchButton.click();
    
    await expect(page).toHaveURL(/.*\/launch/);
  });

  test('should navigate to wallets page from dashboard', async ({ page }) => {
    const walletsButton = page.getByRole('link', { name: /Manage Wallets/i });
    await walletsButton.click();
    
    await expect(page).toHaveURL(/.*\/wallets/);
  });

  test('should navigate to sell page from dashboard', async ({ page }) => {
    const sellButton = page.getByRole('link', { name: /Sell Tokens/i });
    await sellButton.click();
    
    await expect(page).toHaveURL(/.*\/sell/);
  });
});
