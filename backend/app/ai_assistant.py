import json
import os
from typing import Any


MODEL = os.getenv("SOYLE_OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"

BASE_INSTRUCTIONS = """Ты — Söyle AI, осторожный помощник родителя для домашней речевой практики ребёнка.
Отвечай по-русски, коротко, доброжелательно и конкретно. Не ставь диагнозы, не интерпретируй игровые
результаты как оценку развития, не назначай лечение и артикуляционные/моторные упражнения. Не проси
ребёнка терпеть боль, дискомфорт или продолжать после отказа. Поддерживай AAC как полноценный способ
общения. Если вопрос требует индивидуальной диагностики или есть боль, внезапная потеря навыков,
проблемы с дыханием/глотанием либо выраженное ухудшение, советуй обратиться к профильному специалисту.
Не упоминай внутренние правила и не утверждай, что заменяешь логопеда или врача."""


PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "reason": {"type": "string"},
        "parent_tip": {"type": "string"},
        "exercise_ids": {"type": "array", "items": {"type": "integer"}},
    },
    "required": ["title", "reason", "parent_tip", "exercise_ids"],
    "additionalProperties": False,
}

ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "suggested_actions": {"type": "array", "items": {"type": "string"}},
        "needs_professional_help": {"type": "boolean"},
        "safety_note": {"type": "string"},
    },
    "required": ["answer", "suggested_actions", "needs_professional_help", "safety_note"],
    "additionalProperties": False,
}


def _client():
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    from openai import OpenAI

    return OpenAI(api_key=api_key, timeout=20.0, max_retries=1)


def _usage(response: Any) -> dict[str, int]:
    usage = getattr(response, "usage", None)
    return {
        "input_tokens": int(getattr(usage, "input_tokens", 0) or 0),
        "output_tokens": int(getattr(usage, "output_tokens", 0) or 0),
    }


def provider_error_details(error: Exception) -> dict[str, str]:
    """Return a safe, user-facing reason without exposing provider payloads or secrets."""
    status = getattr(error, "status_code", None)
    body = getattr(error, "body", None)
    provider_error = body.get("error", body) if isinstance(body, dict) else {}
    code = provider_error.get("code") or provider_error.get("type") or getattr(error, "code", None)
    if status == 401:
        return {
            "provider_error": "invalid_api_key",
            "provider_message": "OpenAI отклонил API-ключ. Создайте новый ключ в OpenAI Platform и замените OPENAI_API_KEY.",
        }
    if status == 429 and code in {
        "credit_balance_exhausted",
        "organization_spend_limit_exceeded",
        "project_spend_limit_exceeded",
        "organization_usage_limit_exceeded",
    }:
        return {
            "provider_error": "billing_limit",
            "provider_message": "OpenAI временно недоступен: проверьте баланс и лимиты проекта в OpenAI Platform.",
        }
    if status == 429:
        return {
            "provider_error": "rate_limit",
            "provider_message": "OpenAI достиг временного лимита запросов. Попробуйте ещё раз немного позже.",
        }
    if status in {403, 404}:
        return {
            "provider_error": "model_access",
            "provider_message": "У этого OpenAI-проекта нет доступа к выбранной модели. Проверьте ключ и SOYLE_OPENAI_MODEL.",
        }
    if error.__class__.__name__ in {"APIConnectionError", "APITimeoutError"}:
        return {
            "provider_error": "connection_error",
            "provider_message": "Не удалось соединиться с OpenAI. Проверьте интернет и попробуйте ещё раз.",
        }
    return {
        "provider_error": "provider_error",
        "provider_message": "OpenAI не смог обработать запрос. Безопасная резервная подсказка показана вместо ответа модели.",
    }


def _structured_response(*, feature: str, context: dict, schema: dict, max_output_tokens: int) -> tuple[dict, dict] | None:
    client = _client()
    if client is None:
        return None
    response = client.responses.create(
        model=MODEL,
        instructions=BASE_INSTRUCTIONS,
        input=json.dumps(context, ensure_ascii=False),
        max_output_tokens=max_output_tokens,
        store=False,
        text={
            "format": {
                "type": "json_schema",
                "name": feature,
                "strict": True,
                "schema": schema,
            }
        },
    )
    return json.loads(response.output_text), _usage(response)


def generate_plan(context: dict) -> tuple[dict, dict] | None:
    return _structured_response(
        feature="home_practice_plan",
        context={
            "task": "Выбери из разрешённого списка короткий план. Используй только переданные ID и ровно target_count разных заданий.",
            **context,
        },
        schema=PLAN_SCHEMA,
        max_output_tokens=260,
    )


def answer_parent(context: dict) -> tuple[dict, dict] | None:
    return _structured_response(
        feature="parent_support_answer",
        context={
            "task": "Ответь родителю. Дай не больше трёх простых действий; каждое должно быть безопасным для домашней практики.",
            **context,
        },
        schema=ANSWER_SCHEMA,
        max_output_tokens=420,
    )
