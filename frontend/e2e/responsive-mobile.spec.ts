import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 360, height: 740, name: 'Android Small (360px)' },
  { width: 390, height: 844, name: 'iPhone 14 (390px)' },
  { width: 430, height: 932, name: 'iPhone 15 Pro Max (430px)' },
  { width: 768, height: 1024, name: 'iPad (768px)' },
  { width: 1024, height: 768, name: 'Tablet Landscape (1024px)' },
  { width: 1440, height: 900, name: 'MacBook Desktop (1440px)' },
];

test.describe('Responsive & Mobile Glass Layout Pass', () => {
  for (const vp of VIEWPORTS) {
    test(`verifies zero horizontal overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // Check Landing Page
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const landingScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const landingClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(landingScrollWidth).toBeLessThanOrEqual(landingClientWidth);

      // Check Login Page
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      const loginScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const loginClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(loginScrollWidth).toBeLessThanOrEqual(loginClientWidth);

      // Check Register Page
      await page.goto('/register');
      await page.waitForLoadState('networkidle');

      const regScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const regClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(regScrollWidth).toBeLessThanOrEqual(regClientWidth);
    });
  }

  test('verifies mobile navigation dock and touch targets on phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');

    // Sign in using verified user
    await page.fill('input#email', 'verify_real_1793543587@example.com');
    await page.fill('input#password', 'Password123!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard');
    await page.waitForLoadState('networkidle');

    // Floating glass dock should be visible on mobile
    const dock = page.locator('.glass-dock');
    await expect(dock.first()).toBeVisible();

    // Verify touch targets for navigation links are at least 44px
    const navDashboard = page.getByTestId('nav-dashboard');
    const box = await navDashboard.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    // Verify zero horizontal overflow on Dashboard
    const dashScroll = await page.evaluate(() => document.documentElement.scrollWidth);
    const dashClient = await page.evaluate(() => document.documentElement.clientWidth);
    expect(dashScroll).toBeLessThanOrEqual(dashClient);

    // Navigate to Meetings
    await page.getByTestId('nav-meetings').click();
    await page.waitForURL('**/meetings');
    const meetingsScroll = await page.evaluate(() => document.documentElement.scrollWidth);
    const meetingsClient = await page.evaluate(() => document.documentElement.clientWidth);
    expect(meetingsScroll).toBeLessThanOrEqual(meetingsClient);

    // Navigate to Action Items
    await page.getByTestId('nav-action-items').click();
    await page.waitForURL('**/action-items');
    const actionsScroll = await page.evaluate(() => document.documentElement.scrollWidth);
    const actionsClient = await page.evaluate(() => document.documentElement.clientWidth);
    expect(actionsScroll).toBeLessThanOrEqual(actionsClient);

    // Navigate to Settings
    await page.getByTestId('nav-settings').click();
    await page.waitForURL('**/settings');
    const settingsScroll = await page.evaluate(() => document.documentElement.scrollWidth);
    const settingsClient = await page.evaluate(() => document.documentElement.clientWidth);
    expect(settingsScroll).toBeLessThanOrEqual(settingsClient);
  });
});
