import { test, expect } from '@playwright/test';

test.describe('UI Polish & Responsive Layouts (U01, U02, U13, U14)', () => {
  test('toggles dark theme and verifies HTML dark class', async ({ page }) => {
    await page.goto('/');
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();

    const initialDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));

    await themeToggle.click();
    const updatedDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(updatedDark).not.toBe(initialDark);

    // Toggle back
    await themeToggle.click();
    const revertedDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(revertedDark).toBe(initialDark);
  });

  test('opens and closes command palette via keyboard shortcut', async ({ page }) => {
    // 1. Register and land on dashboard where AppShell and CommandPalette are mounted
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    await page.goto('/register');
    await page.fill('input#reg-email', `palette_${uniqueId}@example.com`);
    await page.fill('input#reg-password', 'Password123!@#');
    await page.fill('input#confirm-password', 'Password123!@#');
    await page.locator('[data-testid="register-form"]').locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/.*dashboard/);

    // Trigger Cmd+K or Ctrl+K
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');

    const commandPalette = page.locator('[data-testid="command-palette"]');
    await expect(commandPalette).toBeVisible({ timeout: 6000 });

    // Press Escape to dismiss
    await page.keyboard.press('Escape');
    await expect(commandPalette).not.toBeVisible();
  });

  test('displays custom 404 page with not-found testid for unknown routes', async ({ page }) => {
    await page.goto('/some-completely-invalid-route-404');
    await expect(page.locator('[data-testid="not-found"]')).toBeVisible();
    await expect(page.getByText('Page Not Found')).toBeVisible();
  });

  test('maintains responsive layout without horizontal scroll at 390px mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const routes = ['/', '/login', '/register'];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    }
  });
});
