import type { MeetingStatus } from "../api/meetings";

const STYLES: Record<MeetingStatus, string> = {
  pending_upload: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  queued: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
  preparing: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  transcribing: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  analyzing: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  done: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

const LABELS: Record<MeetingStatus, string> = {
  pending_upload: "Pending upload",
  queued: "Queued",
  preparing: "Preparing",
  transcribing: "Transcribing",
  analyzing: "Analyzing",
  done: "Done",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: MeetingStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
