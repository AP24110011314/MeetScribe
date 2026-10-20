import { useRef, useState } from "react";

import { useUploadMeeting } from "../hooks/useMeetings";

const ACCEPT = ".mp3,.wav,.m4a,.mp4,.webm,.ogg";

/** Drag-and-drop uploader: POST /meetings → PUT to presigned URL → /complete. */
export function Uploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const upload = useUploadMeeting(setProgress);

  function start(file: File) {
    setProgress(0);
    upload.mutate(file, { onSettled: () => setProgress(0) });
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files.item(0);
    if (file) {
      start(file);
    }
  }

  const busy = upload.isPending;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition ${
          dragActive
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-gray-300 dark:border-gray-700"
        }`}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Drag and drop a recording here, or
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="mt-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Choose a file"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          aria-label="Upload recording"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.item(0);
            if (file) {
              start(file);
            }
            e.target.value = "";
          }}
        />
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          mp3, wav, m4a, mp4, webm, ogg
        </p>
      </div>

      {busy && (
        <div className="mt-4" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-2 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-800">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {progress < 100 ? `Uploading… ${progress}%` : "Processing upload…"}
          </p>
        </div>
      )}

      {upload.isError && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {upload.error.message}
        </p>
      )}
    </div>
  );
}
