#!/bin/zsh
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

VENV_PYTHON="$BACKEND_DIR/.venv/bin/python"
BACKEND_ENV_FILE="$BACKEND_DIR/.env.local"
LOCAL_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"

if [[ ! -x "$VENV_PYTHON" ]] || ! "$VENV_PYTHON" -c "import uvicorn, openai, dotenv" >/dev/null 2>&1; then
  echo "Устанавливаю backend-зависимости…"
  python3 -m venv "$BACKEND_DIR/.venv"
  "$VENV_PYTHON" -m pip install -r "$BACKEND_DIR/requirements.txt"
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Устанавливаю frontend-зависимости…"
  npm --prefix "$FRONTEND_DIR" install
fi

# Read only the AI settings from the local backend file. Vercel database,
# cookie and CORS settings must never leak into the local development server.
dotenv_value() {
  "$VENV_PYTHON" -c 'from dotenv import dotenv_values; import sys; print(dotenv_values(sys.argv[1]).get(sys.argv[2], "") or "")' "$BACKEND_ENV_FILE" "$1"
}

if [[ -f "$BACKEND_ENV_FILE" ]]; then
  FILE_OPENAI_API_KEY="$(dotenv_value OPENAI_API_KEY)"
  FILE_OPENAI_MODEL="$(dotenv_value SOYLE_OPENAI_MODEL)"
  FILE_AI_REQUEST_LIMIT="$(dotenv_value SOYLE_AI_REQUESTS_PER_HOUR)"
  if [[ -n "$FILE_OPENAI_API_KEY" ]]; then
    export OPENAI_API_KEY="$FILE_OPENAI_API_KEY"
  fi
  if [[ -n "$FILE_OPENAI_MODEL" ]]; then
    export SOYLE_OPENAI_MODEL="$FILE_OPENAI_MODEL"
  fi
  if [[ -n "$FILE_AI_REQUEST_LIMIT" ]]; then
    export SOYLE_AI_REQUESTS_PER_HOUR="$FILE_AI_REQUEST_LIMIT"
  fi
fi

export SOYLE_OPENAI_MODEL="${SOYLE_OPENAI_MODEL:-gpt-4o-mini}"
export SOYLE_AI_REQUESTS_PER_HOUR="${SOYLE_AI_REQUESTS_PER_HOUR:-30}"

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  echo "Söyle AI: локальный ключ найден"
else
  echo "Söyle AI: ключ не найден, будут использоваться резервные подсказки"
fi

cleanup() {
  if [[ -n "$BACKEND_PID" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if curl -fsS http://127.0.0.1:8010/health >/dev/null 2>&1; then
  echo "Порт 8010 уже занят другим backend-процессом."
  echo "Остановите предыдущий запуск через Ctrl+C и снова выполните ./start.sh"
  exit 1
fi

echo "Запускаю FastAPI: http://127.0.0.1:8010"
cd "$BACKEND_DIR"
env \
  DATABASE_URL="" \
  VERCEL="" \
  RAILWAY_ENVIRONMENT="" \
  RENDER="" \
  FLY_APP_NAME="" \
  K_SERVICE="" \
  SOYLE_ENV="development" \
  SOYLE_DB_PATH="$BACKEND_DIR/soyle.db" \
  SOYLE_SEED_DEMO_DATA="true" \
  SOYLE_ALLOWED_ORIGINS="$LOCAL_ALLOWED_ORIGINS" \
  SOYLE_COOKIE_SAMESITE="lax" \
  "$VENV_PYTHON" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8010 &
BACKEND_PID=$!
BACKEND_READY=0
for _ in {1..40}; do
  if curl -fsS http://127.0.0.1:8010/health >/dev/null 2>&1; then
    BACKEND_READY=1
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    break
  fi
  sleep 0.25
done
if [[ "$BACKEND_READY" -ne 1 ]]; then
  echo "Не удалось запустить FastAPI. Проверьте сообщения выше."
  exit 1
fi

echo "Запускаю Next.js: http://localhost:3000"
echo "Откройте именно http://localhost:3000/app"
cd "$FRONTEND_DIR"
npm run dev
