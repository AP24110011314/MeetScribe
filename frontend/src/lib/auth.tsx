/** Auth provider: current user, login/register/logout actions, loading state. */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import * as authApi from "../api/auth";
import type { User } from "../api/auth";
import { clearTokens, getAccessToken, setTokens } from "./tokenStore";
import { AuthContext } from "./authContext";
import type { AuthContextValue } from "./authContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!getAccessToken()) {
        setIsLoading(false);
        return;
      }
      try {
        const current = await authApi.me();
        if (active) {
          setUser(current);
        }
      } catch {
        clearTokens();
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await authApi.login(email, password);
    setTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
    setUser(await authApi.me());
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    await authApi.register(email, password);
    const tokens = await authApi.login(email, password);
    setTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
    setUser(await authApi.me());
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, register, logout }),
    [user, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
