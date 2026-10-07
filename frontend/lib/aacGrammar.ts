import type { AACCard } from "@/lib/api";

const languagePatterns: Record<"ru" | "kk" | "en", string[][]> = {
  ru: [["subject", "action", "object"], ["action", "object"], ["subject", "action"]],
  en: [["subject", "action", "object"], ["action", "object"], ["subject", "action"]],
  kk: [["subject", "object", "action"], ["object", "action"], ["subject", "action"]],
};

export function composeAACMessage(cards: AACCard[]): { valid: boolean; phrase: string; reason: string } {
  if (!cards.length) return { valid: false, phrase: "", reason: "Выберите хотя бы одну карточку" };
  const language = cards[0].language || "ru";
  if (cards.some((card) => (card.language || "ru") !== language)) return { valid: false, phrase: "", reason: "Карточки разных языков нельзя объединить" };
  if (cards.length === 1) return { valid: true, phrase: cards[0].speech.trim(), reason: "" };
  const roles = cards.map((card) => card.grammatical_role || "ready_message");
  if (roles.includes("ready_message")) return { valid: false, phrase: "", reason: "Готовое важное сообщение используется отдельно" };
  const valid = languagePatterns[language].some((pattern) => pattern.length === roles.length && pattern.every((role, index) => role === roles[index]));
  if (!valid) return { valid: false, phrase: "", reason: "Эта последовательность пока не входит в проверенные шаблоны" };
  const joined = cards.map((card) => card.speech.trim()).join(" ").replace(/\s+/g, " ");
  return { valid: true, phrase: language === "kk" ? joined : joined.charAt(0).toUpperCase() + joined.slice(1), reason: "" };
}
