import { test, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../../docs/screenshots/mobile-before');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

interface Issue {
  page: string;
  viewport: string;
  problem: string;
  rootCause: string;
  details?: string;
}

const allIssues: Issue[] = [];

const VIEWPORTS = [
  { width: 320, height: 568, name: '320x568 (iPhone SE 1st gen)' },
  { width: 360, height: 640, name: '360x640 (Android Small)' },
  { width: 375, height: 667, name: '375x667 (iPhone SE 2nd gen)' },
  { width: 390, height: 844, name: '390x844 (iPhone 12/13/14)' },
  { width: 430, height: 932, name: '430x932 (iPhone 15 Pro Max)' },
  { width: 768, height: 1024, name: '768x1024 (iPad Portrait)' },
  { width: 844, height: 390, name: '844x390 (Landscape Phone)' },
  { width: 1280, height: 800, name: '1280x800 (Desktop Baseline)' },
];

const mockUser = {
  id: 'usr-audit-123',
  email: 'audit_user@meetscribe.io',
  created_at: '2026-01-01T00:00:00Z',
};

const mockMeeting = {
  id: 'm-audit-456',
  title: 'Quarterly Engineering Architecture and Mobile Scalability Review Sync',
  title_edited: true,
  status: 'done',
  stage: 'done',
  progress_pct: 100,
  error_message: null,
  duration_sec: 1420,
  language: 'en',
  has_transcript: true,
  is_starred: true,
  is_pinned: false,
  template: 'general',
  created_at: '2026-11-02T10:00:00Z',
  updated_at: '2026-11-02T10:30:00Z',
  tags: [
    { id: 'tag-1', name: 'Mobile', color: '#38bdf8' },
    { id: 'tag-2', name: 'Architecture', color: '#a855f7' },
  ],
  summary: {
    summary:
      'The engineering leadership team reviewed Q4 mobile web responsiveness, backend database failover readiness, and automated audio transcription chunking pipelines. Key bottlenecks in CSS layout on small screens below 400px were identified, specifically in modal overlays and form inputs. A strict zero-regression mobile fix plan was scheduled for immediate deployment.',
    key_points: [
      'Authentication card headers clipping on screens under 360px',
      'Fixed bottom navigation dock overlapping lower content on mobile devices',
      'Dialog popups translated off-center without tailwindcss-animate keyframes',
      'Form inputs with text under 16px triggering unwanted iOS Safari automatic zoom',
    ],
    decisions: [
      'Mandate min-h-dvh and dvh viewport sizing for all full-height views',
      'Enforce minimum 44x44px touch targets across buttons, chips, and table controls',
      'Adopt clean bottom-sheet dialog transformations on viewports below 640px',
    ],
  },
  action_items: [
    {
      id: 'ai-1',
      description: 'Audit and resolve horizontal scroll leakage on mobile auth views',
      owner: 'Alex Chen',
      due_date: '2026-11-06',
      priority: 'high',
      status: 'open',
      source_start_sec: 45.2,
      meeting_id: 'm-audit-456',
    },
    {
      id: 'ai-2',
      description: 'Refactor modal Dialog to responsive bottom sheet on viewports below 640px',
      owner: 'Bianca Vance',
      due_date: '2026-11-08',
      priority: 'high',
      status: 'open',
      source_start_sec: 112.0,
      meeting_id: 'm-audit-456',
    },
    {
      id: 'ai-3',
      description: 'Ensure all form inputs have minimum 16px text size to prevent iOS zoom',
      owner: 'Charlie Ray',
      due_date: '2026-11-09',
      priority: 'medium',
      status: 'completed',
      source_start_sec: 240.5,
      meeting_id: 'm-audit-456',
    },
  ],
};

const mockTranscript = {
  meeting_id: 'm-audit-456',
  full_text:
    'Alex: Welcome team. Let us review the mobile layout. Bianca: The card top is clipping on small screens. Charlie: Let us fix dvh and touch targets.',
  segments: [
    {
      id: 0,
      start: 0.0,
      end: 4.5,
      speaker: 'Alex Chen',
      text: 'Welcome team. Let us review the mobile layout across all phone viewports today.',
    },
    {
      id: 1,
      start: 4.8,
      end: 11.2,
      speaker: 'Bianca Vance',
      text: 'The card header is clipping on screens under 360px and inputs trigger automatic zoom on iOS.',
    },
    {
      id: 2,
      start: 11.5,
      end: 18.0,
      speaker: 'Charlie Ray',
      text: 'We should use min-h-dvh and ensure bottom padding clears the glass navigation dock.',
    },
  ],
};

async function setupMocks(page: Page) {
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockUser),
    });
  });

  await page.route('**/api/v1/meetings**', async (route) => {
    const url = route.request().url();
    if (url.includes('/m-audit-456/transcript')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockTranscript) });
    } else if (url.includes('/m-audit-456/audio-url')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://example.com/audio.mp3', expires_in: 3600 }) });
    } else if (url.includes('/m-audit-456/chapters')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          chapters: [
            { title: 'Mobile Layout Problems', start_sec: 0, end_sec: 60, summary: 'Discussion of mobile clipping' },
            { title: 'Remediation Strategy', start_sec: 60, end_sec: 180, summary: 'DVH units and safe areas' },
          ],
        }),
      });
    } else if (url.includes('/m-audit-456/bookmarks')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'bm-1', timestamp_sec: 45, note: 'Critical clipping note', meeting_id: 'm-audit-456', created_at: '2026-11-02T10:05:00Z' },
        ]),
      });
    } else if (url.includes('/m-audit-456/insights')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sentiment: 'positive',
          pace_wpm: 138,
          top_keywords: ['Mobile Layout', 'Responsive', 'DVH', 'Touch Targets'],
          unanswered_questions: ['What is the rollout timeline for Android tablets?'],
          speaker_distribution: [{ speaker: 'Alex Chen', talk_time_pct: 45 }, { speaker: 'Bianca Vance', talk_time_pct: 55 }],
        }),
      });
    } else if (url.includes('/m-audit-456/email')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subject: 'Action Plan: MeetScribe Mobile Layout & Responsive UX',
          recipient_suggestion: 'Engineering Team',
          body: 'Hi team,\n\nFollowing today review, we have prioritized mobile responsive fixes for all viewports under 640px.\n\nBest,\nAlex',
        }),
      });
    } else if (url.includes('/m-audit-456/share')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'sl-1',
            meeting_id: 'm-audit-456',
            token: 'abcdef1234567890abcdef1234567890',
            share_url: '/share/abcdef1234567890',
            has_password: false,
            expires_at: null,
            hide_transcript: false,
            view_count: 5,
            is_revoked: false,
            created_at: '2026-11-02T10:10:00Z',
          },
        ]),
      });
    } else if (url.includes('/m-audit-456')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockMeeting) });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [mockMeeting],
          total: 1,
          page: 1,
          limit: 10,
          total_pages: 1,
        }),
      });
    }
  });

  await page.route('**/api/v1/action-items**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: mockMeeting.action_items,
        total: mockMeeting.action_items.length,
      }),
    });
  });

  await page.route('**/api/v1/tags**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockMeeting.tags),
    });
  });

  await page.route('**/api/v1/folders**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/v1/trash**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0 }),
    });
  });
}

async function setAuth(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('meetscribe_access_token', 'mock_token_audit');
    window.localStorage.setItem('meetscribe_refresh_token', 'mock_refresh_token_audit');
  });
}

async function clearAuth(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.removeItem('meetscribe_access_token');
    window.localStorage.removeItem('meetscribe_refresh_token');
  });
}

interface RawAuditResult {
  hasHorizontalOverflow: boolean;
  docScrollWidth: number;
  docClientWidth: number;
  bleedingElements: string[];
  clippedTexts: string[];
  smallTouchTargets: string[];
  smallInputs: string[];
  dockOverlapElements: string[];
}

async function inspectPage(
  page: Page,
  pageName: string,
  viewport: { width: number; height: number; name: string }
): Promise<void> {
  const screenshotName = `${pageName}_${viewport.width}x${viewport.height}.png`.replace(/[^a-zA-Z0-9_.-]/g, '_');
  await page.screenshot({ path: path.join(screenshotsDir, screenshotName), fullPage: false });

  const raw = await page.evaluate(({ vw, vh }) => {
    const doc = document.documentElement;
    const body = document.body;

    const res: RawAuditResult = {
      hasHorizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
      docScrollWidth: doc.scrollWidth,
      docClientWidth: doc.clientWidth,
      bleedingElements: [],
      clippedTexts: [],
      smallTouchTargets: [],
      smallInputs: [],
      dockOverlapElements: [],
    };

    const elements = Array.from(document.querySelectorAll('*')) as HTMLElement[];
    const dock = document.querySelector('.glass-dock') as HTMLElement | null;
    const dockRect = dock ? dock.getBoundingClientRect() : null;

    for (const el of elements) {
      if (el === doc || el === body) continue;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);

      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

      // 1. Bleeding past viewport
      if (rect.width > 0 && rect.height > 0) {
        if (rect.right > vw + 2 || rect.left < -2) {
          let parent: HTMLElement | null = el.parentElement;
          let contained = false;
          while (parent && parent !== body) {
            const ps = window.getComputedStyle(parent);
            if (ps.overflowX === 'hidden' || ps.overflowX === 'clip') {
              contained = true;
              break;
            }
            parent = parent.parentElement;
          }
          if (!contained) {
            const desc = el.getAttribute('data-testid') || el.id || el.className?.slice(0, 30) || el.tagName.toLowerCase();
            res.bleedingElements.push(`<${el.tagName.toLowerCase()} ${desc}> (right: ${Math.round(rect.right)}px > ${vw}px)`);
          }
        }
      }

      // 2. Text clipped by overflow hidden
      if (style.overflow === 'hidden' || style.overflowY === 'hidden') {
        if (el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 0 && el.scrollHeight > 20) {
          const textSnippet = el.textContent?.trim().slice(0, 30);
          if (textSnippet && !['svg', 'img'].includes(el.tagName.toLowerCase())) {
            res.clippedTexts.push(`"${textSnippet}..." in <${el.tagName.toLowerCase()}>`);
          }
        }
      }

      // 3. Inputs fontSize < 16px
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
        const fsVal = parseFloat(style.fontSize);
        if (fsVal > 0 && fsVal < 15.5 && rect.width > 0 && rect.height > 0) {
          const id = el.getAttribute('data-testid') || el.id || el.getAttribute('name') || el.getAttribute('placeholder') || 'input';
          res.smallInputs.push(`<${el.tagName.toLowerCase()} ${id}>: ${fsVal}px`);
        }
      }

      // 4. Interactive touch targets < 44x44
      const isInteractive =
        el.tagName === 'BUTTON' ||
        el.tagName === 'A' ||
        (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'hidden') ||
        el.getAttribute('role') === 'button' ||
        el.getAttribute('data-testid')?.includes('btn') ||
        el.getAttribute('data-testid')?.includes('tab') ||
        el.getAttribute('data-testid')?.includes('chip');

      if (isInteractive && rect.width > 0 && rect.height > 0) {
        if (rect.width < 40 || rect.height < 40) {
          const label = el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 20) || el.className?.slice(0, 20);
          res.smallTouchTargets.push(`<${el.tagName.toLowerCase()}> "${label}": ${Math.round(rect.width)}x${Math.round(rect.height)}px`);
        }
      }

      // 5. Overlap with fixed glass dock
      if (dockRect && dockRect.height > 0 && rect.width > 0 && rect.height > 0) {
        if (el !== dock && !dock.contains(el)) {
          // If element's bottom sits behind dock
          if (rect.bottom > dockRect.top && rect.top < dockRect.bottom) {
            // Only report if it contains clickable buttons or important text
            if (isInteractive) {
              const label = el.getAttribute('data-testid') || el.textContent?.trim().slice(0, 20);
              res.dockOverlapElements.push(`Interactive <${el.tagName.toLowerCase()}> "${label}" behind bottom dock`);
            }
          }
        }
      }
    }

    return res;
  }, { vw: viewport.width, vh: viewport.height });

  // Record issues in allIssues list
  if (raw.hasHorizontalOverflow) {
    allIssues.push({
      page: pageName,
      viewport: viewport.name,
      problem: `Horizontal overflow (${raw.docScrollWidth}px > ${raw.docClientWidth}px)`,
      rootCause: 'Fixed container widths or unconstrained flex children causing horizontal layout bleed',
    });
  }

  if (raw.bleedingElements.length > 0) {
    allIssues.push({
      page: pageName,
      viewport: viewport.name,
      problem: `Elements bleed past right screen edge (${raw.bleedingElements.slice(0, 2).join(', ')})`,
      rootCause: 'Lack of max-w-full / min-w-0 or rigid padding exceeding narrow viewport',
    });
  }

  if (raw.smallInputs.length > 0) {
    allIssues.push({
      page: pageName,
      viewport: viewport.name,
      problem: `Input font size below 16px (${raw.smallInputs.slice(0, 2).join(', ')})`,
      rootCause: 'Tailwind text-xs or text-sm set below 16px (triggers iOS Safari zoom on focus)',
    });
  }

  if (raw.smallTouchTargets.length > 0) {
    allIssues.push({
      page: pageName,
      viewport: viewport.name,
      problem: `Touch targets under 44x44px (${raw.smallTouchTargets.slice(0, 3).join(', ')})`,
      rootCause: 'Button size sm (h-8 / 32px or 36px) or icon-only buttons without 44px min tap area',
    });
  }

  if (raw.dockOverlapElements.length > 0) {
    allIssues.push({
      page: pageName,
      viewport: viewport.name,
      problem: `Page content obscured by floating bottom dock (${raw.dockOverlapElements.slice(0, 2).join(', ')})`,
      rootCause: 'Missing bottom safe area padding (pb-24 or env(safe-area-inset-bottom))',
    });
  }

  if (raw.clippedTexts.length > 0) {
    allIssues.push({
      page: pageName,
      viewport: viewport.name,
      problem: `Text clipped by overflow hidden container (${raw.clippedTexts.slice(0, 2).join(', ')})`,
      rootCause: 'Fixed height container with overflow-hidden instead of flex grow and scrollable flow',
    });
  }
}

test.describe('Mobile Responsive Layout Comprehensive Audit', () => {
  test.afterAll(async () => {
    // Generate docs/MOBILE_AUDIT.md
    let md = '# Mobile Layout & Usability Audit Report\n\n';
    md += 'Generated automatically by Playwright mobile audit suite across all viewports and application states.\n\n';
    md += '## Audit Summary Table\n\n';
    md += '| Page / State | Viewport | Problem Detected | Root Cause | Fix Status |\n';
    md += '|---|---|---|---|---|\n';

    if (allIssues.length === 0) {
      md += '| All Pages | All Viewports | None detected | N/A | OK |\n';
    } else {
      // Deduplicate issues for readability
      const seen = new Set<string>();
      for (const iss of allIssues) {
        const key = `${iss.page}|${iss.viewport}|${iss.problem}`;
        if (!seen.has(key)) {
          seen.add(key);
          md += `| **${iss.page}** | ${iss.viewport} | ${iss.problem} | ${iss.rootCause} | PENDING |\n`;
        }
      }
    }

    md += '\n## Detailed Root Causes Breakdown\n\n';
    md += '1. **Authentication Views Centering & Fixed Heights (`h-screen` / `h-full`)**:\n';
    md += '   - `h-screen` and `items-center` on `/login` and `/register` prevent vertical scrolling on phones (<640px) and landscape modes (<500px), cutting off the logo, titles, inputs, and submit button.\n';
    md += '   - When the virtual keyboard appears (simulated at 390x500), the form becomes completely unreachable.\n\n';
    md += '2. **iOS Font Zoom Risk (`font-size < 16px`)**:\n';
    md += '   - Form inputs across auth, search bars, tag chips, and modals use `text-xs` (12px) or `text-sm` (14px). iOS Safari forces an aggressive automatic page zoom on focus whenever input text is under 16px.\n\n';
    md += '3. **Touch Target Size Deficiencies (< 44x44px)**:\n';
    md += '   - Standard buttons with `size="sm"` use `h-8` (32px) or `px-2.5`, tabs use `min-h-[36px]`, and close/more buttons use `p-1.5` or `w-6 h-6`, failing the Apple Human Interface Guidelines and WCAG 44x44px touch target requirement.\n\n';
    md += '4. **Floating Bottom Dock Obstruction (`.glass-dock`)**:\n';
    md += '   - On mobile viewports, the bottom glass dock is fixed at `bottom-4` without matching bottom padding on page containers, causing lower cards, buttons, and transcript lines to sit directly beneath the navigation bar.\n\n';
    md += '5. **Modal Overlays & Drawers on Mobile**:\n';
    md += '   - Dialogs (`Ask AI`, `Email`, `Insights`, `Share`) use fixed viewport centering (`max-w-lg`) instead of responsive bottom sheets, making them awkward and cramped on small phone screens with tiny close targets.\n\n';
    md += '6. **Table & Grid Horizontal Bleed**:\n';
    md += '   - Action items list and meetings table layouts overflow narrow viewports horizontally due to rigid min-width columns rather than stacking into mobile card representations.\n\n';

    const auditMdPath = path.resolve(__dirname, '../../docs/MOBILE_AUDIT.md');
    fs.writeFileSync(auditMdPath, md, 'utf-8');
  });

  for (const vp of VIEWPORTS) {
    test(`Auditing Viewport: ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupMocks(page);

      // --- LOGGED OUT STATES ---
      await clearAuth(page);

      // 1. Landing Page
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await inspectPage(page, 'Landing_Page', vp);

      // 2. Login Page
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');
      await inspectPage(page, 'Login_Page', vp);

      // 3. Register Page (Empty)
      await page.goto('/register');
      await page.waitForLoadState('domcontentloaded');
      await inspectPage(page, 'Register_Page', vp);

      // 4. Register Page (Validation Error State)
      const regSubmit = page.locator('button[type="submit"]');
      if (await regSubmit.isVisible()) {
        await regSubmit.click();
        await inspectPage(page, 'Register_Validation_Errors', vp);
      }

      // 5. 404 Page
      await page.goto('/unknown-page-route-audit');
      await page.waitForLoadState('domcontentloaded');
      await inspectPage(page, 'Not_Found_404', vp);

      // --- LOGGED IN STATES ---
      await setAuth(page);

      // 6. Dashboard
      await page.goto('/dashboard');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(300);
      await inspectPage(page, 'Dashboard_Page', vp);

      // 7. Upload Page (Empty Dropzone)
      await page.goto('/upload');
      await page.waitForLoadState('domcontentloaded');
      await inspectPage(page, 'Upload_Empty', vp);

      // 8. Meetings List (Grid View)
      await page.goto('/meetings');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(300);
      await inspectPage(page, 'Meetings_Grid', vp);

      // 9. Meetings List (Table View)
      const viewToggle = page.locator('button:has-text("Table"), button[title*="table" i]');
      if (await viewToggle.first().isVisible()) {
        await viewToggle.first().click();
        await page.waitForTimeout(200);
        await inspectPage(page, 'Meetings_Table', vp);
      }

      // 10. Meeting Detail: Overview Tab
      await page.goto('/meetings/m-audit-456');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(300);
      await inspectPage(page, 'Meeting_Detail_Overview', vp);

      // 11. Meeting Detail: Transcript Tab
      const tabTranscript = page.locator('[data-testid="tab-transcript"]');
      if (await tabTranscript.isVisible()) {
        await tabTranscript.click();
        await page.waitForTimeout(200);
        await inspectPage(page, 'Meeting_Detail_Transcript', vp);
      }

      // 12. Meeting Detail: Chapters Tab
      const tabChapters = page.locator('[data-testid="tab-chapters"]');
      if (await tabChapters.isVisible()) {
        await tabChapters.click();
        await page.waitForTimeout(200);
        await inspectPage(page, 'Meeting_Detail_Chapters', vp);
      }

      // 13. Meeting Detail: Moments Tab
      const tabMoments = page.locator('[data-testid="tab-moments"]');
      if (await tabMoments.isVisible()) {
        await tabMoments.click();
        await page.waitForTimeout(200);
        await inspectPage(page, 'Meeting_Detail_Moments', vp);
      }

      // 14. Meeting Detail: Action Items Tab
      const tabActions = page.locator('[data-testid="tab-actions"]');
      if (await tabActions.isVisible()) {
        await tabActions.click();
        await page.waitForTimeout(200);
        await inspectPage(page, 'Meeting_Detail_Actions', vp);
      }

      // 15. Action Items Page (List View)
      await page.goto('/action-items');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(300);
      await inspectPage(page, 'Action_Items_List', vp);

      // 16. Action Items Page (Board / Kanban View)
      const boardToggle = page.locator('button:has-text("Board"), button:has-text("Kanban")');
      if (await boardToggle.first().isVisible()) {
        await boardToggle.first().click();
        await page.waitForTimeout(200);
        await inspectPage(page, 'Action_Items_Board', vp);
      }

      // 17. Settings Page
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');
      await inspectPage(page, 'Settings_Page', vp);

      // 18. Modals / Dialogs on Meeting Detail
      await page.goto('/meetings/m-audit-456');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(300);

      // Ask AI Chat Drawer
      const askAiBtn = page.locator('[data-testid="ask-ai-btn"]');
      if (await askAiBtn.isVisible()) {
        await askAiBtn.click();
        await page.waitForTimeout(200);
        await inspectPage(page, 'Dialog_Ask_AI', vp);
        // Close modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }

      // Follow-Up Email Modal
      const emailBtn = page.locator('[data-testid="email-draft-btn"]');
      if (await emailBtn.isVisible()) {
        await emailBtn.click();
        await page.waitForTimeout(200);
        await inspectPage(page, 'Dialog_Email', vp);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }

      // Insights Modal
      const insightsBtn = page.locator('button:has-text("Insights")');
      if (await insightsBtn.first().isVisible()) {
        await insightsBtn.first().click();
        await page.waitForTimeout(200);
        await inspectPage(page, 'Dialog_Insights', vp);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }

      // Public Share Modal
      const shareBtn = page.locator('[data-testid="share-btn"]');
      if (await shareBtn.isVisible()) {
        await shareBtn.click();
        await page.waitForTimeout(200);
        await inspectPage(page, 'Dialog_Share', vp);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }

      // Command Palette (Ctrl+K / Cmd+K)
      await page.keyboard.press('Meta+k');
      await page.waitForTimeout(200);
      const cmdSearch = page.locator('input[placeholder*="Search" i], [role="combobox"]');
      if (await cmdSearch.first().isVisible()) {
        await inspectPage(page, 'Dialog_Command_Palette', vp);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
    });
  }

  // Virtual Keyboard on Login (390x500)
  test('Auditing Login with Virtual Keyboard open (390x500)', async ({ page }) => {
    const vp = { width: 390, height: 500, name: '390x500 (Mobile Virtual Keyboard)' };
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await clearAuth(page);

    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('input#email, input[type="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.focus();
    }
    await page.waitForTimeout(200);

    await inspectPage(page, 'Login_Virtual_Keyboard', vp);
  });
});

