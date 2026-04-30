import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api, clearToken, getToken, setToken } from "../services/api";
import type { CompanyRegistrationPayload, LoginResponse } from "../services/api";
import type { User } from "../types/domain";

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
      .catch(() => {
        if (!cancelled) {
          clearToken();
          updateToken(null);
          setUser(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, user]);

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
