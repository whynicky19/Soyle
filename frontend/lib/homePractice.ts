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
