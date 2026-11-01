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

  const response = await fetch(url, { ...options, headers });

  // If unauthorized and we have a refresh token, attempt token refresh once
  if (response.status === 401 && getRefreshToken() && !endpoint.includes('/auth/refresh') && !endpoint.includes('/auth/login')) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshToken = getRefreshToken();
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
      } catch (err) {
        isRefreshing = false;
        clearTokens();
        window.dispatchEvent(new Event('auth:unauthorized'));
        throw err;
      }
    }

    // Wait for the new token and retry the original request
    const retryPromise = new Promise<T>((resolve, reject) => {
      subscribeTokenRefresh(async (newToken) => {
        try {
          headers.set('Authorization', `Bearer ${newToken}`);
          const retryRes = await fetch(url, { ...options, headers });
          if (!retryRes.ok) {
            const errBody = await retryRes.json().catch(() => ({}));
            reject(new Error(errBody.detail || `Request failed with status ${retryRes.status}`));
            return;
          }
          if (retryRes.status === 204) {
            resolve({} as T);
            return;
          }
          const data = await retryRes.json();
          resolve(data);
        } catch (e) {
          reject(e);
        }
      });
    });

    return retryPromise;
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
