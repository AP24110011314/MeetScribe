import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Upload Pipeline Flow (F02, F03, F04, F05, F06, F07, U05, U06, U08)', () => {
  const sampleAudioPath = path.resolve(__dirname, '../../.data/sample/meeting_sample.mp3');

  test('uploads audio file, tracks progress to Done, and views meeting summary and action items', async ({ page }) => {
    // 1. Register a fresh user
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const email = `upload_tester_${uniqueId}@example.com`;
    const password = 'Password123!@#';

    await page.goto('/register');
    await page.fill('input#reg-email', email);
    await page.fill('input#reg-password', password);
    await page.fill('input#confirm-password', password);
    await page.locator('[data-testid="register-form"]').locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/.*dashboard/);

    // 2. Navigate to upload page
    await page.goto('/upload');
    await expect(page.locator('[data-testid="upload-dropzone"]')).toBeVisible();

    // 3. Upload sample audio file
    const fileInput = page.locator('[data-testid="upload-file-input"]');
    await fileInput.setInputFiles(sampleAudioPath);

    // 4. Verify queue item and tracker appear
    await expect(page.locator('[data-testid="upload-queue-item"]').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="step-tracker"]').first()).toBeVisible({ timeout: 15000 });

    // 5. Watch tracker progress until Done (timeout 45s for fake pipeline)
    const viewNotesBtn = page.getByRole('button', { name: /view meeting notes/i });
    await expect(viewNotesBtn).toBeVisible({ timeout: 45000 });
    await viewNotesBtn.click();
    await expect(page).toHaveURL(/.*meetings\/.+/);

    // 6. Verify meeting detail components
    await expect(page.locator('[data-testid="meeting-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="summary-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="decisions-card"]')).toBeVisible();

    // 8. Verify action items tab and list
    const actionTab = page.locator('[data-testid="tab-actions"]');
    if (await actionTab.isVisible()) {
      await actionTab.click();
      await expect(page.locator('[data-testid="action-item-row"]').first()).toBeVisible({ timeout: 10000 });
    }
  });
});
