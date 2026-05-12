# InferenceEngine — Full Project Log
**Date:** 2026-05-11  
**Project:** Human-in-the-loop satellite image inference platform  
**Stack:** FastAPI + React + YOLOv8 OBB

---

## 1. What This App Does

A web application where analysts can:
1. Upload large satellite images (UP42 / Pléiades, ~3000×3000px)
2. Run object detection using YOLOv8 OBB (Oriented Bounding Boxes)
3. See detection results overlaid on the image with rotated bounding boxes
4. Adjust a confidence threshold slider to filter detections in real-time
5. Review preprocessing pipeline stats per step
6. Access request logs, API key management, and a stats dashboard

**Target domain:** Satellite imagery object detection — planes, ships, vehicles, etc.

---

## 2. Architecture

### Directory layout
```
inference-engine/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app, lifespan, model pre-warm
│   │   ├── config.py                # Pydantic settings (reads .env)
│   │   ├── database.py              # SQLAlchemy async setup (aiosqlite)
│   │   ├── models/
│   │   │   ├── db_models.py         # SQLAlchemy ORM models
│   │   │   └── schemas.py           # Pydantic response schemas
│   │   ├── routers/
│   │   │   ├── inference.py         # /v1/predict, /v1/predict/async, /v1/jobs/{id}
│   │   │   ├── health.py            # /health
│   │   │   ├── api_keys.py          # /v1/api-keys CRUD
│   │   │   └── dashboard.py         # /v1/stats, /v1/logs
│   │   ├── middleware/
│   │   │   ├── logging_mw.py        # Logs every request to DB
│   │   │   └── rate_limiter.py      # Token bucket rate limiter
│   │   ├── services/
│   │   │   ├── model_service.py     # YOLOv8 OBB inference, NMS, coordinate stitching
│   │   │   ├── artifact_service.py  # Saves tiles + predictions to /home/jovyan/v1/predict/
│   │   │   ├── auth_service.py      # API key hashing (SHA-256), validation
│   │   │   └── queue_service.py     # Celery task (async mode)
│   │   └── preprocessing/
│   │       ├── base.py              # PreprocessingContext dataclass, PreprocessingStep ABC
│   │       ├── pipeline.py          # Runs steps in order, respects config enabled:false
│   │       ├── registry.py          # Auto-discovers steps via pkgutil
│   │       ├── config.py            # PIPELINE_CONFIG dict (all step parameters)
│   │       └── steps/
│   │           ├── s01_validate.py  # File size / format check
│   │           ├── s02_decode.py    # PIL Image.open + image.load()
│   │           ├── s03_resize.py    # Resize (DISABLED in config for satellite images)
│   │           ├── s04_color_convert.py  # Convert to RGB
│   │           ├── s05_normalize.py # Normalize (DISABLED — YOLO handles internally)
│   │           ├── s06_patch.py     # Tile to 640×640 patches (numpy-based)
│   │           ├── s07_augment.py   # Augmentations (DISABLED)
│   │           └── s08_tensorize.py # Tensorize (DISABLED — YOLO takes PIL directly)
│   ├── .env                         # Environment variables
│   ├── requirements.txt
│   ├── start.sh                     # Always use this to start — sets OMP/MKL env vars
│   └── data/
│       └── inference.db             # SQLite database
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Playground.tsx       # Main inference page
│   │   │   ├── Dashboard.tsx        # Stats charts
│   │   │   ├── Pipeline.tsx         # Pipeline config viewer
│   │   │   ├── ApiKeys.tsx          # Key management
│   │   │   ├── Logs.tsx             # Request log table
│   │   │   └── Docs.tsx             # Documentation page
│   │   ├── components/
│   │   │   ├── Layout.tsx           # Sidebar nav, API key modal, model status indicator
│   │   │   ├── DetectionCanvas.tsx  # Canvas overlay: rotated OBBs, confidence slider, legend
│   │   │   ├── PreprocessingPanel.tsx  # Per-step timing and output display
│   │   │   ├── ImageUploader.tsx    # Drag-and-drop image upload
│   │   │   └── ResultDisplay.tsx    # (Legacy — not used in Playground anymore)
│   │   ├── hooks/
│   │   │   └── useInference.ts      # Wraps predict/predictAsync API calls, polling
│   │   └── api/
│   │       └── client.ts            # Axios client, API key header injection
│   ├── vite.config.ts               # Proxy /v1 and /health → backend:8000
│   └── package.json
├── CLAUDE.md                        # Project goals and architecture reference
└── 2026-05-11-project-log.md        # This file
```

### Data flow
```
Browser uploads image
  → POST /v1/predict (with X-API-Key header)
  → Auth middleware validates key
  → Rate limiter checks token bucket
  → Preprocessing pipeline:
       validate → decode → color_convert → patch (640×640 tiles, 128px overlap)
  → YOLOv8 OBB inference on each tile
  → Predictions adjusted by tile offset → full-image coordinates
  → NMS across tile boundaries (axis-aligned AABB approximation)
  → save_artifacts() writes original + tiles + predictions.json + metadata.json
  → Request logged to DB
  → Response: predictions (cx,cy,w,h,angle,conf,class) + preprocessing info
  → Frontend renders rotated OBBs on canvas with confidence slider
```

---

## 3. Key Configuration

### backend/.env
```
APP_NAME=InferenceEngine
DATABASE_URL=sqlite+aiosqlite:///./data/inference.db
ADMIN_KEY_NAME=admin-default
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
UPLOAD_DIR=/home/jovyan/v1/predict
MAX_UPLOAD_SIZE_MB=200
MODEL_PATH=/home/jovyan/yolov8s-obb.pt
MODEL_CONF=0.25
MODEL_NMS_IOU=0.5
```

### Active pipeline steps (others are disabled via config `enabled: false`)
- `validate` — max 200MB, JPEG/PNG/WebP/TIFF
- `decode` — PIL Image.open + image.load()
- `color_convert` — converts to RGB
- `patch` — 640×640 tiles, 128px overlap, stride=512 (numpy-based, not PIL crop)

### Model files on disk
- `/home/jovyan/yolov8s-obb.pt` — YOLOv8 small OBB (primary model)
- `/home/jovyan/yolo26n.pt` — custom fine-tuned YOLOv8 nano OBB (not yet wired in)

---

## 4. How to Run

### Backend
```bash
cd /home/jovyan/inference-engine/backend
./start.sh           # production / testing
./start.sh --reload  # development (auto-reload on code changes)
```

**Must use `start.sh`** — it sets `OMP_NUM_THREADS=1`, `MKL_NUM_THREADS=1`, `OPENBLAS_NUM_THREADS=1`, and `--loop asyncio`. Without these, the server segfaults when PyTorch and uvicorn's native I/O coexist.

On first startup, the admin API key is printed to terminal:
```
============================================================
ADMIN API KEY (save this, shown only once):
  sk-xxxxxxxxxxxxxxxxxxxx
============================================================
```
To regenerate: `rm data/inference.db` then restart.

### Frontend
```bash
# Load nvm first if npm not found:
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"

cd /home/jovyan/inference-engine/frontend
npm run dev
# Opens at http://localhost:5173
```

Add to `~/.bashrc` to make npm permanent:
```bash
echo 'export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"' >> ~/.bashrc
```

---

## 5. Bugs Found and Fixed (Chronological)

### 5.1 `scalar_one_or_none()` crash on admin key creation
**Symptom:** `MultipleResultsFound` error at startup  
**Cause:** Multiple admin keys existed in DB from testing; query returned >1 row  
**Fix:** Added `.limit(1)` to the admin key lookup query in `main.py`

### 5.2 Async endpoint returning tuple
**Symptom:** FastAPI error on `/v1/predict/async`  
**Cause:** Endpoint returned `(APIResponse, 202)` — FastAPI can't serialize tuples  
**Fix:** Replaced with `JSONResponse(status_code=202, content={...})`

### 5.3 Missing `aiosqlite`
**Symptom:** `ModuleNotFoundError: No module named 'aiosqlite'`  
**Fix:** Added `aiosqlite==0.20.0` to `requirements.txt`

### 5.4 Pytest asyncio mode
**Symptom:** Async tests failing  
**Fix:** Added `pytest.ini` with `asyncio_mode = auto`

### 5.5 API key setup required DevTools
**Symptom:** Users had to open browser DevTools → Application → LocalStorage to set the API key  
**Fix:** Built a full API key modal in `Layout.tsx` — amber banner when no key, "Set API Key" button in topbar, modal with input, key displayed truncated in sidebar

### 5.6 Frontend request timeout
**Symptom:** `timeout of 60000ms exceeded` on CPU inference  
**Cause:** Default Axios timeout was 60 seconds; YOLOv8 on CPU takes minutes  
**Fix:** Increased timeout to `600000` (10 minutes) in `client.ts`

### 5.7 `asyncio.get_event_loop()` deprecation
**Symptom:** Potential runtime error in Python 3.10+  
**Fix:** Changed all `get_event_loop()` calls to `get_running_loop()` in `model_service.py`, `inference.py`, `main.py`

### 5.8 Vite `allowedHosts: 'all'` blocking browser
**Symptom:** Browser spins loading, Vite serving nothing  
**Cause:** Added `allowedHosts: 'all'` (a string) to `vite.config.ts` — Vite 5.4 treats it as a hostname whitelist, blocking everything  
**Fix:** Changed to `allowedHosts: true`

### 5.9 Segfault — uvloop vs PyTorch
**Symptom:** `Segmentation fault (core dumped)` immediately after `Uvicorn running on...`  
**Cause:** uvloop (Cython-based async I/O) conflicts with PyTorch's native thread initialization  
**Fix:** Run uvicorn with `--loop asyncio` flag to use the standard Python event loop instead

### 5.10 Segfault — PyTorch inside `run_in_executor`
**Symptom:** Segfault when inference called in a thread pool executor  
**Cause:** PyTorch's OpenMP/MKL threads conflict when called from Python thread pool  
**Fix:** Removed all `run_in_executor` calls around model inference. Model now runs synchronously in the async function (blocks event loop during inference — acceptable for single-user tool)

### 5.11 Segfault — PIL `_crop` memory corruption
**Symptom:** Fault handler traceback pointing to `PIL/Image.py _crop` called from `s06_patch.py`  
**Cause:** PyTorch's custom C memory allocator corrupts Python's general-purpose allocator after model loading; PIL's `_crop` C extension then hits corrupted memory on allocation  
**Root diagnosis command:** `PYTHONFAULTHANDLER=1 ./start.sh` — prints Python stack trace on segfault  
**Fix:** Rewrote `s06_patch.py` to use **numpy array slicing** (`arr[y:y+640, x:x+640]`) instead of PIL's `Image.crop()`. PIL `Image.fromarray()` is used only to create final tile objects, not for the slice operation. This avoids PIL's C allocator entirely.

### 5.12 Pipeline ignoring `enabled: false` in config
**Symptom:** Resize step running on satellite images (shrinking to 224×224), producing 1 tile instead of many; predictions in 224×224 coordinate space overlaid on full-resolution image → boxes in wrong positions  
**Cause:** `PreprocessingPipeline.__init__()` filtered steps using `s.enabled` (class-level attribute = `True`). The per-step `enabled: false` in `PIPELINE_CONFIG` was never checked  
**Fix:** Added a check in `pipeline.py`'s `run()` method:
```python
if not step_params.get("enabled", True):
    continue
```

### 5.13 Coordinate mismatch in canvas overlay
**Symptom:** Bounding boxes visible but not aligned to objects  
**Root cause:** Same as 5.12 — resize running first meant predictions were in 224×224 coords, but canvas was scaling from 224×224 to display size while showing the original full-resolution image  
**Fix:** Fixing 5.12 resolved this — with resize disabled, predictions are in original image coordinates

---

## 6. Features Currently Implemented

### Backend
- **API key authentication** — SHA-256 hashed keys, admin vs regular, per-key rate limits
- **Token bucket rate limiter** — middleware, configurable per key
- **Request logging middleware** — logs every request to SQLite with timing, file info, step timings
- **Preprocessing pipeline** — 8-step auto-discovered pipeline, each step independently swappable
- **Satellite tiling** — 640×640 patches with 128px overlap, stride=512, numpy-based (no PIL crop)
- **YOLOv8 OBB inference** — real model, per-tile inference, coordinate stitching to full-image space
- **Cross-tile NMS** — axis-aligned AABB approximation of OBBs, greedy IoU NMS
- **Artifact saving** — `/home/jovyan/v1/predict/{request_id}/original.jpg`, `tiles/`, `predictions.json`, `metadata.json`
- **Async job queue** — Celery task for long-running jobs (basic wiring exists, Celery worker not always running)
- **Dashboard API** — `/v1/stats` (request counts, latency percentiles), `/v1/logs` (paginated)

### Frontend
- **Playground page** — upload, run inference, see results
- **DetectionCanvas** — HTML Canvas rendering of image + rotated OBBs
  - Per-class colors (15-color palette cycling by class_id)
  - True rotated bounding boxes using canvas transform + rotate
  - Labels: class name + confidence % with colored background
  - Confidence threshold slider (real-time, no re-inference needed)
  - Class legend with counts below canvas
- **Preprocessing Panel** — per-step timing, expandable step output details
- **Layout** — sidebar nav, API key modal (set/change key without DevTools), model status dot
- **Dashboard page** — request volume charts, latency stats (Recharts)
- **Pipeline page** — view active steps and config
- **API Keys page** — create/revoke/edit keys
- **Logs page** — paginated request log table
- **Docs page** — usage documentation
- **Recent Runs** history in Playground (last 10 runs with detection count)

---

## 7. Prediction Format

The API returns predictions in this format per detection:
```json
{
  "cx": 423.5,       // center x in full-image pixel coordinates
  "cy": 318.2,       // center y in full-image pixel coordinates
  "width": 64.3,     // box width in pixels
  "height": 28.1,    // box height in pixels
  "angle": 0.523,    // rotation angle in radians
  "confidence": 0.87,
  "class_id": 2,
  "class_name": "large-vehicle",
  "tile_offset": [512, 0]  // which tile this came from
}
```

---

## 8. Known Limitations / Not Yet Implemented

### Critical for production
- **Human-in-the-loop UI** — the main goal of the app. Users should be able to:
  - Click a detection to select it
  - Drag to move / resize / rotate a bounding box
  - Delete false positives
  - Draw new boxes (click-drag to create)
  - Change the class label of a box
  - Save corrections back to the server
- **Export corrected annotations** — DOTA format, COCO OBB format, or GeoJSON
- **Zoom and pan on canvas** — essential for 3000×3000px satellite images; currently the whole image is shown at once

### Model improvements
- **yolo26n.pt not wired in** — the custom fine-tuned model at `/home/jovyan/yolo26n.pt` is not yet available via the UI. Add model selection dropdown.
- **True rotated IoU NMS** — current NMS uses axis-aligned AABB approximation; a proper rotated polygon IoU would reduce duplicate boxes at tile boundaries
- **Confidence per class** — current threshold is global; per-class thresholds would be useful

### Infrastructure
- **Celery worker not running** — async mode is wired but the Celery worker process isn't started. Either start it or remove async mode from the UI to avoid confusion.
- **SQLite → PostgreSQL** — SQLite is fine for single-user but should be upgraded for multi-user
- **No authentication for UI** — anyone who can reach the frontend can try to authenticate

### UX
- **Image too small in the canvas** — for large satellite images the canvas is limited to the panel width (~700px). Need zoom/pan.
- **No progress indicator during tiling** — for 3000×3000 images with many tiles, users see a blank spinner with no progress
- **WebSocket progress** — tile-by-tile progress updates during inference would improve UX

---

## 9. Swap Points for Future Model Integration

Three files to touch when switching models or preprocessing:

| File | What to change |
|------|---------------|
| `backend/app/services/model_service.py` | Replace `YOLO(MODEL_PATH)` with your model; update `_predict_tile()` to match output format |
| `backend/app/preprocessing/steps/s06_patch.py` | Change patch size, overlap, or tiling strategy |
| `backend/app/preprocessing/config.py` | Adjust patch_size, overlap, enabled/disabled steps without touching code |

To add a new preprocessing step: create `s09_mystep.py` in `preprocessing/steps/` — the registry auto-discovers it.

---

## 10. Training Data Locations

```
/sfs/data_train_up42/   — training images (UP42 satellite, labeled)
/sfs/data_test_up42/    — test images
/home/jovyan/yolov8s-obb.pt   — YOLOv8s OBB model
/home/jovyan/yolo26n.pt       — custom YOLOv8n OBB (fine-tuned on UP42 data)
```

---

## 11. Critical Startup Note

**Always start the backend with `./start.sh`**, never bare `uvicorn`. The script sets:
```bash
OMP_NUM_THREADS=1
MKL_NUM_THREADS=1
OPENBLAS_NUM_THREADS=1
PYTHONFAULTHANDLER=1          # prints stack trace on crash
uvicorn ... --loop asyncio    # avoids uvloop/PyTorch segfault
```

Without `--loop asyncio`, the server segfaults on startup every time due to uvloop conflicting with PyTorch's thread pools. This is a known incompatibility between uvloop and PyTorch CPU inference.
