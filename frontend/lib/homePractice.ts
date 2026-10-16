import type { Exercise } from "./api";

export type PracticeMinutes = 3 | 5 | 10;

export const SESSION_EXERCISE_COUNTS: Record<PracticeMinutes, number> = {
  3: 2,
  5: 3,
  10: 5,
};

export function exerciseCountLabel(count: number): string {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  const word = remainder100 >= 11 && remainder100 <= 14
    ? "заданий"
    : remainder10 === 1
      ? "задание"
      : remainder10 >= 2 && remainder10 <= 4
        ? "задания"
        : "заданий";
  return `${count} ${word}`;
}

type HomeExerciseSelection = {
  exercises: Exercise[];
  completedExerciseIds: number[];
  totalAttempts: number;
  recommendedExercise?: Exercise | null;
  limit?: number;
};

function rotate<T>(items: T[], offset: number): T[] {
  if (items.length < 2) return items;
  const normalizedOffset = Math.abs(offset) % items.length;
  return [...items.slice(normalizedOffset), ...items.slice(0, normalizedOffset)];
}

/**
 * Keeps the child home compact without making it look frozen:
 * new activities are shown before previously attempted ones, the order moves
 * after every saved attempt, and the first choices cover different modules
 * whenever the published catalogue allows it.
 */
export function selectHomeExercises({
  exercises,
  completedExerciseIds,
  totalAttempts,
  recommendedExercise,
  limit = 3,
}: HomeExerciseSelection): Exercise[] {
  const catalogue = [recommendedExercise, ...exercises]
    .filter((item): item is Exercise => Boolean(item))
    .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);
  const completed = new Set(completedExerciseIds);
  const pending = rotate(catalogue.filter((item) => !completed.has(item.id)), totalAttempts);
  const repeated = rotate(catalogue.filter((item) => completed.has(item.id)), totalAttempts);

  if (recommendedExercise && !completed.has(recommendedExercise.id)) {
    const recommendedIndex = pending.findIndex((item) => item.id === recommendedExercise.id);
    if (recommendedIndex > 0) pending.unshift(...pending.splice(recommendedIndex, 1));
  }

  const selected: Exercise[] = [];
  for (const bucket of [pending, repeated]) {
    const available = [...bucket];
    while (available.length && selected.length < limit) {
      const unusedModuleIndex = available.findIndex(
        (item) => !selected.some((selectedItem) => selectedItem.module === item.module),
      );
      const [next] = available.splice(unusedModuleIndex >= 0 ? unusedModuleIndex : 0, 1);
      selected.push(next);
    }
    if (selected.length >= limit) break;
  }
  return selected;
}
