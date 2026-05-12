#!/bin/bash
set -e

# Must be set before PyTorch loads its thread pools (same reason as start.sh)
export OMP_NUM_THREADS=1
export MKL_NUM_THREADS=1
export OPENBLAS_NUM_THREADS=1
export PYTHONFAULTHANDLER=1

# Download model from HF Hub on first boot; cached on /data after that
MODEL_PATH="${MODEL_PATH:-/data/model/yolov8s-obb.pt}"
mkdir -p "$(dirname "$MODEL_PATH")"

if [ ! -f "$MODEL_PATH" ]; then
    echo "Model not found at $MODEL_PATH — downloading from HF Hub..."
    python3 -c "
from huggingface_hub import hf_hub_download
import shutil, os
path = hf_hub_download(
    repo_id=os.environ['HF_MODEL_REPO'],
    filename='yolov8s-obb.pt',
    token=os.environ.get('HF_TOKEN')
)
shutil.copy(path, os.environ['MODEL_PATH'])
print('Model saved to ' + os.environ['MODEL_PATH'])
"
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
