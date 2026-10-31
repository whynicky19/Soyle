import { composeKazakhAAC } from "./aacKazakh.ts";
import type { AACCard } from "@/lib/api";

const languagePatterns: Record<"ru" | "kk" | "en", string[][]> = {
  ru: [["subject", "action", "object"], ["action", "object"], ["subject", "action"]],
  en: [["subject", "action", "object"], ["action", "object"], ["subject", "action"]],
  kk: [["subject", "object", "action"], ["object", "action"], ["subject", "action"]],
};

const russianSeenObjectForms: Record<string, string> = {
  "Мама": "маму",
  "Папа": "папу",
  "Бабушка": "бабушку",
  "Дедушка": "дедушку",
  "Брат": "брата",
  "Сестра": "сестру",
  "Кот": "кота",
};

function composeRussianObservation(cards: AACCard[]): string | null {
  const labels = cards.map((card) => card.label);
  const targetIndex = labels[0] === "Вижу" && labels.length === 2
    ? 1
    : labels[0] === "Я" && labels[1] === "Вижу" && labels.length === 3
      ? 2
      : -1;
  if (targetIndex < 0) return null;
  const object = russianSeenObjectForms[labels[targetIndex]] || cards[targetIndex].speech.trim();
  if (!object) return null;
  return targetIndex === 1 ? `Вижу ${object}` : `Я вижу ${object}`;
}

function composeMessage(cards: AACCard[], mode: "guided" | "free" = "guided"): { valid: boolean; phrase: string; reason: string } {
  if (!cards.length) return { valid: false, phrase: "", reason: "Выберите хотя бы одну карточку" };
  const language = cards[0].language || "ru";
  if (cards.some((card) => (card.language || "ru") !== language)) return { valid: false, phrase: "", reason: "Карточки разных языков нельзя объединить" };
  if (cards.length === 1) return { valid: true, phrase: cards[0].speech.trim(), reason: "" };
  if (language === "kk") {
    const phrase=composeKazakhAAC(cards);
    if (phrase)return {valid:true,phrase,reason:""};
  }
  if (mode === "free") {
    const guided = composeAACMessage(cards);
    if (guided.valid) return guided;
    const phrase = cards.map((card) => card.speech.trim() || card.label.trim()).join(" ").replace(/\s+/g, " ").trim();
    return { valid: Boolean(phrase), phrase, reason: phrase ? "" : "У карточек нет текста для озвучивания" };
  }
  if(language === "kk")return {valid:false,phrase:"",reason:"Бұл карточкалар ретіне әзірге қолдау көрсетілмейді."};
  const observation = language === "ru" ? composeRussianObservation(cards) : null;
  if (observation) return { valid: true, phrase: observation, reason: "" };
  const roles = cards.map((card) => card.grammatical_role || "ready_message");
  if (roles.includes("ready_message")) return { valid: false, phrase: "", reason: "Готовое важное сообщение используется отдельно" };
  const valid = languagePatterns[language].some((pattern) => pattern.length === roles.length && pattern.every((role, index) => role === roles[index]));
  if (!valid) return { valid: false, phrase: "", reason: "Эта последовательность пока не входит в проверенные шаблоны" };
  const joined = cards.map((card) => card.speech.trim()).join(" ").replace(/\s+/g, " ");
  return { valid: true, phrase: joined.charAt(0).toUpperCase() + joined.slice(1), reason: "" };
}


export function composeAACMessage(cards: AACCard[], mode: "guided" | "free" = "guided", language = cards[0]?.language || "ru") {
  const result = composeMessage(cards,mode);
  if (language === "kk" && result.reason) {
    const reasons:Record<string,string> = {
      "Выберите хотя бы одну карточку":"Кемінде бір карточканы таңдаңыз.",
      "Карточки разных языков нельзя объединить":"Әртүрлі тілдегі карточкаларды біріктіруге болмайды.",
      "У карточек нет текста для озвучивания":"Карточкаларда дыбысталатын мәтін жоқ.",
      "Готовое важное сообщение используется отдельно":"Дайын маңызды хабарлама бөлек қолданылады.",
    };
    return {...result,reason:reasons[result.reason] || result.reason};
  }
  return result;
}
