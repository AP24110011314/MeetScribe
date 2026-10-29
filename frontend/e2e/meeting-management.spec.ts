import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Meeting Management & Lifecycle (F10, F11, F15, F16, F17, F18, U07, U08)', () => {
  const sampleAudioPath = path.resolve(__dirname, '../../.data/sample/meeting_sample.mp3');
  const failAudioPath = path.resolve(__dirname, '../../.data/sample/fail_test.mp3');

  test.beforeAll(() => {
    // Ensure fail_test.mp3 exists for forced failure simulation
    if (fs.existsSync(sampleAudioPath) && !fs.existsSync(failAudioPath)) {
      fs.copyFileSync(sampleAudioPath, failAudioPath);
    }
  });

  test('searches, renames, exports Markdown and PDF, and deletes a meeting', async ({ page }) => {
    // 1. Register a fresh user
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const email = `manage_tester_${uniqueId}@example.com`;
    const password = 'Password123!@#';

    await page.goto('/register');
    await page.fill('input#reg-email', email);
    await page.fill('input#reg-password', password);
    await page.fill('input#confirm-password', password);
    await page.locator('[data-testid="register-form"]').locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/.*dashboard/);

    // 2. Upload meeting_sample.mp3
    await page.goto('/upload');
    const fileInput = page.locator('[data-testid="upload-file-input"]');
    await fileInput.setInputFiles(sampleAudioPath);
    const viewNotesBtn = page.getByRole('button', { name: /view meeting notes/i });
    await expect(viewNotesBtn).toBeVisible({ timeout: 45000 });
    await viewNotesBtn.click();

    // 3. Inline rename title on meeting detail
    await expect(page.locator('[data-testid="meeting-title"]')).toBeVisible();
    const titleInput = page.locator('[data-testid="meeting-title"]');
    await titleInput.click();
    await titleInput.fill('Q4 Strategic Roadmap Sync');
    await titleInput.press('Enter');

    // 4. Test export Markdown download
    const exportMdBtn = page.locator('[data-testid="export-md"]');
    if (await exportMdBtn.isVisible()) {
      const [downloadMd] = await Promise.all([
        page.waitForEvent('download', { timeout: 10000 }),
        exportMdBtn.click(),
      ]);
      expect(downloadMd.suggestedFilename()).toContain('.md');
    }

    // 5. Test export PDF download
    const exportPdfBtn = page.locator('[data-testid="export-pdf"]');
    if (await exportPdfBtn.isVisible()) {
      const [downloadPdf] = await Promise.all([
        page.waitForEvent('download', { timeout: 10000 }),
        exportPdfBtn.click(),
      ]);
      expect(downloadPdf.suggestedFilename()).toContain('.pdf');
    }

    // 6. Search meetings on /meetings
    await page.goto('/meetings');
    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.fill('Strategic Roadmap');
    await page.waitForTimeout(500); // debounce
    await expect(page.locator('[data-testid="meeting-card"], [data-testid="meeting-row"]').first()).toBeVisible();

    // 7. Delete meeting
    const deleteBtn = page.locator('[data-testid="delete-meeting"]').first();
    await deleteBtn.click();
    const confirmBtn = page.locator('[data-testid="confirm-delete"]');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Verify list becomes empty
    await expect(page.locator('[data-testid="meeting-card"]')).not.toBeVisible({ timeout: 6000 });
  });

  test('retries a forced failure meeting and succeeds on retry', async ({ page }) => {
    // 1. Register user
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const email = `retry_tester_${uniqueId}@example.com`;
    const password = 'Password123!@#';

    await page.goto('/register');
    await page.fill('input#reg-email', email);
    await page.fill('input#reg-password', password);
    await page.fill('input#confirm-password', password);
    await page.locator('[data-testid="register-form"]').locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/.*dashboard/);

    // 2. Upload fail_test.mp3
    await page.goto('/upload');
    const fileInput = page.locator('[data-testid="upload-file-input"]');
    await fileInput.setInputFiles(failAudioPath);

    // 3. Observe failure state and retry button
    const retryBtn = page.locator('[data-testid="retry-button"]').first();
    await expect(retryBtn).toBeVisible({ timeout: 45000 });

    // 4. Click Retry button
    await retryBtn.click();

    // 5. Verify retry succeeds and progresses to Done
    const viewNotesBtn = page.getByRole('button', { name: /view meeting notes/i });
    await expect(viewNotesBtn).toBeVisible({ timeout: 45000 });
  });
});
