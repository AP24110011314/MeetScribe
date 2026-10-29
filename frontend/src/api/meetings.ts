import { apiFetch } from './client';
import {
  ActionItemData,
  AudioUrlData,
  MeetingDetailData,
  MeetingListItem,
  MeetingListResponse,
  MeetingStatusData,
  PresignedUploadResponse,
  TranscriptData,
} from '@/types/meeting';

export async function getMeetings(params: {
  q?: string;
  status?: string;
  sort?: string;
  order?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<MeetingListResponse> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.status) query.set('status', params.status);
  if (params.sort) query.set('sort', params.sort);
  if (params.order) query.set('order', params.order);
  if (params.page) query.set('page', params.page.toString());
  if (params.page_size) query.set('page_size', params.page_size.toString());

  const qs = query.toString();
  return apiFetch<MeetingListResponse>(`/meetings${qs ? `?${qs}` : ''}`);
}

export async function getMeetingDetail(id: string): Promise<MeetingDetailData> {
  return apiFetch<MeetingDetailData>(`/meetings/${id}`);
}

export async function getMeetingStatus(id: string): Promise<MeetingStatusData> {
  return apiFetch<MeetingStatusData>(`/meetings/${id}/status`);
}

export async function getMeetingTranscript(id: string, q?: string): Promise<TranscriptData> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiFetch<TranscriptData>(`/meetings/${id}/transcript${qs}`);
}

export async function getMeetingAudioUrl(id: string): Promise<AudioUrlData> {
  return apiFetch<AudioUrlData>(`/meetings/${id}/audio-url`);
}

export async function requestPresignedUpload(
  filename: string,
  content_type: string,
  size_bytes: number
): Promise<PresignedUploadResponse> {
  return apiFetch<PresignedUploadResponse>('/meetings/upload', {
    method: 'POST',
    body: JSON.stringify({ filename, content_type, size_bytes }),
  });
}

export async function completeUpload(meetingId: string): Promise<MeetingStatusData> {
  return apiFetch<MeetingStatusData>(`/meetings/${meetingId}/upload-complete`, {
    method: 'POST',
  });
}

export async function uploadAudioFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  // 1. Request presigned URL
  const uploadInfo = await requestPresignedUpload(file.name, file.type || 'audio/wav', file.size);

  // 2. Upload file directly via presigned PUT
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(uploadInfo.upload_method || 'PUT', uploadInfo.upload_url);

    // Apply any required presigned headers
    if (uploadInfo.upload_headers) {
      Object.entries(uploadInfo.upload_headers).forEach(([k, v]) => {
        xhr.setRequestHeader(k, v);
      });
    }

    if (!uploadInfo.upload_headers || !uploadInfo.upload_headers['Content-Type']) {
      xhr.setRequestHeader('Content-Type', file.type || 'audio/wav');
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          onProgress(pct);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Storage upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during file upload'));
    xhr.send(file);
  });

  // 3. Mark complete & enqueue pipeline
  await completeUpload(uploadInfo.meeting_id);
  return uploadInfo.meeting_id;
}

export async function renameMeeting(id: string, title: string): Promise<MeetingListItem> {
  return apiFetch<MeetingListItem>(`/meetings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export async function deleteMeeting(id: string): Promise<void> {
  await apiFetch<void>(`/meetings/${id}`, {
    method: 'DELETE',
  });
}

export async function retryMeeting(id: string): Promise<MeetingStatusData> {
  return apiFetch<MeetingStatusData>(`/meetings/${id}/retry`, {
    method: 'POST',
  });
}

export async function exportMeetingNotes(id: string, format: 'md' | 'pdf'): Promise<void> {
  const token = localStorage.getItem('meetscribe_access_token');
  const res = await fetch(`/api/v1/meetings/${id}/export?format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    throw new Error(`Export failed with status ${res.status}`);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meeting_notes.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function createMeetingActionItem(
  meetingId: string,
  data: {
    description: string;
    owner?: string | null;
    due_date?: string | null;
    priority?: 'low' | 'medium' | 'high';
    status?: 'open' | 'in_progress' | 'completed' | 'cancelled';
  }
): Promise<ActionItemData> {
  return apiFetch<ActionItemData>(`/meetings/${meetingId}/action-items`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
