import { createContext, useContext, useState, useEffect } from "react";

interface CompactContextValue {
  compact: boolean;
  toggleCompact: () => void;
}

const CompactContext = createContext<CompactContextValue>({
  compact: false,
  toggleCompact: () => undefined,
});

export function CompactProvider({ children }: { children: React.ReactNode }) {
  const [compact, setCompact] = useState<boolean>(() => {
    try {
      return localStorage.getItem("kompta_compact_mode") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem("kompta_compact_mode", String(compact));
    if (compact) {
      document.documentElement.classList.add("compact");
    } else {
      document.documentElement.classList.remove("compact");
    }
  }, [compact]);

  function toggleCompact() {
    setCompact((v) => !v);
  }

  return (
    <CompactContext.Provider value={{ compact, toggleCompact }}>
      {children}
    </CompactContext.Provider>
  );
}

export function useCompact(): CompactContextValue {
  return useContext(CompactContext);
}
