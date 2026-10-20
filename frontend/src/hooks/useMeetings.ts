import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { completeMeeting, createMeeting, listMeetings } from "../api/meetings";
import type { ListMeetingsParams, MeetingListItem } from "../api/meetings";
import { putToPresignedUrl } from "../lib/upload";

export const meetingsQueryKey = (params: ListMeetingsParams) =>
  ["meetings", params] as const;

export function useMeetings(params: ListMeetingsParams) {
  return useQuery({
    queryKey: meetingsQueryKey(params),
    queryFn: () => listMeetings(params),
  });
}

/** Upload a file: create → PUT to S3 → complete. Reports progress via callback. */
export function useUploadMeeting(onProgress?: (percent: number) => void) {
  const queryClient = useQueryClient();

  return useMutation<MeetingListItem, Error, File>({
    mutationFn: async (file: File) => {
      const contentType = file.type || "application/octet-stream";
      const created = await createMeeting(file.name, contentType, file.size);
      await putToPresignedUrl(created.upload_url, file, created.upload_headers, onProgress);
      return completeMeeting(created.meeting_id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}
