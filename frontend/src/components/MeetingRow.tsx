import { Link } from "react-router-dom";

import { isTerminalStatus } from "../api/meetings";
import type { MeetingListItem } from "../api/meetings";
import { useMeetingStatus } from "../hooks/useMeetingStatus";
import { ProgressBar } from "./ProgressBar";
import { StatusBadge } from "./StatusBadge";

/** One row in the meetings list. Polls `/status` while the meeting is processing (F3). */
export function MeetingRow({ meeting }: { meeting: MeetingListItem }) {
  const processing = !isTerminalStatus(meeting.status);
  const { data } = useMeetingStatus(meeting.id, meeting.status);

  const status = data?.status ?? meeting.status;
  const progress = data?.progress_pct ?? (status === "done" ? 100 : 0);
  const errorMessage = data?.error_message ?? meeting.error_message;

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link to={`/meetings/${meeting.id}`} className="truncate font-medium hover:underline">
            {meeting.title ?? meeting.original_filename}
          </Link>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {new Date(meeting.created_at).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {processing && (
        <div className="mt-2" data-testid={`progress-${meeting.id}`}>
          <ProgressBar percent={progress} />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Processing… {progress}%
          </p>
        </div>
      )}

      {status === "failed" && errorMessage && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}
    </li>
  );
}
