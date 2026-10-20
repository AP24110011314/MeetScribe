import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Meetings } from "../pages/Meetings";
import { clearTokens } from "../lib/tokenStore";

function renderMeetings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <Meetings />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A fresh Response per call: a single Response body can only be read once. */
function mockJson(body: unknown, status = 200): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse(body, status));
}

/** Minimal XMLHttpRequest stand-in that always succeeds (for the S3 PUT step). */
class FakeXhr {
  status = 200;
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(): void {}
  setRequestHeader(): void {}
  getResponseHeader(): string {
    return '"etag"';
  }
  send(): void {
    this.onload?.();
  }
}

describe("Meetings page", () => {
  beforeEach(() => {
    clearTokens();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an empty state when there are no meetings", async () => {
    mockJson({ items: [], page: 1, page_size: 10, total: 0 });
    renderMeetings();
    expect(await screen.findByText(/No meetings yet/)).toBeInTheDocument();
  });

  it("renders meetings with status badges", async () => {
    mockJson({
      items: [
          {
            id: "m1",
            title: "Sprint planning",
            original_filename: "sprint.mp3",
            status: "done",
            duration_sec: 120,
            language: "en",
            created_at: "2026-10-20T10:00:00Z",
          error_message: null,
        },
      ],
      page: 1,
      page_size: 10,
      total: 1,
    });
    renderMeetings();
    expect(await screen.findByText("Sprint planning")).toBeInTheDocument();
    const badge = screen.getByText("Done", { selector: "span" });
    expect(badge).toBeInTheDocument();
  });

  it("shows an error state when the request fails", async () => {
    mockJson({ detail: "Not authenticated", code: "NOT_AUTHENTICATED" }, 401);
    renderMeetings();
    expect(await screen.findByRole("alert")).toHaveTextContent("Not authenticated");
  });

  it("uploads a file through create → PUT → complete", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.endsWith("/meetings")) {
        return jsonResponse({
          meeting_id: "m1",
          upload_url: "http://fake-s3/put/key",
          upload_headers: { "Content-Type": "audio/mpeg" },
          expires_in: 900,
        });
      }
      if (url.includes("/complete")) {
        return jsonResponse({
          id: "m1",
          title: "standup.mp3",
          original_filename: "standup.mp3",
          status: "queued",
          duration_sec: null,
          language: null,
          created_at: "2026-10-20T10:00:00Z",
          error_message: null,
        });
      }
      return jsonResponse({ items: [], page: 1, page_size: 10, total: 0 });
    });

    renderMeetings();
    await screen.findByText(/No meetings yet/);

    const file = new File(["audio"], "standup.mp3", { type: "audio/mpeg" });
    await userEvent.upload(screen.getByLabelText("Upload recording"), file, {
      applyAccept: false,
    });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/meetings", expect.anything()),
    );
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/complete"))).toBe(true),
    );
  });
});
