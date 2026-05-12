# InferenceEngine — Free Deployment Plan (Option A)

**Stack:** Netlify (frontend) · Hugging Face Spaces (backend + ML) · Upstash Redis (queue) · HF Model Hub (model file)  
**Cost:** $0  
**Custom domain:** Not required — you get `*.netlify.app` and `*.hf.space` subdomains

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Why These Services](#2-why-these-services)
3. [What Needs to Change in Code](#3-what-needs-to-change-in-code)
4. [Prerequisites — Accounts to Create](#4-prerequisites--accounts-to-create)
5. [Phase 1 — Upstash Redis](#5-phase-1--upstash-redis)
6. [Phase 2 — Model File on HF Model Hub](#6-phase-2--model-file-on-hf-model-hub)
7. [Phase 3 — Backend on Hugging Face Spaces](#7-phase-3--backend-on-hugging-face-spaces)
8. [Phase 4 — Frontend on Netlify](#8-phase-4--frontend-on-netlify)
9. [Phase 5 — Wire Everything Together](#9-phase-5--wire-everything-together)
10. [Full Environment Variable Reference](#10-full-environment-variable-reference)
11. [Post-Deployment Verification Checklist](#11-post-deployment-verification-checklist)
12. [Known Limitations and Workarounds](#12-known-limitations-and-workarounds)
13. [Troubleshooting Guide](#13-troubleshooting-guide)

---

## 1. Architecture Overview

```
Browser
  │
  ├─── Static assets (HTML/CSS/JS) ──────► Netlify
  │      yourapp.netlify.app               (React + Vite build)
  │
  └─── API calls (XHR/fetch) ─────────────► Hugging Face Spaces
         username-spacename.hf.space         (FastAPI + YOLOv8 + SQLite)
                │                               │
                ├── Celery async jobs ──────► Upstash Redis
                │      rediss://...             (job queue, 10k cmd/day free)
                │
                └── Model download ────────► HF Model Hub
                       on first boot          username/inference-engine-models
                       (cached to /data)
```

**Data flow for an inference request:**
1. User opens `https://yourapp.netlify.app` — Netlify serves the React SPA
2. User uploads an image; React calls `POST https://username-spacename.hf.space/v1/predict`
3. HF Spaces backend tiles the image → runs YOLOv8 OBB → returns predictions
4. React renders bounding boxes on the canvas

**Persistent storage layout on HF Spaces `/data/` volume:**
```
/data/
├── inference.db          ← SQLite database (all API keys, logs, jobs)
├── uploads/              ← uploaded images per inference request
└── model/
    └── yolov8s-obb.pt    ← model downloaded once on first boot
```

---

## 2. Why These Services

| Service | Free Tier Details | Why it works for this app |
|---|---|---|
| **Netlify** | Unlimited bandwidth, 300 build min/month, `*.netlify.app` | React/Vite static builds are exactly what it's designed for. Zero config needed. |
| **HF Spaces (CPU Basic)** | 2 vCPU, **16 GB RAM**, 50 GB disk, `*.hf.space` | PyTorch + YOLOv8 needs ~800 MB–1.2 GB RAM at runtime. Every other free tier (Render: 512 MB, Fly.io: 256 MB, Koyeb: 512 MB) will OOM on startup. HF Spaces is the only free option with enough RAM for ML inference. |
| **Upstash Redis** | 1 DB, 256 MB, **10,000 cmd/day**, no expiry | Celery needs Redis as a broker. Upstash is the only truly free hosted Redis — serverless, no VM to manage. |
| **HF Model Hub** | Unlimited public model storage via Git LFS | The model file (`yolov8s-obb.pt`) is ~22 MB binary. Keeping it out of the Docker image makes builds fast and the image lean. |

**Free tiers that were ruled out:**
- Render free web service — 512 MB RAM, sleeps after 15 min, ephemeral disk
- Fly.io free tier — 256 MB RAM per machine, far too small for PyTorch
- Railway — $5/month credit (not truly free, expires)
- Oracle Cloud Always Free ARM — genuinely free but gives only a raw IP, no subdomain

---

## 3. What Needs to Change in Code

These are all the file modifications required before deployment. Nothing in the core inference logic changes.

### 3.1 Backend Dockerfile — HF Spaces port + entrypoint

HF Spaces requires the app to listen on **port 7860**. The current Dockerfile uses 8000. A new `entrypoint.sh` handles model download and starts both Celery and Uvicorn.

**File:** `backend/Dockerfile`

Replace the entire file with:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc wget curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data/uploads /data/model

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 7860

CMD ["/entrypoint.sh"]
```

### 3.2 New file — `backend/entrypoint.sh`

This script runs at container startup. It:
- Sets thread limits to prevent PyTorch segfaults (same as the existing `start.sh`)
- Downloads the model from HF Model Hub if not already cached in `/data/model/`
- Starts Celery worker as a background process
- Starts Uvicorn on port 7860

```bash
#!/bin/bash
set -e

# Must be set before PyTorch loads its thread pools (mirrors start.sh)
export OMP_NUM_THREADS=1
export MKL_NUM_THREADS=1
export OPENBLAS_NUM_THREADS=1
export PYTHONFAULTHANDLER=1

# Download model from HF Hub on first boot; subsequent boots skip this
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
print(f'Model saved to ' + os.environ['MODEL_PATH'])
"
fi

# Start Celery worker in background (needed for /v1/predict/async endpoint)
celery -A app.services.queue_service.celery_app worker \
    --loglevel=info \
    --concurrency=1 \
    --without-heartbeat \
    --without-mingle &

echo "Celery worker started (PID $!)"

# Start FastAPI — must use --loop asyncio (avoids PyTorch/asyncio conflict)
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 7860 \
    --loop asyncio \
    --workers 1
```

> `huggingface_hub` is already installed as a transitive dependency of `ultralytics`. No new package needed in `requirements.txt`.

### 3.3 New file — `frontend/public/_redirects`

Required for React Router to work on Netlify. Without this, refreshing any page other than `/` returns a 404.

```
/*    /index.html   200
```

### 3.4 Frontend API client — no change needed

`frontend/src/api/client.ts` line 3 already reads:
```ts
const BASE_URL = import.meta.env.VITE_API_URL || ''
```
When `VITE_API_URL=https://username-inference-engine.hf.space` is set in Netlify's build environment, every call like `apiClient.post('/v1/predict', ...)` becomes `https://username-inference-engine.hf.space/v1/predict`. The browser talks directly to HF Spaces — no Nginx proxy is involved in the Netlify deployment.

### 3.5 Nginx conf — not involved on Netlify

`frontend/nginx.conf` is only used by the Docker Compose setup. Netlify serves the static `dist/` folder directly. No change needed.

### Summary of all file changes

| File | Change | Required |
|---|---|---|
| `backend/Dockerfile` | Port 8000 → 7860, add `wget curl`, use `entrypoint.sh` | **Yes** |
| `backend/entrypoint.sh` | New file — model download + Celery + Uvicorn startup | **Yes** |
| `frontend/public/_redirects` | New file — SPA routing fallback for Netlify | **Yes** |
| `frontend/src/api/client.ts` | No change — already uses `VITE_API_URL` | None |
| `backend/app/config.py` | No change — already reads all vars from env | None |
| `frontend/nginx.conf` | No change — not used on Netlify | None |

---

## 4. Prerequisites — Accounts to Create

All are free, no credit card required.

| Account | URL | Used for |
|---|---|---|
| **Hugging Face** | huggingface.co | Backend Space + model file storage |
| **Netlify** | netlify.com | Frontend static hosting |
| **Upstash** | upstash.com | Hosted Redis for Celery |
| **GitHub** | github.com | Source repo (enables auto-redeploy on push) |

---

## 5. Phase 1 — Upstash Redis

**Time:** ~5 minutes

1. Go to [console.upstash.com](https://console.upstash.com) → sign up → **Create Database**
2. Settings:
   - **Name:** `inference-engine-redis`
   - **Type:** Regional (not Global — Global costs money)
   - **Region:** Choose the region closest to you (e.g. `us-east-1`)
   - **Eviction:** Disabled
3. After creation, go to the **Details** tab → copy the **Redis URL**
   - Format: `rediss://default:YOURPASSWORD@HOSTNAME.upstash.io:6379`
   - The `rediss://` prefix (double-s) means TLS — this is correct, Celery and the `redis` Python package both support it
4. **Save this URL** — you will paste it as the `REDIS_URL` secret in HF Spaces

**Free tier limits:**
- 10,000 commands/day — each Celery async job uses ~8–12 commands, so ~800–1,200 async jobs/day
- If you use only synchronous `/v1/predict` (not `/v1/predict/async`), Redis usage drops to near zero
- Upstash pauses inactive free databases after 7 days — resume from the console if it stops working

---

## 6. Phase 2 — Model File on HF Model Hub

**Time:** ~10 minutes

The `yolov8s-obb.pt` file is a binary that does not belong in a Git repo. HF Model Hub provides free Git LFS storage designed exactly for ML model weights.

### 6.1 Create a model repository

1. Go to huggingface.co → your profile → **New Model**
2. Settings:
   - **Model name:** `inference-engine-models`
   - **Visibility:** Private (recommended — keeps custom weights private)
   - **License:** `other` or leave blank
3. Click **Create Model**

### 6.2 Upload the model file

**Option A — Web UI (simplest):**
1. Open the repo → **Files** tab → **Add file** → **Upload files**
2. Upload `/home/jovyan/yolov8s-obb.pt`
3. Also upload `/home/jovyan/yolo26n.pt` if you want the custom nano model available
4. Commit with message: `Add YOLOv8 OBB model weights`

**Option B — HF CLI:**
```bash
pip install huggingface_hub
huggingface-cli login    # enter your token from hf.co/settings/tokens
huggingface-cli upload \
    YOUR_HF_USERNAME/inference-engine-models \
    /home/jovyan/yolov8s-obb.pt \
    yolov8s-obb.pt
```

### 6.3 Create a read token for the Space

Because the model repo is private, the Space needs a token to download it at startup:
1. Go to huggingface.co/settings/tokens → **New token**
2. **Name:** `inference-engine-space`
3. **Role:** `read`
4. **Save this token** — you will paste it as the `HF_TOKEN` secret in HF Spaces

> If you make the model repo **public**, you can skip the token entirely. Set `HF_TOKEN` to empty in the Space.

---

## 7. Phase 3 — Backend on Hugging Face Spaces

**Time:** ~30 minutes (most of it is the first Docker build, which takes 10–15 minutes)

### 7.1 Create the Space

1. Go to huggingface.co → your profile → **New Space**
2. Settings:
   - **Space name:** `inference-engine` → your URL will be `https://YOUR_USERNAME-inference-engine.hf.space`
   - **SDK:** **Docker** — critical, not Gradio or Streamlit
   - **Hardware:** `CPU basic` (free — 2 vCPU, 16 GB RAM)
   - **Visibility:** Public or Private (Private requires HF Pro for Spaces — keep Public)

### 7.2 Connect to GitHub

1. In Space settings → link your GitHub repo
2. Set the **Dockerfile path** to `backend/Dockerfile`
3. Every push to `main` triggers a redeploy automatically

**Alternative — push directly to the HF Space Git repo:**
```bash
git remote add space https://huggingface.co/spaces/YOUR_USERNAME/inference-engine
git subtree push --prefix backend space main
```

### 7.3 Enable persistent storage

1. In Space settings → **Persistent storage** → **Enable**
2. This mounts a persistent volume at `/data` that survives container restarts and redeployments
3. SQLite DB, uploaded images, and the cached model will all live here

> Without this step, every restart wipes the database and re-downloads the model.

### 7.4 Set environment variables

In Space settings → **Variables and secrets** tab:

**Plain Variables (visible in UI):**

| Variable | Value |
|---|---|
| `APP_NAME` | `InferenceEngine` |
| `DATABASE_URL` | `sqlite+aiosqlite:////data/inference.db` |
| `UPLOAD_DIR` | `/data/uploads` |
| `MODEL_PATH` | `/data/model/yolov8s-obb.pt` |
| `HF_MODEL_REPO` | `YOUR_HF_USERNAME/inference-engine-models` |
| `MODEL_DEVICE` | `cpu` |
| `MODEL_CONF` | `0.25` |
| `MODEL_NMS_IOU` | `0.5` |
| `MAX_UPLOAD_SIZE_MB` | `200` |
| `ADMIN_KEY_NAME` | `admin-default` |
| `DEFAULT_RATE_LIMIT` | `60` |
| `LOG_LEVEL` | `INFO` |

**Secrets (encrypted — set these as Secrets, not Variables):**

| Secret | Value |
|---|---|
| `REDIS_URL` | `rediss://default:PASSWORD@HOST.upstash.io:6379` |
| `HF_TOKEN` | `hf_xxxxxxxxxxxx` (read token from Phase 2) |
| `SECRET_KEY` | Generate: `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `CORS_ORIGINS` | `https://YOUR_SITE.netlify.app` (set after Phase 4) |

> Set `CORS_ORIGINS` to a placeholder like `http://localhost:3000` now and update it after you know your Netlify URL.

### 7.5 Retrieve the admin API key

After the Space first boots, the admin key is printed to logs exactly once:

1. Go to the **Logs** tab in the Space UI
2. Look for:
   ```
   ============================================================
   ADMIN API KEY (save this, shown only once):
     sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ============================================================
   ```
3. **Copy and save this key immediately.** If you miss it, see the Troubleshooting section for recovery.

### 7.6 Verify the Space is running

```bash
# Health check
curl https://YOUR_USERNAME-inference-engine.hf.space/health
# Expected: {"status":"ok"}

# Swagger UI
open https://YOUR_USERNAME-inference-engine.hf.space/docs
```

---

## 8. Phase 4 — Frontend on Netlify

**Time:** ~10 minutes

### 8.1 Push the repo to GitHub

```bash
cd /home/jovyan/inference-engine
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/inference-engine.git
git push -u origin main
```

### 8.2 Create a new Netlify site

1. Go to app.netlify.com → **Add new site** → **Import an existing project**
2. Connect GitHub → select `inference-engine`
3. Build settings:

| Setting | Value |
|---|---|
| **Base directory** | `frontend` |
| **Build command** | `npm run build` |
| **Publish directory** | `frontend/dist` |

### 8.3 Set environment variables

Go to **Site configuration** → **Environment variables** → **Add variable**:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://YOUR_USERNAME-inference-engine.hf.space` |
| `NODE_VERSION` | `20` |

> `VITE_API_URL` is baked into the JS bundle at build time by Vite. If you change it later, trigger a new deploy.

### 8.4 Deploy

**Deploys** tab → **Trigger deploy** → **Deploy site**

Wait ~2 minutes. Your site will be live at `https://RANDOM_NAME.netlify.app`.

To get a cleaner URL: **Site configuration** → **Site details** → **Change site name** → e.g. `inference-engine-demo` → gives `https://inference-engine-demo.netlify.app`.

---

## 9. Phase 5 — Wire Everything Together

### 9.1 Update CORS in HF Spaces

1. HF Space settings → **Variables and secrets**
2. Update `CORS_ORIGINS` secret to your actual Netlify URL:
   ```
   https://inference-engine-demo.netlify.app
   ```
3. The Space restarts automatically

### 9.2 Enter the API key in the frontend

1. Open your Netlify URL in a browser
2. Enter the admin API key (`sk-...`) from Phase 3 Step 7.5
3. The key is stored in `localStorage` — the axios interceptor in `frontend/src/api/client.ts:10` attaches it to every request automatically

### 9.3 Create scoped keys for regular use

1. Go to the `/api-keys` page in the frontend
2. Create a key with a name and rate limit (e.g. 60 req/min)
3. Use scoped keys day-to-day; keep the admin key safe

---

## 10. Full Environment Variable Reference

### HF Spaces (backend)

| Variable | Type | Value | Required |
|---|---|---|---|
| `APP_NAME` | Variable | `InferenceEngine` | No (has default) |
| `DATABASE_URL` | Variable | `sqlite+aiosqlite:////data/inference.db` | **Yes** |
| `UPLOAD_DIR` | Variable | `/data/uploads` | **Yes** |
| `MODEL_PATH` | Variable | `/data/model/yolov8s-obb.pt` | **Yes** |
| `HF_MODEL_REPO` | Variable | `YOUR_HF_USERNAME/inference-engine-models` | **Yes** |
| `MODEL_DEVICE` | Variable | `cpu` | No (default: cpu) |
| `MODEL_CONF` | Variable | `0.25` | No (has default) |
| `MODEL_NMS_IOU` | Variable | `0.5` | No (has default) |
| `MAX_UPLOAD_SIZE_MB` | Variable | `200` | No (default: 200) |
| `ADMIN_KEY_NAME` | Variable | `admin-default` | No (has default) |
| `DEFAULT_RATE_LIMIT` | Variable | `60` | No (has default) |
| `LOG_LEVEL` | Variable | `INFO` | No (has default) |
| `REDIS_URL` | **Secret** | `rediss://default:PWD@HOST.upstash.io:6379` | **Yes** |
| `HF_TOKEN` | **Secret** | `hf_xxxxxxxxxxxx` | Yes (if model repo is private) |
| `SECRET_KEY` | **Secret** | `<64-char random hex>` | **Yes** |
| `CORS_ORIGINS` | **Secret** | `https://your-site.netlify.app` | **Yes** |

### Netlify (frontend)

| Variable | Value | Notes |
|---|---|---|
| `VITE_API_URL` | `https://YOUR_USERNAME-inference-engine.hf.space` | No trailing slash |
| `NODE_VERSION` | `20` | Ensures correct Node for the build |

---

## 11. Post-Deployment Verification Checklist

### After Phase 1 (Redis)
- [ ] Upstash console shows the database as **Active**
- [ ] The Redis URL starts with `rediss://` (double-s = TLS)

### After Phase 2 (Model Hub)
- [ ] `yolov8s-obb.pt` appears in the HF Model Hub repo files tab
- [ ] File size shows ~22 MB (if near 0 KB, the upload failed)
- [ ] HF read token is created and saved somewhere safe

### After Phase 3 (HF Spaces)
- [ ] Space status shows **Running** (green indicator)
- [ ] `GET /health` returns `{"status":"ok"}`
- [ ] `GET /docs` Swagger UI loads
- [ ] Logs show `Model loaded: yolov8s-obb.pt`
- [ ] Logs show admin API key was printed (and you saved it)
- [ ] Logs show `celery@worker ready`

**Quick verification:**
```bash
# Replace with your actual Space URL and admin key
SPACE_URL="https://YOUR_USERNAME-inference-engine.hf.space"
ADMIN_KEY="sk-YOUR_ADMIN_KEY"

curl "$SPACE_URL/health"
# → {"status":"ok"}

curl -H "X-API-Key: $ADMIN_KEY" "$SPACE_URL/v1/api-keys"
# → {"data":[...],"error":null}
```

### After Phase 4 (Netlify)
- [ ] Build log shows **Build succeeded** with no TypeScript errors
- [ ] Site loads at `https://your-site.netlify.app`
- [ ] Refreshing `/dashboard` does not return a 404 (confirms `_redirects` works)
- [ ] Browser DevTools → Network tab → no 404 on static assets

### After Phase 5 (Wired together)
- [ ] Browser DevTools → Console → no CORS errors
- [ ] Health endpoint returns success (visible in the Network tab)
- [ ] Upload a test image → inference runs → bounding boxes appear on the canvas
- [ ] Dashboard page shows the request in the logs table
- [ ] `/v1/predict/async` returns a job ID and polling resolves to a result

---

## 12. Known Limitations and Workarounds

### HF Space sleeps after 48 hours of inactivity

**Symptom:** First request after a long idle period takes 30–60 seconds (container restarts cold).

**Workaround — GitHub Actions keepalive (free):**
```yaml
# .github/workflows/keepalive.yml
name: Keep HF Space alive
on:
  schedule:
    - cron: '0 */12 * * *'   # ping every 12 hours
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -f https://YOUR_USERNAME-inference-engine.hf.space/health
```
Commit this file to `.github/workflows/keepalive.yml` in your repo. GitHub Actions runs scheduled workflows for free on public repos.

### Upstash 10,000 commands/day ceiling

Each Celery async job uses ~8–12 Redis commands. At the limit, that's ~800–1,200 async jobs/day.

**Workaround:** The sync endpoint `/v1/predict` bypasses Redis entirely. Use it for interactive inference; async is only needed when you want to queue multiple large jobs. If you only use sync, the 10,000 cmd/day limit is effectively irrelevant.

### SQLite write contention

Two processes write to `inference.db` simultaneously: Uvicorn (request logs) and Celery (job status). Under concurrent load this can produce `database is locked` errors.

**Workaround:** `aiosqlite` already retries on lock. For a personal or low-traffic deployment, this never becomes an issue in practice.

### Model re-download after `/data` volume wipe

If you manually reset persistent storage in HF Spaces, `entrypoint.sh` will re-download the model (~10–30 seconds). This is automatic — no manual action required.

### 200 MB upload limit and slow inference on large images

The backend allows 200 MB uploads and the frontend sets a 10-minute request timeout (`timeout: 600000` in `client.ts`). This is already tuned for large satellite images. However, on HF Spaces' shared CPU the actual inference on a 3000×3000 image (producing many 640×640 tiles) may take 2–5 minutes.

**Workaround:** Use the async endpoint `/v1/predict/async` for large images so the connection does not block.

### `/data` fills up over time

At 200 MB per upload, 50 GB of persistent storage fits ~250 full-size images. Add a cleanup step or periodically clear old uploads:
```bash
# Run in HF Spaces terminal (Settings → SSH)
find /data/uploads/ -mtime +30 -type f -delete
```

---

## 13. Troubleshooting Guide

### CORS error in browser console

```
Access to XMLHttpRequest at 'https://...hf.space/v1/predict' from origin
'https://...netlify.app' has been blocked by CORS policy
```

**Cause:** `CORS_ORIGINS` secret in HF Spaces does not include the Netlify URL.

**Fix:** Update `CORS_ORIGINS` in HF Spaces secrets → Space restarts automatically.

---

### HF Space stuck on "Building" for more than 15 minutes

**Cause:** First-time `pip install` downloads PyTorch + Ultralytics (~2 GB). Normal build time is 10–15 minutes.

**Fix:** Wait. Check the build logs tab for actual errors. If you see a pip dependency conflict, check that `requirements.txt` has no pinned versions that clash with the Python 3.11-slim base.

---

### Space starts but model fails to load

Log line: `Warning: model pre-load failed: ...`

**Possible causes and fixes:**

| Cause | Fix |
|---|---|
| `HF_MODEL_REPO` is wrong | Verify it matches `YOUR_USERNAME/inference-engine-models` exactly |
| `HF_TOKEN` is missing or expired | Regenerate a read token at hf.co/settings/tokens and update the secret |
| Model file was not uploaded to Hub | Check the Files tab in your HF Model Hub repo |
| `/data/model/` path wrong | Check `MODEL_PATH` env var — must have 4 leading slashes for an absolute path |

---

### "Connection refused" / frontend calls fail silently

**Cause:** `VITE_API_URL` is missing in Netlify, so the frontend falls back to `BASE_URL = ''` and calls relative URLs like `/v1/predict` against the Netlify domain itself — which returns 404.

**Fix:** Netlify → Site configuration → Environment variables → add `VITE_API_URL=https://...hf.space` → trigger a new deploy.

---

### Redis connection error in Space logs

```
redis.exceptions.ConnectionError: Error connecting to rediss://...
```

**Possible causes:**
1. Upstash database is paused (inactive databases pause after 7 days on free tier) → log in to console.upstash.com → click Resume
2. `REDIS_URL` secret is missing or has a typo → verify in Space secrets
3. URL uses `redis://` instead of `rediss://` (missing TLS) → update to `rediss://`

---

### Admin API key was not saved and cannot be found

The key is only printed to logs on first startup when no admin key exists in the DB. If the Space has restarted with the same `/data` volume, the key already exists and is not re-printed.

**Recovery:**
```bash
# In HF Spaces terminal (Settings → SSH or Exec tab)
sqlite3 /data/inference.db "SELECT id, name, key_prefix FROM api_keys WHERE is_admin=1;"
# This shows the key prefix (first ~8 chars) but NOT the full key

# To force regeneration: delete the admin key and restart the Space
sqlite3 /data/inference.db "DELETE FROM api_keys WHERE is_admin=1;"
# Then go to Settings → Restart Space
# The full key will be printed in logs on next boot
```

---

### Netlify build fails — TypeScript errors

**Fix:** Run the build locally first to catch all errors:
```bash
cd /home/jovyan/inference-engine/frontend
npm install
npm run build
```
Fix any TypeScript errors, push, and Netlify will redeploy automatically.

---

### Celery worker not starting

Log line: `[ERROR/MainProcess] consumer: Cannot connect to rediss://...`

**Cause:** Celery cannot reach Redis at startup.

**Fix:** Resolve the Redis issue first (see Redis troubleshooting above). The Celery worker is started after Uvicorn in `entrypoint.sh` — if Redis is unavailable, Celery will fail but Uvicorn continues running. Synchronous `/v1/predict` will still work; only async jobs are affected.

---

*Total estimated setup time: 60–90 minutes on first run.*
