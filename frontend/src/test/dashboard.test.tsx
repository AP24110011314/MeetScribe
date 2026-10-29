import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import { DashboardPage } from '@/pages/DashboardPage';

// Mock API
vi.mock('@/api/meetings', () => ({
  getMeetings: vi.fn(),
}));

vi.mock('@/api/actionItems', () => ({
  getActionItems: vi.fn(),
}));

// Mock Recharts ResponsiveContainer to avoid SVG sizing issues in JSDOM
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 500, height: 300 }}>{children}</div>
    ),
  };
});

import * as meetingsApi from '@/api/meetings';
import * as actionItemsApi from '@/api/actionItems';

function renderDashboard() {
  return render(
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

describe('Dashboard Page (U04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when there are no meetings', async () => {
    vi.mocked(meetingsApi.getMeetings).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
    });
    vi.mocked(actionItemsApi.getActionItems).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 50,
    });

    renderDashboard();

    expect(await screen.findByText('No meetings recorded yet')).toBeInTheDocument();
    expect(screen.getByText('Upload First Meeting')).toBeInTheDocument();
  });

  it('computes stats accurately from meeting and action items list data', async () => {
    vi.mocked(meetingsApi.getMeetings).mockResolvedValueOnce({
      items: [
        {
          id: 'm1',
          title: 'Planning Session',
          status: 'done',
          duration_sec: 3600, // 1 hour
          created_at: '2026-10-29T10:00:00Z',
          has_transcript: true,
          action_items_count: 2,
        },
        {
          id: 'm2',
          title: 'Design Review',
          status: 'done',
          duration_sec: 1800, // 0.5 hours
          created_at: '2026-10-29T12:00:00Z',
          has_transcript: true,
          action_items_count: 1,
        },
      ],
      total: 2,
      page: 1,
      page_size: 10,
    });

    vi.mocked(actionItemsApi.getActionItems).mockResolvedValueOnce({
      items: [
        {
          id: 'a1',
          meeting_id: 'm1',
          description: 'Deploy API',
          owner: 'Dev',
          due_date: '2026-11-01',
          priority: 'high',
          status: 'open',
          source_start_sec: null,
          created_by_ai: true,
          created_at: '2026-10-29T10:00:00Z',
          updated_at: '2026-10-29T10:00:00Z',
        },
        {
          id: 'a2',
          meeting_id: 'm1',
          description: 'Write Docs',
          owner: 'Tech Writer',
          due_date: '2026-11-05',
          priority: 'medium',
          status: 'completed',
          source_start_sec: null,
          created_by_ai: false,
          created_at: '2026-10-29T10:00:00Z',
          updated_at: '2026-10-29T10:00:00Z',
        },
      ],
      total: 2,
      page: 1,
      page_size: 50,
    });

    renderDashboard();

    // 1. Total meetings count = 2
    expect(await screen.findByText('2')).toBeInTheDocument();

    // 2. Total duration = 1.5h
    expect(screen.getByText('1.5h')).toBeInTheDocument();

    // 3. Open items = 1, completed = 1
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(2);

    // 4. Meeting title in recent meetings
    expect(screen.getByText('Planning Session')).toBeInTheDocument();
    expect(screen.getByText('Design Review')).toBeInTheDocument();
  });
});
