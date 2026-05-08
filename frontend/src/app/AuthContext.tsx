import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { ApiError, api, clearToken, getToken, setToken, setUnauthorizedCallback } from "../services/api";
import type { CompanyRegistrationPayload, LoginResponse } from "../services/api";
import type { User } from "../types/domain";

function getTokenExpiry(token: string): number | null {
  try {
    const body = token.split(".")[1];
    if (!body) return null;
    const padding = "=".repeat((4 - (body.length % 4)) % 4);
    const decoded = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/") + padding));
    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch { return null; }
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

type AuthContextValue = {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<LoginResponse>;
  registerCompany: (payload: CompanyRegistrationPayload) => Promise<LoginResponse>;
  logout: () => void;
  setUser: (user: User | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, updateToken] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!token || user) return;
    let cancelled = false;
    api.me()
      .then((currentUser) => {
        if (!cancelled) setUser(currentUser);
      })
      .catch((error) => {
        if (!cancelled && isUnauthorized(error)) {
          clearToken();
          updateToken(null);
          setUser(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  // Register the 401 auto-logout callback so api.ts can trigger logout from outside React
  useEffect(() => {
    setUnauthorizedCallback(() => {
      clearToken();
      updateToken(null);
      setUser(null);
    });
  }, []);

  // Silent token validation: check on window focus and every 10 minutes
  useEffect(() => {
    if (!token) return;

    function checkAndRefresh() {
      const expiry = getTokenExpiry(token!);
      if (!expiry) return;
      const minutesLeft = (expiry - Date.now() / 1000) / 60;
      // If less than 60 minutes left, re-validate (will auto-logout on 401)
      if (minutesLeft < 60) {
        // Use the real refresh endpoint to get a new token
        api.refreshToken()
          .then((resp) => {
            setToken(resp.access_token);
            updateToken(resp.access_token);
            if (resp.user) setUser(resp.user);
          })
          .catch((error) => {
            if (isUnauthorized(error)) {
              clearToken();
              updateToken(null);
              setUser(null);
            }
          });
      }
    }

    window.addEventListener("focus", checkAndRefresh);
    const interval = setInterval(checkAndRefresh, 10 * 60 * 1000);

    return () => {
      window.removeEventListener("focus", checkAndRefresh);
      clearInterval(interval);
    };
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      setUser,
      login: async (email: string, password: string) => {
        const response = await api.login(email, password);
        setToken(response.access_token);
        updateToken(response.access_token);
        setUser(response.user);
        return response;
      },
      registerCompany: async (payload: CompanyRegistrationPayload) => {
        const response = await api.registerCompany(payload);
        setToken(response.access_token);
        updateToken(response.access_token);
        setUser(response.user);
        return response;
      },
      logout: () => {
        clearToken();
        updateToken(null);
        setUser(null);
      }
    }),
    [token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
