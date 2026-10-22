export type SessionAttemptStatus = "completed" | "participated" | "refused" | "break" | "technical_error";

export type SessionResult = {
  exercise_id: number;
  score: number;
  duration_seconds: number;
  attempt_status?: SessionAttemptStatus;
};

const completionStatuses = new Set<SessionAttemptStatus>(["completed", "participated", "refused"]);

export function countsAsExerciseCompletion(result: SessionResult): boolean {
  return result.attempt_status === undefined || completionStatuses.has(result.attempt_status);
}

export function latestCompletedResults(
  results: readonly SessionResult[],
  exerciseIds: readonly number[],
): SessionResult[] {
  const allowedIds = new Set(exerciseIds);
  const latestByExercise = new Map<number, SessionResult>();
  for (const result of results) {
    if (allowedIds.has(result.exercise_id) && countsAsExerciseCompletion(result)) {
      latestByExercise.set(result.exercise_id, result);
    }
  }
  return [...latestByExercise.values()];
}

export function nextIncompleteExerciseIndex(
  results: readonly SessionResult[],
  exerciseIds: readonly number[],
): number {
  const completedIds = new Set(latestCompletedResults(results, exerciseIds).map((result) => result.exercise_id));
  const nextIndex = exerciseIds.findIndex((exerciseId) => !completedIds.has(exerciseId));
  return nextIndex === -1 ? exerciseIds.length : nextIndex;
}

export function summarizeSessionResults(
  results: readonly SessionResult[],
  exerciseIds: readonly number[],
): { completedCount: number; averageScore: number | null; durationSeconds: number } {
  const allowedIds = new Set(exerciseIds);
  const completedResults = latestCompletedResults(results, exerciseIds);
  const scoredResults = completedResults.filter((result) => !result.attempt_status || result.attempt_status === "completed");
  const averageScore = scoredResults.length
    ? Math.round(scoredResults.reduce((sum, result) => sum + result.score, 0) / scoredResults.length)
    : null;
  const durationSeconds = results
    .filter((result) => allowedIds.has(result.exercise_id))
    .reduce((sum, result) => sum + result.duration_seconds, 0);
  return { completedCount: completedResults.filter(result => result.attempt_status !== "refused").length, averageScore, durationSeconds };
}

// The active-session endpoint returns null after completion. Keep the snapshot
// while its result/summary is open, then clear it when returning home.
export function reconcileActiveSession<T extends { child_id: number; status: string }>(
  current: T | null,
  active: T | null,
  childId: number,
  showingResults: boolean,
): T | null {
  if (showingResults && current?.child_id === childId && current.status === "completed") return current;
  return active;
}
