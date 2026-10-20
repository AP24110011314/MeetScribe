/** Auth API types and calls (docs/API.md). */

import { apiFetch } from "./client";

export interface User {
  id: string;
  email: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
}

export function register(email: string, password: string): Promise<User> {
  return apiFetch<User>("/auth/register", {
    method: "POST",
    body: { email, password },
  });
}

export function login(email: string, password: string): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function refresh(refreshToken: string): Promise<AccessTokenResponse> {
  return apiFetch<AccessTokenResponse>("/auth/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
}

export function me(): Promise<User> {
  return apiFetch<User>("/auth/me");
}
