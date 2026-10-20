import { useState } from "react";
import { Link } from "react-router-dom";

import type { MeetingStatus } from "../api/meetings";
import { StatusBadge } from "../components/StatusBadge";
import { Uploader } from "../components/Uploader";
import { useMeetings } from "../hooks/useMeetings";

const PAGE_SIZE = 10;

export function Meetings() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MeetingStatus | "">("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useMeetings({
    q: search || undefined,
    status: status || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">Your meetings</h1>

      <section className="mt-6">
        <Uploader />
      </section>

      <section className="mt-8">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(query);
          }}
        >
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium">
              Search
            </label>
            <input
              id="search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Title or filename"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
            />
          </div>
          <div>
            <label htmlFor="status" className="block text-sm font-medium">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as MeetingStatus | "");
              }}
              className="mt-1 rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="">All</option>
              <option value="pending_upload">Pending upload</option>
              <option value="queued">Queued</option>
              <option value="transcribing">Transcribing</option>
              <option value="analyzing">Analyzing</option>
              <option value="done">Done</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <button type="submit" className="rounded bg-gray-800 px-4 py-2 text-sm text-white dark:bg-gray-200 dark:text-gray-900">
            Apply
          </button>
        </form>
      </section>

      <section className="mt-6">
        {isLoading && <p className="text-gray-500">Loading meetings…</p>}
        {isError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error.message}
          </p>
        )}
        {data && data.items.length === 0 && (
          <p className="rounded border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700">
            No meetings yet. Upload a recording to get started.
          </p>
        )}
        {data && data.items.length > 0 && (
          <ul className="divide-y divide-gray-200 dark:divide-gray-800">
            {data.items.map((meeting) => (
              <li key={meeting.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <Link
                    to={`/meetings/${meeting.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {meeting.title ?? meeting.original_filename}
                  </Link>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(meeting.created_at).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={meeting.status} />
              </li>
            ))}
          </ul>
        )}

        {data && data.total > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border px-3 py-1 disabled:opacity-40 dark:border-gray-700"
            >
              Previous
            </button>
            <span className="text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border px-3 py-1 disabled:opacity-40 dark:border-gray-700"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
