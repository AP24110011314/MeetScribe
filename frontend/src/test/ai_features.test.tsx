import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { MeetingDetailPage } from '@/pages/MeetingDetailPage';
import * as meetingsApi from '@/api/meetings';

vi.mock('@/api/meetings', () => ({
  getMeetingDetail: vi.fn(),
  getMeetingTranscript: vi.fn(),
  getMeetingAudioUrl: vi.fn(),
  renameMeeting: vi.fn(),
  exportMeetingNotes: vi.fn(),
  createMeetingActionItem: vi.fn(),
  getBookmarks: vi.fn().mockResolvedValue([]),
  createBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
  editTranscriptSegment: vi.fn(),
  revertTranscript: vi.fn(),
  organizeMeeting: vi.fn(),
  getTags: vi.fn().mockResolvedValue([]),
  updateMeetingTags: vi.fn(),
  streamMeetingChat: vi.fn(),
  getMeetingChatHistory: vi.fn().mockResolvedValue({ messages: [] }),
  regenerateMeeting: vi.fn(),
  getMeetingChapters: vi.fn().mockResolvedValue({
    chapters: [
      { title: 'Project Kickoff', start_sec: 0, end_sec: 60, summary: 'Intro and kickoff' },
      { title: 'Architecture Review', start_sec: 60, end_sec: 180, summary: 'Tech choices' },
    ],
  }),
  generateFollowUpEmail: vi.fn().mockResolvedValue({
    subject: 'Follow-up: Weekly Team Sync',
    recipient_suggestion: 'Team',
    body: 'Hi everyone, thanks for joining today.',
  }),
  translateMeetingNotes: vi.fn().mockResolvedValue({
    language: 'Spanish',
    title: 'Revisión Semanal',
    summary: 'Resumen en español.',
    key_points: ['Punto 1'],
    decisions: ['Decisión 1'],
    action_items: [],
  }),
  getMeetingInsights: vi.fn().mockResolvedValue({
    sentiment: 'positive',
    pace_wpm: 140,
    top_keywords: ['Architecture', 'PostgreSQL', 'Release'],
    unanswered_questions: ['What is the rollout timeline?'],
    speaker_distribution: [{ speaker: 'Speaker 1', talk_time_pct: 100 }],
  }),
}));

const mockMeeting = {
  id: 'ai-m-123',
  title: 'Architecture Review',
  title_edited: false,
  status: 'done',
  stage: 'done',
  progress_pct: 100,
  error_message: null,
  duration_sec: 1200,
  language: 'en',
  has_transcript: true,
  is_starred: false,
  is_pinned: false,
  template: 'general',
  created_at: '2026-10-29T10:00:00Z',
  updated_at: '2026-10-29T10:00:00Z',
  summary: {
    summary: 'Architecture review discussion.',
    key_points: ['Point 1: Database'],
    decisions: ['Decision 1: PostgreSQL'],
  },
  action_items: [],
};

function renderDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/meetings/ai-m-123']}>
          <Routes>
            <Route path="/meetings/:id" element={<MeetingDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('AI Features UI (U15, U16, U17, U18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(meetingsApi.getMeetingDetail).mockResolvedValue(mockMeeting);
    vi.mocked(meetingsApi.getMeetingAudioUrl).mockResolvedValue({ url: 'http://test.audio', expires_in: 3600 });
  });

  it('renders template selector, translation selector, and email draft button', async () => {
    renderDetailPage();

    expect(await screen.findByTestId('template-select')).toBeInTheDocument();
    expect(screen.getByTestId('translate-select')).toBeInTheDocument();
    expect(screen.getByTestId('email-draft-btn')).toBeInTheDocument();
    expect(screen.getByTestId('ask-ai-btn')).toBeInTheDocument();
  });

  it('switches note template and calls regenerateMeeting', async () => {
    vi.mocked(meetingsApi.regenerateMeeting).mockResolvedValueOnce({
      ...mockMeeting,
      template: 'standup',
    });

    renderDetailPage();

    const templateSelect = await screen.findByTestId('template-select');
    fireEvent.change(templateSelect, { target: { value: 'standup' } });

    await waitFor(() => {
      expect(meetingsApi.regenerateMeeting).toHaveBeenCalledWith('ai-m-123', 'standup');
    });
  });

  it('opens ask meeting chat drawer and displays chat input and send button', async () => {
    renderDetailPage();

    const askBtn = await screen.findByTestId('ask-ai-btn');
    fireEvent.click(askBtn);

    expect(await screen.findByTestId('chat-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    expect(screen.getByTestId('chat-send-btn')).toBeInTheDocument();
  });

  it('opens follow-up email draft modal and loads email data', async () => {
    renderDetailPage();

    const emailBtn = await screen.findByTestId('email-draft-btn');
    fireEvent.click(emailBtn);

    expect(await screen.findByText('Follow-Up Email Draft')).toBeInTheDocument();
    expect(await screen.findByText('Follow-up: Weekly Team Sync')).toBeInTheDocument();
  });
});

