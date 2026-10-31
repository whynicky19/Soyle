"use client";
import { useEffect, useRef, useState } from "react";
import { api, type AppSettings } from "@/lib/api";
import { getLocale, languageOf, setLocale, type Locale } from "@/lib/i18n";
import { LanguagePicker } from "./LanguagePicker";

/** For the separate specialist shell; all non-language preferences are preserved. */
export function AccountLanguagePicker() {
  const settings = useRef<AppSettings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    api<AppSettings>('/api/settings').then(async value => {
      if (!active) return;
      settings.current = value;
      if (value.language_configured) { setLocale(value.language); window.dispatchEvent(new Event('soyle-profile-locale')); }
      else if (localStorage.getItem('soyle-language')) {
        const saved = await api<AppSettings>('/api/settings', {method:'PUT', body:JSON.stringify({...value,language:languageOf(getLocale())})});
        if (active) settings.current = saved;
      }
    }).catch(error => { if (active) setError(String(error)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function choose(locale: Locale) {
    if (!settings.current || busy) return;
    const previous = getLocale();
    setBusy(true); setError(''); setLocale(locale);
    try { settings.current = await api<AppSettings>('/api/settings', {method:'PUT',body:JSON.stringify({...settings.current,language:languageOf(locale)})}); }
    catch (error) { setLocale(previous); setError(String(error)); } finally { setBusy(false); }
  }
  useEffect(() => {
    const selected = () => { void choose(getLocale()); };
    window.addEventListener('soyle-language-selected', selected);
    return () => window.removeEventListener('soyle-language-selected', selected);
  });
  return <fieldset disabled={busy} style={{border:0,padding:0}}><LanguagePicker onChange={locale => void choose(locale)}/>{error && <p role="alert">{error}</p>}</fieldset>;
}
