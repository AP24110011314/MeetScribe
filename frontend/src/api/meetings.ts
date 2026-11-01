import { apiFetch, getApiUrl } from './client';
import {
  ActionItemData,
  AudioUrlData,
  BookmarkData,
  ChatHistoryData,
  CitationData,
  FolderData,
  FollowUpEmailData,
  GlobalChatData,
  MeetingChaptersData,
  MeetingDetailData,
  MeetingInsightsData,
  MeetingListItem,
  MeetingListResponse,
  MeetingStatusData,
  PresignedUploadResponse,
  TagData,
  TranscriptData,
  TranslatedNotesData,
  TrashItemData,
  PublicShareResponse,
  ShareLinkCreateRequest,
  ShareLinkData,
  WebhookCreateRequest,
  WebhookData,
  WebhookDeliveryData,
  NotificationData,
} from '@/types/meeting';

export async function getMeetings(params: {
  q?: string;
  status?: string;
  folder_id?: string;
  tag_id?: string;
  is_starred?: boolean;
  sort?: string;
  order?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<MeetingListResponse> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.status) query.set('status', params.status);
  if (params.folder_id) query.set('folder_id', params.folder_id);
  if (params.tag_id) query.set('tag_id', params.tag_id);
  if (params.is_starred !== undefined) query.set('is_starred', params.is_starred ? 'true' : 'false');
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
  return apiFetch<PresignedUploadResponse>('/meetings', {
    method: 'POST',
    body: JSON.stringify({ filename, content_type, size_bytes }),
  });
}

export async function completeUpload(meetingId: string): Promise<MeetingStatusData> {
  return apiFetch<MeetingStatusData>(`/meetings/${meetingId}/complete`, {
    method: 'POST',
  });
}

export async function uploadAudioFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const mimeType =
    file.type ||
    (file.name.endsWith('.mp3')
      ? 'audio/mpeg'
      : file.name.endsWith('.wav')
      ? 'audio/wav'
      : file.name.endsWith('.m4a')
      ? 'audio/mp4'
      : file.name.endsWith('.mp4')
      ? 'video/mp4'
      : 'audio/mpeg');

  // 1. Request presigned URL
  const uploadInfo = await requestPresignedUpload(file.name, mimeType, file.size);

  // 2. Upload file directly via presigned PUT
  console.log(`[Upload] Uploading ${file.name} to presigned URL:`, uploadInfo.upload_url);
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
      xhr.setRequestHeader('Content-Type', mimeType);
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

    xhr.onerror = () => {
      console.error('Network error uploading file to URL:', uploadInfo.upload_url);
      reject(new Error('Network error during file upload. Check your S3 bucket CORS configuration.'));
    };
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

export async function exportMeetingNotes(
  id: string,
  format: 'md' | 'pdf' | 'docx' | 'txt' | 'json' | 'srt' | 'vtt' | 'ics' | string
): Promise<void> {
  const token = localStorage.getItem('meetscribe_access_token');
  const res = await fetch(getApiUrl(`/api/v1/meetings/${id}/export?format=${format}`), {
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

// Folders API
export async function getFolders(): Promise<{ items: FolderData[] }> {
  return apiFetch<{ items: FolderData[] }>('/folders');
}

export async function createFolder(data: { name: string; color?: string }): Promise<FolderData> {
  return apiFetch<FolderData>('/folders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateFolder(id: string, data: { name?: string; color?: string }): Promise<FolderData> {
  return apiFetch<FolderData>(`/folders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteFolder(id: string): Promise<void> {
  await apiFetch<void>(`/folders/${id}`, { method: 'DELETE' });
}

// Tags API
export async function getTags(): Promise<TagData[]> {
  return apiFetch<TagData[]>('/tags');
}

export async function createTag(data: { name: string; color?: string }): Promise<TagData> {
  return apiFetch<TagData>('/tags', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteTag(id: string): Promise<void> {
  await apiFetch<void>(`/tags/${id}`, { method: 'DELETE' });
}

export async function updateMeetingTags(meetingId: string, tagIds: string[]): Promise<TagData[]> {
  return apiFetch<TagData[]>(`/meetings/${meetingId}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tag_ids: tagIds }),
  });
}

// Organization & Bulk
export async function organizeMeeting(
  meetingId: string,
  data: { folder_id?: string | null; is_starred?: boolean; is_pinned?: boolean }
): Promise<MeetingDetailData> {
  return apiFetch<MeetingDetailData>(`/meetings/${meetingId}/organize`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function bulkMeetings(data: {
  meeting_ids: string[];
  action: 'star' | 'unstar' | 'pin' | 'unpin' | 'move' | 'tag' | 'trash' | 'delete';
  folder_id?: string | null;
  tag_ids?: string[];
}): Promise<{ affected_count: number; action: string; undo_payload?: Record<string, unknown> }> {
  return apiFetch<{ affected_count: number; action: string; undo_payload?: Record<string, unknown> }>(
    '/meetings/bulk',
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

// Trash API
export async function getTrash(): Promise<{ items: TrashItemData[]; total: number }> {
  return apiFetch<{ items: TrashItemData[]; total: number }>('/trash');
}

export async function restoreMeeting(id: string): Promise<{ status: string; id: string }> {
  return apiFetch<{ status: string; id: string }>(`/trash/${id}/restore`, {
    method: 'POST',
  });
}

export async function deleteMeetingForever(id: string): Promise<void> {
  await apiFetch<void>(`/trash/${id}`, { method: 'DELETE' });
}

export async function emptyTrash(): Promise<{ deleted_count: number }> {
  return apiFetch<{ deleted_count: number }>('/trash/empty/all', { method: 'DELETE' });
}

// Transcript Segment Editing & Revert
export async function editTranscriptSegment(
  meetingId: string,
  segmentIndex: number,
  text: string
): Promise<TranscriptData> {
  return apiFetch<TranscriptData>(`/meetings/${meetingId}/transcript/segment`, {
    method: 'PATCH',
    body: JSON.stringify({ segment_index: segmentIndex, text }),
  });
}

export async function revertTranscript(meetingId: string): Promise<TranscriptData> {
  return apiFetch<TranscriptData>(`/meetings/${meetingId}/transcript/revert`, {
    method: 'POST',
  });
}

// Bookmarks / Moments API
export async function getBookmarks(meetingId: string): Promise<BookmarkData[]> {
  return apiFetch<BookmarkData[]>(`/meetings/${meetingId}/bookmarks`);
}

export async function createBookmark(
  meetingId: string,
  data: { timestamp_sec: number; note: string }
): Promise<BookmarkData> {
  return apiFetch<BookmarkData>(`/meetings/${meetingId}/bookmarks`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteBookmark(meetingId: string, bookmarkId: string): Promise<void> {
  await apiFetch<void>(`/meetings/${meetingId}/bookmarks/${bookmarkId}`, {
    method: 'DELETE',
  });
}

// Paste Transcript API
export async function pasteTranscriptMeeting(data: {
  title: string;
  transcript_text: string;
}): Promise<MeetingDetailData> {
  return apiFetch<MeetingDetailData>('/meetings/paste', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// AI Features API
export async function streamMeetingChat(
  meetingId: string,
  message: string,
  onToken: (token: string) => void,
  onDone: (citations: CitationData[]) => void
): Promise<void> {
  const token = localStorage.getItem('meetscribe_access_token');
  const res = await fetch(getApiUrl(`/api/v1/meetings/${meetingId}/chat`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    throw new Error(`Chat error: status ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  let streamDone = false;
  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) {
      streamDone = true;
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const jsonStr = trimmed.slice(6);
      try {
        const payload = JSON.parse(jsonStr);
        if (payload.token) {
          onToken(payload.token);
        }
        if (payload.done) {
          onDone(payload.citations || []);
        }
      } catch {
        // ignore parse errors
      }
    }
  }
}

export async function getMeetingChatHistory(meetingId: string): Promise<ChatHistoryData> {
  return apiFetch<ChatHistoryData>(`/meetings/${meetingId}/chat/history`);
}

export async function globalChat(query: string): Promise<GlobalChatData> {
  return apiFetch<GlobalChatData>('/chat/global', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export async function regenerateMeeting(
  meetingId: string,
  template: string
): Promise<MeetingDetailData> {
  return apiFetch<MeetingDetailData>(`/meetings/${meetingId}/regenerate`, {
    method: 'POST',
    body: JSON.stringify({ template }),
  });
}

export async function getMeetingChapters(meetingId: string): Promise<MeetingChaptersData> {
  return apiFetch<MeetingChaptersData>(`/meetings/${meetingId}/chapters`);
}

export async function generateFollowUpEmail(
  meetingId: string,
  tone: 'formal' | 'friendly' | 'brief'
): Promise<FollowUpEmailData> {
  return apiFetch<FollowUpEmailData>(`/meetings/${meetingId}/email`, {
    method: 'POST',
    body: JSON.stringify({ tone }),
  });
}

export async function translateMeetingNotes(
  meetingId: string,
  targetLanguage: string
): Promise<TranslatedNotesData> {
  return apiFetch<TranslatedNotesData>(`/meetings/${meetingId}/translate`, {
    method: 'POST',
    body: JSON.stringify({ target_language: targetLanguage }),
  });
}

export async function getMeetingInsights(meetingId: string): Promise<MeetingInsightsData> {
  return apiFetch<MeetingInsightsData>(`/meetings/${meetingId}/insights`);
}

// --- Phase C: Share Links ---
export async function createShareLink(
  meetingId: string,
  data: ShareLinkCreateRequest
): Promise<ShareLinkData> {
  return apiFetch<ShareLinkData>(`/meetings/${meetingId}/share`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listShareLinks(meetingId: string): Promise<ShareLinkData[]> {
  return apiFetch<ShareLinkData[]>(`/meetings/${meetingId}/share`);
}

export async function revokeShareLink(meetingId: string, linkId: string): Promise<void> {
  await apiFetch<void>(`/meetings/${meetingId}/share/${linkId}`, {
    method: 'DELETE',
  });
}

export async function getPublicShare(token: string): Promise<PublicShareResponse> {
  return apiFetch<PublicShareResponse>(`/share/${token}`);
}

export async function unlockPublicShare(
  token: string,
  password: string
): Promise<PublicShareResponse> {
  return apiFetch<PublicShareResponse>(`/share/${token}/unlock`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

// --- Phase C: Webhooks ---
export async function listWebhooks(): Promise<WebhookData[]> {
  return apiFetch<WebhookData[]>('/webhooks');
}

export async function createWebhook(data: WebhookCreateRequest): Promise<WebhookData> {
  return apiFetch<WebhookData>('/webhooks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteWebhook(id: string): Promise<void> {
  await apiFetch<void>(`/webhooks/${id}`, {
    method: 'DELETE',
  });
}

export async function testWebhook(id: string): Promise<WebhookDeliveryData> {
  return apiFetch<WebhookDeliveryData>(`/webhooks/${id}/test`, {
    method: 'POST',
  });
}

export async function listWebhookDeliveries(id: string): Promise<WebhookDeliveryData[]> {
  return apiFetch<WebhookDeliveryData[]>(`/webhooks/${id}/deliveries`);
}

// --- Phase D: Notifications ---
export async function getNotifications(
  unreadOnly: boolean = false
): Promise<{ items: NotificationData[]; unread_count: number; total: number }> {
  return apiFetch<{ items: NotificationData[]; unread_count: number; total: number }>(
    `/notifications?unread_only=${unreadOnly}`
  );
}

export async function markNotificationRead(id: string): Promise<NotificationData> {
  return apiFetch<NotificationData>(`/notifications/${id}/read`, {
    method: 'PATCH',
  });
}

export async function markAllNotificationsRead(): Promise<{ status: string; marked_count: number }> {
  return apiFetch<{ status: string; marked_count: number }>('/notifications/read-all', {
    method: 'POST',
  });
}

// --- Phase D: Account Data & Deletion ---
export async function exportAccountData(): Promise<void> {
  const token = localStorage.getItem('meetscribe_access_token');
  const res = await fetch(getApiUrl('/api/v1/account/export'), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Export failed with status ${res.status}`);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meetscribe_export_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function deleteAccount(): Promise<void> {
  await apiFetch<void>('/account', {
    method: 'DELETE',
  });
}



