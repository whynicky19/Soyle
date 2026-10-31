export type PetPreferences = { visible: boolean; voice: boolean; motion: "full" | "reduced" | "off" };
export const defaultPetPreferences: PetPreferences = { visible: true, voice: false, motion: "full" };
export type PetEvent = "greeting" | "correct" | "incorrect" | "hint" | "complete" | "tap";
// Verified against SoylePet.mood and the Companion state machine in the supplied .riv.
export const petReactions: Record<PetEvent, { mood: number; duration: number; phrases: readonly string[] }> = {
  greeting: { mood: 1, duration: 3500, phrases: ["Привет!", "Давай поиграем!", "Начнём?"] },
  correct: { mood: 2, duration: 3000, phrases: ["Молодец!", "Получилось!", "Отлично!", "Ура!"] },
  incorrect: { mood: 3, duration: 4000, phrases: ["Подумай ещё раз.", "Попробуй ещё раз.", "Давай попробуем ещё раз."] },
  hint: { mood: 4, duration: 4500, phrases: ["Я помогу!", "Посмотри сюда!"] },
  complete: { mood: 5, duration: 3500, phrases: ["Ура! Мы закончили!", "Здорово!", "Ты старался!"] },
  tap: { mood: 1, duration: 3500, phrases: ["Я здесь!", "Привет!", "Поиграем?"] },
};

// Keep each event's rotation across exercise remounts within the current page.
// Independent cursors prevent hints/greetings from repeatedly selecting the same praise.
export function createPetPhraseSelector() {
  const cursors: Partial<Record<PetEvent, number>> = {};
  let lastPhrase = "";
  return (event: PetEvent, language: "ru" | "kk" = "ru"): string => {
    const phrases = language === "kk" ? kazakhPetPhrases[event] : petReactions[event].phrases;
    let cursor = cursors[event] ?? 0;
    if (phrases.length > 1 && phrases[cursor % phrases.length] === lastPhrase) cursor++;
    const phrase = phrases[cursor % phrases.length];
    cursors[event] = cursor + 1;
    lastPhrase = phrase;
    return phrase;
  };
}
export const nextPetPhrase = createPetPhraseSelector();

export const kazakhPetPhrases: Record<PetEvent, readonly string[]> = {
  greeting: ["Сәлем!", "Кел, ойнайық!", "Бастаймыз ба?"],
  correct: ["Жарайсың!", "Қолыңнан келді!", "Тамаша!", "Алақай!"],
  incorrect: ["Тағы ойланып көр.", "Тағы бір рет көр.", "Кел, тағы байқап көрейік."],
  hint: ["Мен көмектесемін!", "Мұнда қара!"],
  complete: ["Алақай! Біз аяқтадық!", "Керемет!", "Жақсы тырыстың!"],
  tap: ["Мен осындамын!", "Сәлем!", "Ойнаймыз ба?"],
};
