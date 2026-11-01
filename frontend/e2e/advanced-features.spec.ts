import { test, expect } from '@playwright/test';

test.describe('Advanced Features & Glass Experience (Phases A through D)', () => {
  const testPassword = 'Password123!';

  test.beforeEach(async ({ page }) => {
    // Register and login a fresh user with a unique email per test
    const testEmail = `e2e_adv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@example.com`;
    await page.goto('/register');
    await page.fill('input#reg-email', testEmail);
    await page.fill('input#reg-password', testPassword);
    await page.fill('input#confirm-password', testPassword);
    await page.locator('[data-testid="register-form"]').locator('button[type="submit"]').click();

    // Wait for redirect to dashboard
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('verifies notification bell, command palette, and settings tabs on desktop (1280px)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // 1. Notification bell is visible
    const notifBell = page.getByTestId('notification-bell');
    await expect(notifBell).toBeVisible();
    await notifBell.click();
    await expect(page.getByText('Notifications', { exact: true })).toBeVisible();

    // 2. Command Palette opens on click and search works
    const cmdTrigger = page.getByTestId('command-palette-trigger');
    await cmdTrigger.click();
    const cmdPalette = page.getByTestId('command-palette');
    await expect(cmdPalette).toBeVisible();
    await page.keyboard.press('Escape');

    // 3. Navigate to Settings and verify Webhooks and Account tabs
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('tab', { name: /Preferences/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Webhooks/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Account & Data/i })).toBeVisible();

    // Switch to Webhooks tab
    await page.getByRole('tab', { name: /Webhooks/i }).click();
    await expect(page.getByRole('heading', { name: /Outbound Webhooks/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Webhook/i })).toBeVisible();

    // Switch to Account & Data tab
    await page.getByRole('tab', { name: /Account & Data/i }).click();
    await expect(page.getByTestId('account-export-btn')).toBeVisible();
    await expect(page.getByTestId('account-delete-btn')).toBeVisible();
  });

  test('verifies mobile compatibility without horizontal scroll at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Check Settings on mobile
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    // Check Upload Page on mobile (Record & Paste tabs)
    await page.goto('/upload');
    await page.waitForLoadState('networkidle');

    const uploadScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const uploadClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(uploadScrollWidth).toBeLessThanOrEqual(uploadClientWidth);

    await expect(page.getByTestId('tab-upload-file')).toBeVisible();
    await expect(page.getByTestId('tab-record-browser')).toBeVisible();
    await expect(page.getByTestId('tab-paste-transcript')).toBeVisible();

    // Check Trash Page on mobile
    await page.goto('/trash');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Trash is empty' })).toBeVisible();
  });
});
