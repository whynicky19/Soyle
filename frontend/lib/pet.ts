export type PetPreferences = { visible: boolean; voice: boolean; motion: "full" | "reduced" | "off" };
export const defaultPetPreferences: PetPreferences = { visible: true, voice: false, motion: "full" };
export type PetEvent = "greeting" | "correct" | "incorrect" | "hint" | "complete" | "tap";
// Verified against SoylePet.mood and the Companion state machine in the supplied .riv.
export const petReactions: Record<PetEvent, { mood: number; duration: number; phrases: readonly string[] }> = {
  greeting: { mood: 1, duration: 3500, phrases: ["Привет!", "Давай поиграем!", "Начнём?"] },
  correct: { mood: 2, duration: 3000, phrases: ["Молодец!", "Получилось!", "Отлично!", "Ура!"] },
  incorrect: { mood: 3, duration: 4000, phrases: ["Попробуем ещё!", "Давай вместе!", "Я рядом!"] },
  hint: { mood: 4, duration: 4500, phrases: ["Я помогу!", "Посмотри сюда!"] },
  complete: { mood: 5, duration: 3500, phrases: ["Ура! Мы закончили!", "Здорово!", "Ты старался!"] },
  tap: { mood: 1, duration: 3500, phrases: ["Я здесь!", "Привет!", "Поиграем?"] },
};
