import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/Toast';
import { UploadPage } from '@/pages/UploadPage';

vi.mock('@/api/meetings', () => ({
  uploadAudioFile: vi.fn(),
  getMeetingStatus: vi.fn(),
  retryMeeting: vi.fn(),
}));

import * as meetingsApi from '@/api/meetings';

function renderUploadPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    </ToastProvider>
  );
}

describe('Upload Experience & Step Tracker (U05, U06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders upload dropzone and hidden input', () => {
    renderUploadPage();

    expect(screen.getByTestId('upload-dropzone')).toBeInTheDocument();
    expect(screen.getByTestId('upload-file-input')).toBeInTheDocument();
  });

  it('validates file extension and rejects invalid file formats', async () => {
    renderUploadPage();

    const input = screen.getByTestId('upload-file-input') as HTMLInputElement;
    const badFile = new File(['dummy'], 'notes.txt', { type: 'text/plain' });

    fireEvent.change(input, { target: { files: [badFile] } });

    expect(await screen.findByText('Invalid File')).toBeInTheDocument();
    expect(screen.queryByTestId('step-tracker')).not.toBeInTheDocument();
    expect(meetingsApi.uploadAudioFile).not.toHaveBeenCalled();
  });

  it('validates file size limit and rejects files > 500 MB', async () => {
    renderUploadPage();

    const input = screen.getByTestId('upload-file-input') as HTMLInputElement;
    // Create large dummy file
    const largeFile = new File(['dummy'], 'giant.wav', { type: 'audio/wav' });
    Object.defineProperty(largeFile, 'size', { value: 600 * 1024 * 1024 });

    fireEvent.change(input, { target: { files: [largeFile] } });

    expect(await screen.findByText('Invalid File')).toBeInTheDocument();
    expect(meetingsApi.uploadAudioFile).not.toHaveBeenCalled();
  });

  it('progresses through step tracker upon upload and status updates', async () => {
    vi.mocked(meetingsApi.uploadAudioFile).mockImplementation(async (_file, onProgress) => {
      if (onProgress) onProgress(100);
      return 'm-test-123';
    });

    vi.mocked(meetingsApi.getMeetingStatus).mockResolvedValue({
      meeting_id: 'm-test-123',
      status: 'processing',
      stage: 'transcribe',
      progress_pct: 50,
      error_message: null,
      process_attempts: 1,
    });

    renderUploadPage();

    const input = screen.getByTestId('upload-file-input') as HTMLInputElement;
    const validFile = new File(['RIFF audio'], 'meeting.mp3', { type: 'audio/mp3' });
    Object.defineProperty(validFile, 'size', { value: 1024 * 1024 });

    fireEvent.change(input, { target: { files: [validFile] } });

    // Step tracker displays
    expect(await screen.findByTestId('step-tracker')).toBeInTheDocument();
    expect(screen.getByTestId('step-uploaded')).toBeInTheDocument();
    expect(screen.getByTestId('step-preparing')).toBeInTheDocument();
    expect(screen.getByTestId('step-transcribing')).toBeInTheDocument();
    expect(screen.getByTestId('step-analyzing')).toBeInTheDocument();
    expect(screen.getByTestId('step-done')).toBeInTheDocument();
  });

  it('shows readable error and retry button when processing fails', async () => {
    vi.mocked(meetingsApi.uploadAudioFile).mockResolvedValueOnce('m-failed-123');
    vi.mocked(meetingsApi.getMeetingStatus).mockResolvedValue({
      meeting_id: 'm-failed-123',
      status: 'failed',
      stage: 'transcribe',
      progress_pct: 25,
      error_message: 'Whisper encountered audio corruption',
      process_attempts: 3,
    });
    vi.mocked(meetingsApi.retryMeeting).mockResolvedValueOnce({
      meeting_id: 'm-failed-123',
      status: 'queued',
      stage: null,
      progress_pct: 5,
      error_message: null,
      process_attempts: 0,
    });

    renderUploadPage();

    const input = screen.getByTestId('upload-file-input') as HTMLInputElement;
    const validFile = new File(['RIFF audio'], 'meeting.mp3', { type: 'audio/mp3' });
    fireEvent.change(input, { target: { files: [validFile] } });

    // Wait for failure state
    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    }, { timeout: 3500 });

    expect(screen.getAllByText('Whisper encountered audio corruption').length).toBeGreaterThanOrEqual(1);

    // Click retry
    fireEvent.click(screen.getByTestId('retry-button'));
    await waitFor(() => {
      expect(meetingsApi.retryMeeting).toHaveBeenCalledWith('m-failed-123');
    });
  });
});
