#!/bin/bash
set -e

echo "Starting InferenceEngine development environment..."

# Start Redis if not running
if ! command -v redis-cli &> /dev/null || ! redis-cli ping &> /dev/null 2>&1; then
  echo "Redis not detected. Starting via Docker..."
  docker run -d --name inference-redis -p 6379:6379 redis:7-alpine 2>/dev/null || true
fi

# Backend
cd "$(dirname "$0")/../backend"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi

mkdir -p data uploads

echo "Starting backend on http://localhost:8000 ..."
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Frontend
cd ../frontend
if [ ! -d "node_modules" ]; then
  npm install
fi

echo "Starting frontend on http://localhost:5173 ..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "InferenceEngine running:"
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

wait
