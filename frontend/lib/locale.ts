import ru from "../locales/ru-RU.json" with { type: "json" };
import kk from "../locales/kk-KZ.json" with { type: "json" };

export type Locale = "ru-RU" | "kk-KZ";
export type Language = "ru" | "kk";
export type MessageKey = keyof typeof ru;
export const dictionaries = { "ru-RU": ru, "kk-KZ": kk };
export const normalizeLocale = (value: unknown): Locale => value === "kk" || value === "kk-KZ" ? "kk-KZ" : "ru-RU";
export const languageOf = (locale: Locale): Language => locale === "kk-KZ" ? "kk" : "ru";
let currentLocale: Locale = "ru-RU";
const listeners = new Set<() => void>();
export const getLocale = () => currentLocale;
export const getServerLocale = (): Locale => "ru-RU";
export function subscribeLocale(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setLocale(value: unknown, persist = true) {
  const next = normalizeLocale(value);
  if (typeof window !== "undefined") {
    if (persist) { try { localStorage.setItem("soyle-language", next); } catch { /* Storage may be disabled. */ } }
    document.documentElement.lang = next;
    document.title = dictionaries[next]["app.title"];
    if (next !== currentLocale) window.dispatchEvent(new Event("soyle-locale-changing"));
  }
  if (next === currentLocale) return;
  currentLocale = next;
  listeners.forEach(listener => listener());
}
export function translate(locale: Locale, key: MessageKey, values: Record<string, string | number> = {}): string {
  const message = dictionaries[locale][key];
  if (message === undefined) throw new Error(`Missing translation: ${locale}:${key}`);
  return message.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}
export const t = (key: MessageKey, values?: Record<string, string | number>) => translate(currentLocale, key, values);
export const formatDate = (value: string | Date, options: Intl.DateTimeFormatOptions = {}, locale = currentLocale) => new Intl.DateTimeFormat(locale, options).format(new Date(value));
export function plural(count: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }, locale = currentLocale) {
  return (forms[new Intl.PluralRules(locale).select(count)] ?? forms.other).replace(/\{count\}/g, new Intl.NumberFormat(locale).format(count));
}
