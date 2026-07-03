import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { clearPortalToken, getPortalToken, portalApi, setPortalToken } from "../services/portalApi";

type PortalAuthState = {
  token: string | null;
  clientId: number | null;
  clientName: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const PortalAuthContext = createContext<PortalAuthState | null>(null);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getPortalToken());
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    const result = await portalApi.login(email, password);
    setPortalToken(result.access_token);
    setTokenState(result.access_token);
    setClientId(result.client_id);
    setClientName(result.client_name);
  }, []);

  const logout = useCallback(() => {
    clearPortalToken();
    setTokenState(null);
    setClientId(null);
    setClientName(null);
  }, []);

  const value = useMemo(
    () => ({ token, clientId, clientName, login, logout }),
    [token, clientId, clientName, login, logout]
  );

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}

export function usePortalAuth(): PortalAuthState {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error("usePortalAuth must be used within PortalAuthProvider");
  return ctx;
}
