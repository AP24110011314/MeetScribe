import { AuthTokens } from '@/types/auth';

const ACCESS_TOKEN_KEY = 'meetscribe_access_token';
const REFRESH_TOKEN_KEY = 'meetscribe_refresh_token';

export function getAccessToken(): string | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(ACCESS_TOKEN_KEY) : null;
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(REFRESH_TOKEN_KEY) : null;
  } catch {
    return null;
  }
}

export function setTokens(tokens: AuthTokens): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
      window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
    }
  } catch {
    // fallback
  }
}

export function clearTokens(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(ACCESS_TOKEN_KEY);
      window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  } catch {
    // fallback
  }
}

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export function getApiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (normalizedPath.startsWith('/api')) {
    return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
  }
  return API_BASE_URL ? `${API_BASE_URL}/api/v1${normalizedPath}` : `/api/v1${normalizedPath}`;
}

export async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    window.dispatchEvent(new Event('auth:unauthorized'));
    throw new Error('No refresh token available');
  }

  if (isRefreshing) {
    return new Promise<string>((resolve) => {
      subscribeTokenRefresh((newToken) => resolve(newToken));
    });
  }

  isRefreshing = true;
  try {
    const refreshRes = await fetch(getApiUrl('/api/v1/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!refreshRes.ok) {
      clearTokens();
      window.dispatchEvent(new Event('auth:unauthorized'));
      throw new Error('Session expired. Please log in again.');
    }

    const newTokens: AuthTokens = await refreshRes.json();
    setTokens(newTokens);
    isRefreshing = false;
    onRefreshed(newTokens.access_token);
    return newTokens.access_token;
  } catch (err) {
    isRefreshing = false;
    clearTokens();
    window.dispatchEvent(new Event('auth:unauthorized'));
    throw err;
  }
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = getApiUrl(endpoint);

  const headers = new Headers(options.headers || {});
  const token = getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let signal = options.signal;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  if (!signal && typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    signal = controller.signal;
    timeoutTimer = setTimeout(() => controller.abort(new Error('Request timed out')), 30000);
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers, signal });
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }

  // If unauthorized and we have a refresh token, attempt token refresh once
  if (response.status === 401 && getRefreshToken() && !endpoint.includes('/auth/refresh') && !endpoint.includes('/auth/login')) {
    try {
      const newToken = await refreshAccessToken();
      headers.set('Authorization', `Bearer ${newToken}`);
      response = await fetch(url, { ...options, headers });
    } catch {
      // already handled in refreshAccessToken
    }
  }

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody && errBody.detail) {
        if (typeof errBody.detail === 'string') {
          errorDetail = errBody.detail;
        } else if (Array.isArray(errBody.detail) && errBody.detail.length > 0) {
          errorDetail = errBody.detail[0].msg || JSON.stringify(errBody.detail[0]);
        }
      }
    } catch {
      // not JSON
    }
    throw new Error(errorDetail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export async function apiFetchBlob(
  endpoint: string,
  options: RequestInit = {}
): Promise<Blob> {
  const url = getApiUrl(endpoint);

  const headers = new Headers(options.headers || {});
  const token = getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let signal = options.signal;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  if (!signal && typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    signal = controller.signal;
    timeoutTimer = setTimeout(() => controller.abort(new Error('Request timed out')), 60000);
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers, signal });
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }

  if (response.status === 401 && getRefreshToken() && !endpoint.includes('/auth/refresh') && !endpoint.includes('/auth/login')) {
    try {
      const newToken = await refreshAccessToken();
      headers.set('Authorization', `Bearer ${newToken}`);
      response = await fetch(url, { ...options, headers });
    } catch {
      // already handled
    }
  }

  if (!response.ok) {
    let errorDetail = `Export failed with status ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody && errBody.detail) {
        if (typeof errBody.detail === 'string') {
          errorDetail = errBody.detail;
        } else if (Array.isArray(errBody.detail) && errBody.detail.length > 0) {
          errorDetail = errBody.detail[0].msg || JSON.stringify(errBody.detail[0]);
        }
      }
    } catch {
      // not JSON
    }
    throw new Error(errorDetail);
  }

  return response.blob();
}
