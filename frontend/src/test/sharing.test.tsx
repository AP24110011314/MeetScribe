import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { PublicSharePage } from '@/pages/PublicSharePage';
import * as meetingApi from '@/api/meetings';
import { PublicShareResponse } from '@/types/meeting';

vi.mock('@/api/meetings', async () => {
  const actual = await vi.importActual<typeof import('@/api/meetings')>('@/api/meetings');
  return {
    ...actual,
    getPublicShare: vi.fn(),
    unlockPublicShare: vi.fn(),
  };
});

describe('Phase C: Public Share View (U23)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  const mockPublicMeeting: PublicShareResponse = {
    title: 'Public Product Sync',
    created_at: '2026-11-01T12:00:00Z',
    duration_sec: 1800,
    language: 'en',
    hide_transcript: false,
    summary: {
      summary: 'Public meeting executive summary discussing new v2 features.',
      key_points: ['Discussed UI redesign', 'Verified exports'],
      decisions: ['Launch publicly on Monday'],
    },
    action_items: [
      {
        id: 'item-1',
        description: 'Verify public share links',
        owner: 'Alice',
        due_date: '2026-11-05',
        priority: 'high',
        status: 'open',
      },
    ],
    transcript: {
      full_text: 'Welcome to product sync. Let us review the roadmap.',
      segments: [
        { id: 0, start: 0, end: 4, text: 'Welcome to product sync.' },
        { id: 1, start: 4, end: 8, text: 'Let us review the roadmap.' },
      ],
    },
  };

  it('renders public meeting notes without authentication', async () => {
    vi.mocked(meetingApi.getPublicShare).mockResolvedValue(mockPublicMeeting);

    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/share/test-token']}>
            <Routes>
              <Route path="/share/:token" element={<PublicSharePage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Public Product Sync').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText(/Public meeting executive summary/)).toBeInTheDocument();
    expect(screen.getByText('Launch publicly on Monday')).toBeInTheDocument();
    expect(screen.getByText('Verify public share links')).toBeInTheDocument();
    expect(screen.getByText('Welcome to product sync.')).toBeInTheDocument();
  });

  it('shows password prompt when link is password-protected and unlocks on valid password', async () => {
    vi.mocked(meetingApi.getPublicShare).mockRejectedValue({ status: 401 });
    vi.mocked(meetingApi.unlockPublicShare).mockResolvedValue(mockPublicMeeting);

    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/share/protected-token']}>
            <Routes>
              <Route path="/share/:token" element={<PublicSharePage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Password Protected Note')).toBeInTheDocument();
    });

    const pwdInput = screen.getByTestId('share-password-input');
    const unlockBtn = screen.getByTestId('share-unlock-btn');

    fireEvent.change(pwdInput, { target: { value: 'mypassword' } });
    fireEvent.click(unlockBtn);

    await waitFor(() => {
      expect(screen.getAllByText('Public Product Sync').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText(/Public meeting executive summary/)).toBeInTheDocument();
  });
});
