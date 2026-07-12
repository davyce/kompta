import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { portalApi } from "../services/portalApi";

type PortalAuthState = {
  /** true dès qu'une session valide existe (cookie HttpOnly) ; le token brut n'est jamais exposé au JS. */
  isAuthenticated: boolean;
  bootstrapping: boolean;
  clientId: number | null;
  clientName: string | null;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
};

const PortalAuthContext = createContext<PortalAuthState | null>(null);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);

  // Restaure la session au chargement via le cookie HttpOnly (aucun token
  // n'est jamais conservé côté JS, donc rien à lire ici sauf tenter l'appel).
  useEffect(() => {
    let cancelled = false;
    portalApi
      .me()
      .then((res) => {
        if (cancelled) return;
        setIsAuthenticated(true);
        setClientId(res.client_id);
        setClientName(res.client_name);
      })
      .catch(() => {
        if (!cancelled) setIsAuthenticated(false);
      })
      .finally(() => {
        if (!cancelled) setBootstrapping(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await portalApi.login(email, password);
    setIsAuthenticated(true);
    setClientId(result.client_id);
    setClientName(result.client_name);
  }, []);

  const logout = useCallback(() => {
    portalApi.logout().catch(() => { /* le cookie expirera de toute façon */ });
    setIsAuthenticated(false);
    setClientId(null);
    setClientName(null);
  }, []);

  const value = useMemo(
    () => ({ isAuthenticated, bootstrapping, clientId, clientName, login, logout }),
    [isAuthenticated, bootstrapping, clientId, clientName, login, logout]
  );

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}

export function usePortalAuth(): PortalAuthState {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error("usePortalAuth must be used within PortalAuthProvider");
  return ctx;
}
