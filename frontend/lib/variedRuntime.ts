function shuffleWithRandom<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export type VariedMechanic = "category_sort" | "action_sequence" | "object_match";
export type LearningPicture = {key: string; label: string; media_ref: string};
export type LearningPair = {object_key: string; target_key: string};
export type LearningTask = {key: string; instruction: string; cards: LearningPicture[]; targets?: LearningPicture[]; correct_order?: string[]; pairs?: LearningPair[]};
export type VariedContent = {
  categories?: LearningPicture[];
  sort_items?: Array<LearningPicture & {category_key: string}>;
  tasks?: LearningTask[];
  default_rounds?: number;
  round_choices?: number[];
  bank_key?: string;
};
export type VariedRound = LearningTask & {category_key?: string};
export const variedMechanics: readonly string[] = ["category_sort", "action_sequence", "object_match"];

export function createVariedRounds(mechanic: VariedMechanic, content: VariedContent, random: () => number = Math.random): VariedRound[] {
  if (mechanic === "category_sort") {
    // Interleave groups so a short series contains every category equally.
    const groups = shuffleWithRandom(content.categories || [], random).map(group => shuffleWithRandom((content.sort_items || []).filter(item => item.category_key === group.key), random));
    const result: VariedRound[] = [];
    for (let index = 0; groups.some(group => index < group.length); index++) {
      for (const group of groups) {
        const item = group[index];
        if (item) result.push({key: item.key, instruction: "Посмотри на предмет и выбери его группу.", cards: [item], category_key: item.category_key});
      }
    }
    return result;
  }
  // Two-step stories precede three-step ones; shuffle within each load level.
  if (mechanic === "action_sequence") return [2, 3, 4].flatMap(size => shuffleWithRandom((content.tasks || []).filter(task => task.correct_order?.length === size), random));
  return shuffleWithRandom(content.tasks || [], random);
}

export function orderMatches(order: readonly string[], expected: readonly string[]): boolean {
  return order.length === expected.length && order.every((key, index) => key === expected[index]);
}
export function pairMatches(pair: LearningPair, expected: readonly LearningPair[]): boolean {
  return expected.some(item => item.object_key === pair.object_key && item.target_key === pair.target_key);
}
