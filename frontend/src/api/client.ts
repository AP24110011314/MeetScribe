/**
 * Minimal typed API client. All requests go to relative `/api/v1/...` paths; the Vite
 * dev proxy (or the production reverse proxy) forwards them to the backend (D10).
 */

const API_BASE = "/api/v1";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface ErrorBody {
  detail?: string;
  code?: string;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let body: ErrorBody = {};
    try {
      body = (await response.json()) as ErrorBody;
    } catch {
      // Non-JSON error body; fall through to the generic message below.
    }
    throw new ApiError(
      body.detail ?? `Request failed with status ${response.status}`,
      response.status,
      body.code,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
