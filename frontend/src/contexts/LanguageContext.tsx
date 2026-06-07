import { createContext, useContext, useEffect, useState } from "react";
import i18n, { type LanguageCode } from "../i18n";
import { api, getToken } from "../services/api";

type LanguageContextType = {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
};

const LanguageContext = createContext<LanguageContextType>({
  language: "fr",
  setLanguage: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, _setLocalLanguage] = useState<LanguageCode>(
    () => (localStorage.getItem("kompta_language") as LanguageCode) || (i18n.language?.startsWith("en") ? "en" : "fr")
  );

  // Sync i18next on first render
  useEffect(() => {
    if (i18n.language !== language) i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load persisted value from API on mount (overrides localStorage if different)
  useEffect(() => {
    if (!getToken()) return;
    api
      .preferences()
      .then((prefs) => {
        const lang = ((prefs as Record<string, unknown>).language as LanguageCode) || "fr";
        if (lang === "fr" || lang === "en") {
          _setLocalLanguage(lang);
          i18n.changeLanguage(lang);
          document.documentElement.lang = lang;
          localStorage.setItem("kompta_language", lang);
        }
      })
      .catch(() => {
        /* offline — use localStorage value */
      });
  }, []);

  function setLanguage(lang: LanguageCode) {
    _setLocalLanguage(lang);
    i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
    localStorage.setItem("kompta_language", lang);
    if (getToken()) {
      api.updatePreferences({ language: lang }).catch(() => {});
    }
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
