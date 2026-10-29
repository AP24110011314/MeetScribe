export interface MeetingListItem {
  id: string;
  title: string;
  status: string;
  duration_sec: number | null;
  created_at: string;
  has_transcript: boolean;
  action_items_count: number;
}

export interface MeetingListResponse {
  items: MeetingListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface SummaryData {
  summary: string;
  key_points: string[];
  decisions: string[];
}

export interface ActionItemData {
  id: string;
  meeting_id: string;
  meeting_title?: string;
  description: string;
  owner: string | null;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  source_start_sec: number | null;
  created_by_ai: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActionItemListResponse {
  items: ActionItemData[];
  total: number;
  page: number;
  page_size: number;
}

export interface MeetingDetailData {
  id: string;
  title: string;
  title_edited: boolean;
  status: string;
  stage: string | null;
  progress_pct: number;
  error_message: string | null;
  duration_sec: number | null;
  language: string | null;
  has_transcript: boolean;
  created_at: string;
  updated_at: string;
  summary: SummaryData | null;
  action_items: ActionItemData[];
}

export interface MeetingStatusData {
  meeting_id: string;
  status: string;
  stage: string | null;
  progress_pct: number;
  error_message: string | null;
  process_attempts: number;
}

export interface TranscriptSegmentData {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptData {
  language: string;
  full_text: string;
  segments: TranscriptSegmentData[];
  matching_segment_ids?: number[];
}

export interface AudioUrlData {
  url: string;
  expires_in: number;
}

export interface PresignedUploadResponse {
  meeting_id: string;
  upload_url: string;
  upload_method: string;
  upload_headers: Record<string, string>;
  expires_in: number;
  storage_backend: string;
}

