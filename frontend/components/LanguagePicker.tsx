"use client";
import { useEffect, useState } from "react";
import { useLocale, setLocale, t, type Locale } from "@/lib/i18n";

function chooseLocale(locale: Locale) { setLocale(locale); window.dispatchEvent(new Event("soyle-language-selected")); }

export function LanguagePicker({ value, onChange, compact = false }: { value?: Locale; onChange?: (locale: Locale) => void; compact?: boolean }) {
  const locale = useLocale();
  return <div className={`language-options locale-picker${compact ? " locale-picker--compact" : ""}`} role="group" aria-label={t("settings.languageHeading")}>
    {([['ru-RU', 'Русский'], ['kk-KZ', 'Қазақша']] as const).map(([id, label]) => <button key={id} type="button" lang={id} aria-label={label} aria-pressed={(value ?? locale) === id} className={(value ?? locale) === id ? 'active' : ''} onClick={() => onChange ? onChange(id) : chooseLocale(id)}>{compact ? (id === "ru-RU" ? "RU" : "ҚАЗ") : label}</button>)}
  </div>;
}

export function LocaleBootstrap() {
  const [first, setFirst] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("soyle-language"); } catch { /* Keep the picker usable without storage. */ }
    if (saved) setLocale(saved, false);
    const timer = saved ? undefined : window.setTimeout(() => setFirst(true), 0);
    const close = () => setFirst(false);
    window.addEventListener("soyle-profile-locale", close);
    return () => { window.clearTimeout(timer); window.removeEventListener("soyle-profile-locale", close); };
  }, []);
  if (!first) return null;
  return <dialog ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => event.preventDefault()} className="locale-welcome" aria-labelledby="locale-welcome-title">
    <div><h2 id="locale-welcome-title">Выберите язык / Тілді таңдаңыз</h2><LanguagePicker onChange={locale => { chooseLocale(locale); setFirst(false); }}/></div>
  </dialog>;
}
