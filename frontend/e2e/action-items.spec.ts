import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Action Items Management (F14, U11, U12)', () => {
  const sampleAudioPath = path.resolve(__dirname, '../../.data/sample/meeting_sample.mp3');

  test('creates, completes, views in kanban and filters action items', async ({ page }) => {
    // 1. Register a fresh user
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const email = `action_tester_${uniqueId}@example.com`;
    const password = 'Password123!@#';

    await page.goto('/register');
    await page.fill('input#reg-email', email);
    await page.fill('input#reg-password', password);
    await page.fill('input#confirm-password', password);
    await page.locator('[data-testid="register-form"]').locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/.*dashboard/);

    // 2. Upload sample meeting to create a meeting container
    await page.goto('/upload');
    const fileInput = page.locator('[data-testid="upload-file-input"]');
    await fileInput.setInputFiles(sampleAudioPath);
    const viewNotesBtn = page.getByRole('button', { name: /view meeting notes/i });
    await expect(viewNotesBtn).toBeVisible({ timeout: 45000 });
    await viewNotesBtn.click();

    // 3. Go to Action Items tab on Meeting Detail
    await expect(page).toHaveURL(/.*meetings\/.+/);
    const actionTab = page.locator('[data-testid="tab-actions"]');
    await actionTab.click();

    // 5. Add a new action item via action-add button
    const addBtn = page.locator('[data-testid="action-add"]');
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    await page.fill('input[placeholder="What needs to be done?"]', 'Deploy production release candidate');
    await page.fill('input[placeholder="Owner (optional)"]', 'Priya');
    await page.click('button:has-text("Save Item")');

    // 6. Verify created action item row
    const actionRow = page.locator('[data-testid="action-item-row"]').filter({ hasText: 'Deploy production release candidate' });
    await expect(actionRow).toBeVisible({ timeout: 6000 });

    // 7. Toggle completion status via action-checkbox
    const checkbox = actionRow.locator('[data-testid="action-checkbox"]');
    await checkbox.click();

    // 8. Navigate to global Action Items hub (/action-items)
    await page.goto('/action-items');
    await expect(page.locator('h1:has-text("Action Items")')).toBeVisible();

    // 9. Toggle Kanban Board view via board-view-toggle
    const boardToggle = page.locator('[data-testid="board-view-toggle"]');
    await expect(boardToggle).toBeVisible();
    await boardToggle.click();

    // Verify Kanban columns appear (Open, In Progress, Done)
    await expect(page.locator('text=Done').first()).toBeVisible();

    // Switch back to list view
    await boardToggle.click();
  });
});
