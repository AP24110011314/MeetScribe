/**
 * Typed API client. Requests go to relative `/api/v1/...` paths (D10) and attach the
 * access token. On a 401 the client attempts a single refresh and retries once (D3).
 */

import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "../lib/tokenStore";

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

/** True when a parsed body looks like the API's `{detail, code}` error shape. */
export function isApiErrorPayload(value: unknown): boolean {
  return typeof value === "object" && value !== null && typeof (value as ErrorBody).detail === "string";
}

/** Whether a failed response should trigger one token refresh + retry. */
export function shouldRefresh(status: number, alreadyRetried: boolean): boolean {
  return status === 401 && !alreadyRetried;
}

interface AccessTokenResponse {
  access_token: string;
  token_type: string;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Internal: prevents infinite refresh loops. */
  _retried?: boolean;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return null;
  }
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) {
    clearTokens();
    return null;
  }
  const data = (await response.json()) as AccessTokenResponse;
  const access = getAccessToken();
  if (access !== null) {
    setTokens({ accessToken: data.access_token, refreshToken });
  }
  return data.access_token;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, _retried = false } = options;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const accessToken = getAccessToken();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (shouldRefresh(response.status, _retried)) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return apiFetch<T>(path, { ...options, _retried: true });
    }
  }

  if (!response.ok) {
    let errorBody: ErrorBody = {};
    try {
      errorBody = (await response.json()) as ErrorBody;
    } catch {
      // Non-JSON error body; use the generic message below.
    }
    throw new ApiError(
      errorBody.detail ?? `Request failed with status ${response.status}`,
      response.status,
      errorBody.code,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
