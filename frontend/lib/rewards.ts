export function starLabel(count: number): string {
  const mod100 = count % 100;
  return mod100 >= 11 && mod100 <= 14 ? 'звёзд' : count % 10 === 1 ? 'звезда' : count % 10 >= 2 && count % 10 <= 4 ? 'звезды' : 'звёзд';
}

export function savedReward(result: {awarded_stars: number; attempt_status?: string; preview?: boolean}, eventId: string, seen: Set<string>): number {
  if (result.preview || !['completed', 'participated'].includes(result.attempt_status || '') ||
      !Number.isInteger(result.awarded_stars) || result.awarded_stars <= 0 || !eventId || seen.has(eventId)) return 0;
  seen.add(eventId);
  return result.awarded_stars;
}
