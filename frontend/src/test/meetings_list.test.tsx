import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/Toast';
import { MeetingsPage } from '@/pages/MeetingsPage';

vi.mock('@/api/meetings', () => ({
  getMeetings: vi.fn(),
  renameMeeting: vi.fn(),
  deleteMeeting: vi.fn(),
  exportMeetingNotes: vi.fn(),
}));

import * as meetingsApi from '@/api/meetings';

function renderMeetingsPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <MeetingsPage />
      </MemoryRouter>
    </ToastProvider>
  );
}

describe('Meetings List (U07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders search input, view toggle, and meeting cards by default', async () => {
    vi.mocked(meetingsApi.getMeetings).mockResolvedValueOnce({
      items: [
        {
          id: 'm1',
          title: 'Sprint Retrospective',
          status: 'done',
          duration_sec: 1800,
          created_at: '2026-10-29T10:00:00Z',
          has_transcript: true,
          action_items_count: 3,
        },
      ],
      total: 1,
      page: 1,
      page_size: 9,
    });

    renderMeetingsPage();

    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(screen.getByTestId('view-toggle')).toBeInTheDocument();

    expect(await screen.findByTestId('meeting-card')).toBeInTheDocument();
    expect(screen.getByText('Sprint Retrospective')).toBeInTheDocument();
    expect(screen.getByTestId('status-badge')).toHaveTextContent('done');
  });

  it('toggles to table view and renders meeting-row elements', async () => {
    vi.mocked(meetingsApi.getMeetings).mockResolvedValue({
      items: [
        {
          id: 'm1',
          title: 'Sprint Retrospective',
          status: 'done',
          duration_sec: 1800,
          created_at: '2026-10-29T10:00:00Z',
          has_transcript: true,
          action_items_count: 3,
        },
      ],
      total: 1,
      page: 1,
      page_size: 9,
    });

    renderMeetingsPage();

    await screen.findByTestId('meeting-card');

    // Click toggle to switch to table view
    fireEvent.click(screen.getByTestId('view-toggle'));

    expect(await screen.findByTestId('meeting-row')).toBeInTheDocument();
    expect(screen.queryByTestId('meeting-card')).not.toBeInTheDocument();
    expect(localStorage.getItem('meetscribe_default_view')).toBe('table');
  });

  it('triggers debounced search on input change', async () => {
    vi.mocked(meetingsApi.getMeetings).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 9,
    });

    renderMeetingsPage();

    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'Kubernetes' } });

    await waitFor(
      () => {
        expect(meetingsApi.getMeetings).toHaveBeenCalledWith(
          expect.objectContaining({ q: 'Kubernetes' })
        );
      },
      { timeout: 1000 }
    );
  });

  it('opens delete confirmation dialog and triggers delete API on confirm', async () => {
    vi.mocked(meetingsApi.getMeetings).mockResolvedValue({
      items: [
        {
          id: 'm1',
          title: 'Delete Me',
          status: 'done',
          duration_sec: 60,
          created_at: '2026-10-29T10:00:00Z',
          has_transcript: true,
          action_items_count: 0,
        },
      ],
      total: 1,
      page: 1,
      page_size: 9,
    });
    vi.mocked(meetingsApi.deleteMeeting).mockResolvedValueOnce();

    renderMeetingsPage();

    await screen.findByTestId('meeting-card');

    // Click delete icon
    fireEvent.click(screen.getByTestId('delete-meeting'));

    // Confirmation dialog appears
    expect(await screen.findByTestId('confirm-delete')).toBeInTheDocument();

    // Confirm deletion
    fireEvent.click(screen.getByTestId('confirm-delete'));

    await waitFor(() => {
      expect(meetingsApi.deleteMeeting).toHaveBeenCalledWith('m1');
    });
  });
});
