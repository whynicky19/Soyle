#!/bin/zsh
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

if [[ ! -x "$BACKEND_DIR/.venv/bin/uvicorn" ]]; then
  echo "Устанавливаю backend-зависимости…"
  python3 -m venv "$BACKEND_DIR/.venv"
  "$BACKEND_DIR/.venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Устанавливаю frontend-зависимости…"
  npm --prefix "$FRONTEND_DIR" install
fi

cleanup() {
  if [[ -n "$BACKEND_PID" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if curl -fsS http://127.0.0.1:8010/health >/dev/null 2>&1; then
  echo "FastAPI уже работает: http://127.0.0.1:8010"
else
  echo "Запускаю FastAPI: http://127.0.0.1:8010"
  cd "$BACKEND_DIR"
  "$BACKEND_DIR/.venv/bin/uvicorn" app.main:app --reload --host 127.0.0.1 --port 8010 &
  BACKEND_PID=$!
  sleep 1
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "Не удалось запустить FastAPI. Проверьте, свободен ли порт 8010."
    exit 1
  fi
fi

echo "Запускаю Next.js: http://localhost:3000"
cd "$FRONTEND_DIR"
npm run dev
