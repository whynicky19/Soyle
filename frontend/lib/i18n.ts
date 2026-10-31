"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getLocale, getServerLocale, subscribeLocale, setLocale, type Language } from "./locale";
export { t, setLocale, getLocale, normalizeLocale, languageOf, formatDate, plural } from "./locale";
export type { Language, Locale } from "./locale";
export const supportedInterfaceLanguages: readonly Language[] = ["ru", "kk"];
export function useLocale() { return useSyncExternalStore(subscribeLocale, getLocale, getServerLocale); }
export function useInterfaceLanguage(language: Language | "en") {
  useEffect(() => { setLocale(language); }, [language]);
}
