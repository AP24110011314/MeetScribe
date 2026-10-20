import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MeetingListItem } from "../api/meetings";
import { MeetingRow } from "../components/MeetingRow";
import { clearTokens } from "../lib/tokenStore";

function renderRow(meeting: MeetingListItem) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ul>
          <MeetingRow meeting={meeting} />
        </ul>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function baseMeeting(overrides: Partial<MeetingListItem> = {}): MeetingListItem {
  return {
    id: "m1",
    title: "Standup",
    original_filename: "standup.mp3",
    status: "transcribing",
    duration_sec: null,
    language: null,
    created_at: "2026-10-20T10:00:00Z",
    error_message: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MeetingRow polling", () => {
  beforeEach(() => {
    clearTokens();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("polls /status and shows a progress bar while processing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        status: "transcribing",
        stage: "transcribe",
        progress_pct: 40,
        error_message: null,
      }),
    );

    renderRow(baseMeeting());
    expect(await screen.findByTestId("progress-m1")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/meetings/m1/status",
        expect.anything(),
      ),
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText(/Processing… 40%/)).toBeInTheDocument();
  });

  it("does not re-poll a finished meeting", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        jsonResponse({
          status: "done",
          stage: "finalize",
          progress_pct: 100,
          error_message: null,
        }),
      );

    renderRow(baseMeeting({ status: "done" }));
    expect(await screen.findByText("Done")).toBeInTheDocument();
    // A terminal status means no repeating interval: exactly one initial fetch.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("progress-m1")).not.toBeInTheDocument();
  });

  it("surfaces a failure message", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        status: "failed",
        stage: "finalize",
        progress_pct: 0,
        error_message: "Processing timed out",
      }),
    );

    renderRow(baseMeeting({ status: "failed", error_message: null }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Processing timed out");
  });
});
