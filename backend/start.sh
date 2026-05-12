#!/bin/bash
export OMP_NUM_THREADS=1
export MKL_NUM_THREADS=1
export OPENBLAS_NUM_THREADS=1
export PYTHONFAULTHANDLER=1
source "$(dirname "$0")/.venv/bin/activate"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --loop asyncio "$@"
