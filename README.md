# InferenceEngine

A self-hosted vision model inference API with a full preprocessing pipeline and web playground.

## Quick Start

### Docker Compose (recommended)

```bash
cd inference-engine
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs

The admin API key is printed to the backend container logs on first start:
```bash
docker-compose logs backend | grep "sk-"
```

### Local Development

```bash
# Install Redis (or run via Docker)
docker run -d -p 6379:6379 redis:7-alpine

# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev   # http://localhost:5173
```

Or use the dev script:
```bash
bash scripts/run_dev.sh
```

## Using the API

Set your API key (shown in backend console on first start):

```bash
curl -X POST http://localhost:8000/v1/predict \
  -H "X-API-Key: sk-your-key-here" \
  -F "file=@image.jpg"
```

## Architecture

### Preprocessing Pipeline (8 steps)

Each step is an independent module in `backend/app/preprocessing/steps/`. The pipeline auto-discovers all steps via the registry.

```
Upload → validate → decode → resize → color_convert → normalize → patch → (augment) → tensorize → Model
```

| Step | File | Description |
|------|------|-------------|
| validate | s01_validate.py | Format, size, magic bytes check |
| decode | s02_decode.py | PIL Image decode |
| resize | s03_resize.py | Resize with aspect ratio + letterboxing |
| color_convert | s04_color_convert.py | RGB/RGBA/grayscale conversion |
| normalize | s05_normalize.py | ImageNet, minmax, or standard scaling |
| patch | s06_patch.py | ViT-style 16×16 patch extraction |
| augment | s07_augment.py | Flip/rotate/brightness (disabled by default) |
| tensorize | s08_tensorize.py | Final tensor for model input |

### Three Swap Points

1. **`backend/app/services/model_service.py`** — Replace `ModelService.predict()` with your real model
2. **`backend/app/preprocessing/steps/`** — Add, remove, or replace any preprocessing step
3. **`backend/app/preprocessing/config.py`** — Change pipeline parameters without touching code

### Adding a New Step

Create `backend/app/preprocessing/steps/s09_your_step.py`:

```python
from app.preprocessing.base import PreprocessingStep, PreprocessingContext

class YourStep(PreprocessingStep):
    name = "your_step"
    description = "What it does"
    order = 9
    enabled = True

    async def process(self, ctx: PreprocessingContext, params: dict) -> PreprocessingContext:
        # modify ctx
        ctx.step_outputs["your_step"] = {"key": "value"}
        return ctx
```

That's it — the registry auto-discovers it, the API exposes it, and the UI renders it.

## Running Tests

```bash
cd backend
source .venv/bin/activate
pytest tests/ -v
```

## Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| Playground | /playground | Drag-and-drop image upload, run inference, view per-step results |
| Dashboard | /dashboard | Usage metrics, latency charts, step timing breakdown |
| Pipeline | /pipeline | View/edit pipeline configuration, visual step flow |
| API Keys | /api-keys | Create, revoke, and manage API keys |
| Logs | /logs | Paginated request log with step timings |
| Docs | /docs | API reference with Python/JS/cURL examples |
