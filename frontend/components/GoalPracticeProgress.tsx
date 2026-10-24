import type { GoalProgress } from "@/lib/api";

export function GoalPracticeProgress({ progress }: { progress?: GoalProgress }) {
  if (!progress) return null;
  return <div className="goal-practice-progress">
    <strong>Практика по цели за {progress.window_days} дней</strong>
    {progress.rounds ? <>
      <p>Завершено серий: {progress.completed_sessions} · раундов: {progress.rounds}</p>
      <p>Самостоятельно: {progress.independent}, с помощью: {progress.prompted}, без ответа ребёнка: {progress.without_child_answer}.</p>
      <p>Доля самостоятельных раундов: {progress.independent_rate}%.</p>
    </> : <p>Завершённых измеряемых серий по этой цели пока нет.</p>}
    {(progress.breaks > 0 || progress.refusals > 0 || progress.technical_errors > 0) && <p>Перерывы: {progress.breaks}, отказы: {progress.refusals}, технические проблемы: {progress.technical_errors}. В долю ответов не входят.</p>}
    {progress.participations > 0 && <p>Участие без оценки: {progress.participations}.</p>}
    <p>Наблюдения дома: {progress.home_observations}, самостоятельно: {progress.home_independent}.</p>
    <small>Только попытки из планов по этой цели с тем же ожидаемым действием. Пауза цели сохраняет историю. Наблюдения дома считаются отдельно; цель завершается взрослым.</small>
  </div>;
}
