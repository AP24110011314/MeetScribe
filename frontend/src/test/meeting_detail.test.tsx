import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/Toast';
import { MeetingDetailPage } from '@/pages/MeetingDetailPage';

vi.mock('@/api/meetings', () => ({
  getMeetingDetail: vi.fn(),
  getMeetingTranscript: vi.fn(),
  getMeetingAudioUrl: vi.fn(),
  renameMeeting: vi.fn(),
  exportMeetingNotes: vi.fn(),
  createMeetingActionItem: vi.fn(),
}));

vi.mock('@/api/actionItems', () => ({
  updateActionItem: vi.fn(),
}));

import * as meetingsApi from '@/api/meetings';

function renderDetail(meetingId = 'test-m-123') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/meetings/${meetingId}`]}>
        <Routes>
          <Route path="/meetings/:id" element={<MeetingDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
}

describe('Meeting Detail (U08, U09, U10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockMeeting = {
    id: 'test-m-123',
    title: 'Architecture Review',
    title_edited: false,
    status: 'done',
    stage: 'done',
    progress_pct: 100,
    error_message: null,
    duration_sec: 1200,
    language: 'en',
    has_transcript: true,
    created_at: '2026-10-29T10:00:00Z',
    updated_at: '2026-10-29T10:00:00Z',
    summary: {
      summary: 'Executive summary of architecture review.',
      key_points: ['Point 1: Migrating to PostgreSQL', 'Point 2: Adding Celery worker'],
      decisions: ['Adopt Redis broker', 'Set reaper interval to 1 min'],
    },
    action_items: [
      {
        id: 'a1',
        meeting_id: 'test-m-123',
        description: 'Update Alembic migration',
        owner: 'Alice',
        due_date: '2026-11-01',
        priority: 'high' as const,
        status: 'open' as const,
        source_start_sec: 45.0,
        created_by_ai: true,
        created_at: '2026-10-29T10:00:00Z',
        updated_at: '2026-10-29T10:00:00Z',
      },
    ],
  };

  const mockTranscript = {
    language: 'en',
    full_text: 'Hello team, welcome to the architecture review meeting.',
    segments: [
      { id: 0, start: 0.0, end: 5.5, text: 'Hello team, welcome to the architecture review.' },
      { id: 1, start: 5.6, end: 12.0, text: 'Today we discuss database choices and queues.' },
    ],
  };

  it('renders meeting overview tabs, summary card, decisions card, and export buttons', async () => {
    vi.mocked(meetingsApi.getMeetingDetail).mockResolvedValueOnce(mockMeeting);
    vi.mocked(meetingsApi.getMeetingTranscript).mockResolvedValueOnce(mockTranscript);
    vi.mocked(meetingsApi.getMeetingAudioUrl).mockResolvedValueOnce({
      url: 'https://example.com/audio.wav',
      expires_in: 900,
    });

    renderDetail();

    // Verify tabs
    expect(await screen.findByTestId('tab-overview')).toBeInTheDocument();
    expect(screen.getByTestId('tab-transcript')).toBeInTheDocument();
    expect(screen.getByTestId('tab-actions')).toBeInTheDocument();

    // Verify cards and content
    expect(screen.getByTestId('summary-card')).toBeInTheDocument();
    expect(screen.getByText('Executive summary of architecture review.')).toBeInTheDocument();
    expect(screen.getByTestId('decisions-card')).toBeInTheDocument();
    expect(screen.getByText('Adopt Redis broker')).toBeInTheDocument();

    // Export buttons
    expect(screen.getByTestId('export-md')).toBeInTheDocument();
    expect(screen.getByTestId('export-pdf')).toBeInTheDocument();
  });

  it('supports inline title editing with Enter key to save', async () => {
    vi.mocked(meetingsApi.getMeetingDetail).mockResolvedValueOnce(mockMeeting);
    vi.mocked(meetingsApi.getMeetingTranscript).mockResolvedValueOnce(mockTranscript);
    vi.mocked(meetingsApi.getMeetingAudioUrl).mockResolvedValueOnce({
      url: 'https://example.com/audio.wav',
      expires_in: 900,
    });
    vi.mocked(meetingsApi.renameMeeting).mockResolvedValueOnce({
      ...mockMeeting,
      title: 'Renamed Architecture Review',
      action_items_count: 1,
    });

    renderDetail();

    const titleEl = await screen.findByTestId('meeting-title');
    fireEvent.click(titleEl);

    // Now input is visible
    const input = screen.getByTestId('meeting-title') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Renamed Architecture Review' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(meetingsApi.renameMeeting).toHaveBeenCalledWith(
        'test-m-123',
        'Renamed Architecture Review'
      );
    });
  });

  it('renders audio player with playback controls and speed selector', async () => {
    vi.mocked(meetingsApi.getMeetingDetail).mockResolvedValueOnce(mockMeeting);
    vi.mocked(meetingsApi.getMeetingTranscript).mockResolvedValueOnce(mockTranscript);
    vi.mocked(meetingsApi.getMeetingAudioUrl).mockResolvedValueOnce({
      url: 'https://example.com/audio.wav',
      expires_in: 900,
    });

    renderDetail();

    expect(await screen.findByTestId('audio-player')).toBeInTheDocument();
    expect(screen.getByTestId('speed-select')).toBeInTheDocument();
  });

  it('switches to transcript tab, filters segments by search term', async () => {
    vi.mocked(meetingsApi.getMeetingDetail).mockResolvedValueOnce(mockMeeting);
    vi.mocked(meetingsApi.getMeetingTranscript).mockResolvedValueOnce(mockTranscript);
    vi.mocked(meetingsApi.getMeetingAudioUrl).mockResolvedValueOnce({
      url: 'https://example.com/audio.wav',
      expires_in: 900,
    });

    renderDetail();

    const tab = await screen.findByTestId('tab-transcript');
    fireEvent.pointerDown(tab);
    fireEvent.click(tab);
    fireEvent.keyDown(tab, { key: ' ' });

    // Segments appear
    expect(await screen.findByText('Hello team, welcome to the architecture review.')).toBeInTheDocument();
    expect(screen.getByText('Today we discuss database choices and queues.')).toBeInTheDocument();

    // Search filter
    const searchInput = screen.getByTestId('transcript-search');
    fireEvent.change(searchInput, { target: { value: 'database' } });

    expect(screen.getByText('Today we discuss database choices and queues.')).toBeInTheDocument();
    expect(screen.queryByText('Hello team, welcome to the architecture review.')).not.toBeInTheDocument();
  });
});
