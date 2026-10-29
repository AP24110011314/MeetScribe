import { apiFetch, clearTokens, setTokens } from './client';
import { AuthTokens, User } from '@/types/auth';

export async function registerUser(email: string, password: string): Promise<User> {
  return apiFetch<User>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function loginUser(email: string, password: string): Promise<AuthTokens> {
  const tokens = await apiFetch<AuthTokens>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setTokens(tokens);
  return tokens;
}

export async function getCurrentUser(): Promise<User> {
  return apiFetch<User>('/auth/me');
}

export function logoutUser(): void {
  clearTokens();
}
