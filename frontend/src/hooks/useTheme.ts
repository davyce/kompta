import { useCallback, useEffect, useState } from "react";

const KEY = "kompta_theme";
type Theme = "light" | "dark";
type ThemePreference = "light" | "dark" | "auto";

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function resolveTheme(pref: ThemePreference): Theme {
  if (pref === "auto") return systemPrefersDark() ? "dark" : "light";
  return pref;
}

function readPreference(): ThemePreference {
  const stored = localStorage.getItem(KEY) as ThemePreference | null;
  if (stored === "light" || stored === "dark" || stored === "auto") return stored;
  // Première visite : mode auto pour suivre le système
  return "auto";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  // Met à jour aussi la balise theme-color (barre de statut iOS/Android)
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#111318" : "#ffffff");
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readPreference());
  const [theme, setTheme] = useState<Theme>(() => {
    const t = resolveTheme(readPreference());
    applyTheme(t);
    return t;
  });

  // Applique le thème quand la préférence change
  useEffect(() => {
    const t = resolveTheme(preference);
    setTheme(t);
    applyTheme(t);
    localStorage.setItem(KEY, preference);
  }, [preference]);

  // En mode auto : écouter les changements du système (light↔dark) en temps réel
  useEffect(() => {
    if (preference !== "auto") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => {
      const next: Theme = e.matches ? "dark" : "light";
      setTheme(next);
      applyTheme(next);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preference]);

  const toggle = useCallback(() => {
    // Cycle : auto → light → dark → auto
    setPreferenceState((p) => (p === "auto" ? "light" : p === "light" ? "dark" : "auto"));
  }, []);

  const setPreference = useCallback((p: ThemePreference) => setPreferenceState(p), []);

  return { theme, toggle, preference, setPreference };
}
