export interface TagData {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface FolderData {
  id: string;
  name: string;
  color: string;
  meeting_count: number;
  created_at: string;
}

export interface BookmarkData {
  id: string;
  meeting_id: string;
  timestamp_sec: number;
  note: string;
  created_at: string;
}

export interface TrashItemData {
  id: string;
  title: string;
  duration_sec: number | null;
  created_at: string;
  deleted_at: string;
  days_until_purge: number;
}

export interface MeetingListItem {
  id: string;
  title: string;
  status: string;
  duration_sec: number | null;
  created_at: string;
  has_transcript: boolean;
  action_items_count: number;
  folder_id?: string | null;
  is_starred: boolean;
  is_pinned: boolean;
  tags?: TagData[];
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
  folder_id?: string | null;
  is_starred: boolean;
  is_pinned: boolean;
  template: string;
  tags?: TagData[];
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
  original_text?: string;
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

export interface CitationData {
  tag: string;
  timestamp_sec: number;
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: CitationData[];
  created_at: string;
}

export interface ChatHistoryData {
  meeting_id?: string;
  messages: ChatMessageData[];
}

export interface GlobalChatReference {
  meeting_id: string;
  title: string;
  snippet: string;
}

export interface GlobalChatData {
  answer: string;
  references: GlobalChatReference[];
}

export interface ChapterItemData {
  title: string;
  start_sec: number;
  end_sec: number;
  summary: string;
}

export interface MeetingChaptersData {
  meeting_id: string;
  chapters: ChapterItemData[];
}

export interface FollowUpEmailData {
  subject: string;
  recipient_suggestion: string;
  body: string;
}

export interface TranslatedNotesData {
  language: string;
  title: string;
  summary: string;
  key_points: string[];
  decisions: string[];
  action_items: Array<{
    description: string;
    owner: string | null;
    due_date: string | null;
    priority: string;
  }>;
}

export interface SpeakerInsightData {
  speaker: string;
  talk_time_pct: number;
}

export interface MeetingInsightsData {
  sentiment: string;
  pace_wpm: number;
  top_keywords: string[];
  unanswered_questions: string[];
  speaker_distribution: SpeakerInsightData[];
}

export interface ShareLinkData {
  id: string;
  meeting_id: string;
  token?: string;
  share_url?: string;
  has_password: boolean;
  expires_at: string | null;
  hide_transcript: boolean;
  view_count: number;
  is_revoked: boolean;
  created_at: string;
}

export interface ShareLinkCreateRequest {
  expires_in_days?: number | null;
  password?: string | null;
  hide_transcript?: boolean;
}

export interface PublicShareResponse {
  title: string;
  created_at: string | null;
  duration_sec: number | null;
  language: string | null;
  summary: SummaryData | null;
  action_items: Array<{
    id: string;
    description: string;
    owner: string | null;
    due_date: string | null;
    priority: string;
    status: string;
  }>;
  transcript?: {
    full_text: string;
    segments: TranscriptSegmentData[];
  } | null;
  hide_transcript: boolean;
}

export interface WebhookData {
  id: string;
  user_id: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookCreateRequest {
  url: string;
  events: string[];
}

export interface WebhookDeliveryData {
  id: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown>;
  status_code: number | null;
  response_body: string | null;
  success: boolean;
  attempts: number;
  created_at: string;
}

export interface NotificationData {
  id: string;
  type: string;
  title: string;
  message: string;
  link_url?: string | null;
  is_read: boolean;
  created_at: string;
}


