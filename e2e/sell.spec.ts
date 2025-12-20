import { test, expect } from '@playwright/test';

test.describe('Sell Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sell');
  });

  test('should display sell page', async ({ page }) => {
    await expect(page.getByText('Sell Tokens')).toBeVisible();
    await expect(page.getByText('Sell your tokens on Pump.Fun or Raydium')).toBeVisible();
  });

  test('should have platform toggle buttons', async ({ page }) => {
    const pumpfunButton = page.getByRole('button', { name: /Pump.Fun/i });
    const raydiumButton = page.getByRole('button', { name: /Raydium/i });
    
    await expect(pumpfunButton).toBeVisible();
    await expect(raydiumButton).toBeVisible();
  });

  test('should default to Pump.Fun platform', async ({ page }) => {
    const pumpfunButton = page.getByRole('button', { name: /Pump.Fun/i });
    await expect(pumpfunButton).toHaveClass(/bg-\[#00ff41\]/);
  });

  test('should switch to Raydium platform', async ({ page }) => {
    const raydiumButton = page.getByRole('button', { name: /Raydium/i });
    await raydiumButton.click();

    await expect(raydiumButton).toHaveClass(/bg-\[#00ff41\]/);
  });

  test('should show market ID input for Raydium', async ({ page }) => {
    const raydiumButton = page.getByRole('button', { name: /Raydium/i });
    await raydiumButton.click();

    await expect(page.getByLabel(/Market ID/i)).toBeVisible();
  });

  test('should have percentage slider', async ({ page }) => {
    const slider = page.getByLabel(/Sell Percentage/i);
    await expect(slider).toBeVisible();
  });

  test('should disable sell button for Raydium without market ID', async ({ page }) => {
    const raydiumButton = page.getByRole('button', { name: /Raydium/i });
    await raydiumButton.click();

    const sellButton = page.getByRole('button', { name: /Sell/i });
    await expect(sellButton).toBeDisabled();
  });

  test('should enable sell button for Pump.Fun', async ({ page }) => {
    const sellButton = page.getByRole('button', { name: /Sell/i });
    await expect(sellButton).not.toBeDisabled();
  });

  test('should enable sell button for Raydium with market ID', async ({ page }) => {
    const raydiumButton = page.getByRole('button', { name: /Raydium/i });
    await raydiumButton.click();

    await page.getByLabel(/Market ID/i).fill('test-market-id');

    const sellButton = page.getByRole('button', { name: /Sell/i });
    await expect(sellButton).not.toBeDisabled();
  });
});
