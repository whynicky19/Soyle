"use client";

import { useEffect } from "react";

export type Language = "ru" | "en" | "kk";

// Only Russian copy has completed the current content and safety review.
// Other language identifiers remain in persisted settings for backward
// compatibility, but the interface normalizes them to Russian.
export const supportedInterfaceLanguages: readonly Language[] = ["ru"];

export function useInterfaceLanguage(language: Language) {
  useEffect(() => {
    const reviewedLanguage: Language = supportedInterfaceLanguages.includes(language) ? language : "ru";
    document.documentElement.lang = reviewedLanguage;
    document.title = "Söyle — играем, общаемся, растём";
    localStorage.setItem("soyle-language", reviewedLanguage);
  }, [language]);
}
