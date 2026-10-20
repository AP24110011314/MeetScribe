/** Meeting API types and calls (docs/API.md). */

import { apiFetch } from "./client";

export type MeetingStatus =
  | "pending_upload"
  | "queued"
  | "preparing"
  | "transcribing"
  | "analyzing"
  | "done"
  | "failed";

export interface MeetingListItem {
  id: string;
  title: string | null;
  original_filename: string;
  status: MeetingStatus;
  duration_sec: number | null;
  language: string | null;
  created_at: string;
  error_message: string | null;
}

export interface PaginatedMeetings {
  items: MeetingListItem[];
  page: number;
  page_size: number;
  total: number;
}

export interface CreateMeetingResponse {
  meeting_id: string;
  upload_url: string;
  upload_headers: Record<string, string>;
  expires_in: number;
}

export type JobStage = "prepare" | "transcribe" | "analyze" | "finalize";

export interface MeetingStatusResponse {
  status: MeetingStatus;
  stage: JobStage | null;
  progress_pct: number;
  error_message: string | null;
}

export interface ListMeetingsParams {
  q?: string;
  status?: MeetingStatus;
  page?: number;
  pageSize?: number;
}

export function createMeeting(
  filename: string,
  contentType: string,
  sizeBytes: number,
): Promise<CreateMeetingResponse> {
  return apiFetch<CreateMeetingResponse>("/meetings", {
    method: "POST",
    body: { filename, content_type: contentType, size_bytes: sizeBytes },
  });
}

export function completeMeeting(meetingId: string): Promise<MeetingListItem> {
  return apiFetch<MeetingListItem>(`/meetings/${meetingId}/complete`, { method: "POST" });
}

export function getMeetingStatus(meetingId: string): Promise<MeetingStatusResponse> {
  return apiFetch<MeetingStatusResponse>(`/meetings/${meetingId}/status`);
}

/** Statuses that mean processing is finished; polling stops there (API.md). */
export function isTerminalStatus(status: MeetingStatus): boolean {
  return status === "done" || status === "failed" || status === "pending_upload";
}

export function listMeetings(params: ListMeetingsParams = {}): Promise<PaginatedMeetings> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  search.set("page", String(params.page ?? 1));
  search.set("page_size", String(params.pageSize ?? 20));
  return apiFetch<PaginatedMeetings>(`/meetings?${search.toString()}`);
}
