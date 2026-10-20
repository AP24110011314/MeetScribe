import { useQuery } from "@tanstack/react-query";

import { getMeetingStatus, isTerminalStatus } from "../api/meetings";
import type { MeetingStatus, MeetingStatusResponse } from "../api/meetings";

export const meetingStatusQueryKey = (meetingId: string) =>
  ["meeting-status", meetingId] as const;

/** Poll a meeting's status every few seconds until it reaches a terminal state (API.md). */
export function useMeetingStatus(meetingId: string, initialStatus?: MeetingStatus) {
  return useQuery<MeetingStatusResponse>({
    queryKey: meetingStatusQueryKey(meetingId),
    queryFn: () => getMeetingStatus(meetingId),
    refetchInterval: (query) => {
      const status = query.state.data?.status ?? initialStatus;
      if (status !== undefined && isTerminalStatus(status)) {
        return false;
      }
      return 2500; // poll every 2-3 s (API.md)
    },
  });
}
