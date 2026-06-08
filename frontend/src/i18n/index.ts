import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import fr from "./locales/fr.json";
import en from "./locales/en.json";

export const SUPPORTED_LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    // Le français est la langue par défaut de l'app. L'anglais ne s'active que
    // sur choix explicite de l'utilisateur (stocké en localStorage + préférences).
    lng: "fr",
    fallbackLng: "fr",
    supportedLngs: ["fr", "en"],
    interpolation: { escapeValue: false },
    detection: {
      // Pas de "navigator" : on ne déduit PAS la langue du navigateur.
      order: ["localStorage"],
      lookupLocalStorage: "kompta_language",
      caches: ["localStorage"],
    },
  });

export default i18n;
