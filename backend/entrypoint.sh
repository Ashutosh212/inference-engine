#!/bin/bash
set -e

# Must be set before PyTorch loads its thread pools (same reason as start.sh)
export OMP_NUM_THREADS=1
export MKL_NUM_THREADS=1
export OPENBLAS_NUM_THREADS=1
export PYTHONFAULTHANDLER=1

# Download yolov8s-obb.pt from Ultralytics GitHub on first boot; cached in /data after that
MODEL_PATH="${MODEL_PATH:-/data/model/yolov8s-obb.pt}"
mkdir -p "$(dirname "$MODEL_PATH")"

if [ ! -f "$MODEL_PATH" ]; then
    echo "Downloading yolov8s-obb.pt from Ultralytics GitHub releases..."
    wget -q --show-progress -L \
        -O "$MODEL_PATH" \
        "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8s-obb.pt"
    echo "Model saved to $MODEL_PATH"
else
    echo "Model already cached at $MODEL_PATH — skipping download"
fi

# Start Celery worker in background (needed for /v1/predict/async)
celery -A app.services.queue_service.celery_app worker \
    --loglevel=info \
    --concurrency=1 \
    --without-heartbeat \
    --without-mingle &

echo "Celery worker started (PID $!)"

# Start FastAPI on port 7860 (required by HF Spaces)
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 7860 \
    --loop asyncio \
    --workers 1
