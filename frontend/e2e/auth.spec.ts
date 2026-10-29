import { test, expect } from '@playwright/test';

test.describe('Authentication Flow (F01, F21, U03)', () => {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const user = {
    name: 'E2E Tester',
    email: `e2e_user_${uniqueId}@example.com`,
    password: 'Password123!@#',
  };

  test('registers a new account, logs out, and logs back in', async ({ page }) => {
    // 1. Visit landing or register page
    await page.goto('/register');
    await expect(page.locator('[data-testid="register-form"]')).toBeVisible();

    // 2. Fill registration form
    await page.fill('input#reg-email', user.email);
    await page.fill('input#reg-password', user.password);
    await page.fill('input#confirm-password', user.password);
    await page.locator('[data-testid="register-form"]').locator('button[type="submit"]').click();

    // 3. Verify landing on dashboard
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.locator('text=Dashboard').first()).toBeVisible();

    // 4. Logout via user menu
    const logoutBtn = page.getByRole('button', { name: /sign out|logout/i }).first();
    await logoutBtn.click();

    // Verify redirected to login
    await expect(page).toHaveURL(/.*login/);
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();

    // 5. Login with newly registered credentials
    await page.fill('input[type="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    await page.locator('[data-testid="login-form"]').locator('button[type="submit"]').click();

    // Verify landing on dashboard again
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.locator('text=Dashboard').first()).toBeVisible();
  });

  test('unauthenticated users are redirected from protected routes to login', async ({ page }) => {
    // Navigate directly to protected dashboard without auth token
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/.*login/);
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();

    // Navigate to protected meetings page
    await page.goto('/meetings');
    await expect(page).toHaveURL(/.*login/);
  });
});

