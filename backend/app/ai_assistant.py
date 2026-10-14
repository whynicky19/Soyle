"""Small local rule-based helper for parent-facing practice guidance.

The module deliberately has no network client, model SDK or API key support.
It provides predictable suggestions from a reviewed set of rules while the
adaptive planner handles exercise selection from recorded results.
"""

from __future__ import annotations


DISCLAIMER = "Локальный помощник не ставит диагноз и не заменяет врача или логопеда."
SAFETY_NOTE = (
    "При боли, проблемах с дыханием или глотанием, внезапной потере навыков "
    "или выраженном ухудшении обратитесь к профильному специалисту."
)


def generate_plan(context: dict) -> dict:
    """Select a stable, duplicate-free subset from an approved list.

    The adaptive planner is preferred for normal lessons. This helper is kept
    for backwards compatibility with the older ``/api/ai/plan`` URL.
    """
    count = int(context.get("target_count", 0))
    selected: list[int] = []
    for exercise in context.get("allowed_exercises", []):
        exercise_id = exercise.get("id")
        if isinstance(exercise_id, int) and exercise_id not in selected:
            selected.append(exercise_id)
        if len(selected) >= count:
            break
    return {
        "title": "Спокойная практика на сегодня",
        "reason": "Задания выбраны локальными правилами из проверенной библиотеки.",
        "parent_tip": "Дайте время ответить и спокойно завершите занятие после отказа.",
        "exercise_ids": selected,
    }


def answer_parent(context: dict) -> dict:
    """Return a reviewed local answer based on transparent keyword groups."""
    question = str(context.get("parent_question", "")).casefold()
    urgent = any(word in question for word in (
        "боль", "болит", "дыш", "дыхани", "глот", "подав", "внезап", "потерял", "ухудш",
    ))
    if urgent:
        return {
            "answer": "По такому описанию домашнего алгоритма недостаточно: нужна индивидуальная оценка специалиста. Не продолжайте упражнение через боль или заметный дискомфорт.",
            "suggested_actions": [
                "Остановите упражнение и обеспечьте спокойную обстановку",
                "Запишите, что произошло и когда появились признаки",
                "Обратитесь к врачу или профильному специалисту",
            ],
            "needs_professional_help": True,
            "safety_note": SAFETY_NOTE,
        }
    if any(word in question for word in ("не хочет", "отказ", "стоп", "устал", "перерыв")):
        return {
            "answer": "Отказ, «стоп» и просьба о перерыве — полноценные сообщения. Примите их сразу, завершите текущую попытку и вернитесь к практике позже без давления.",
            "suggested_actions": [
                "Подтвердите сообщение ребёнка спокойной короткой фразой",
                "Уберите задание без требования повторить ответ",
                "В следующий раз начните с более короткого знакомого шага",
            ],
            "needs_professional_help": False,
            "safety_note": SAFETY_NOTE,
        }
    if any(word in question for word in ("aac", "карточ", "просьб", "попрос", "выбор", "сообщ")):
        return {
            "answer": "Сделайте нужные карточки видимыми и предложите не больше двух понятных вариантов. Жест, взгляд, карточка или слово могут быть приняты как доступный ответ.",
            "suggested_actions": [
                "Положите две подходящие карточки в пределах видимости",
                "Один раз покажите пример без требования повторить",
                "Подождите ответ не меньше пяти секунд",
            ],
            "needs_professional_help": False,
            "safety_note": SAFETY_NOTE,
        }
    return {
        "answer": "Начните с одного короткого знакомого задания и простого выбора. Дайте ребёнку время ответить, отмечайте нужную помощь и завершайте практику после усталости или отказа.",
        "suggested_actions": [
            "Уберите лишние отвлекающие предметы",
            "Покажите два понятных варианта",
            "Подождите ответ не меньше пяти секунд",
        ],
        "needs_professional_help": False,
        "safety_note": SAFETY_NOTE,
    }
