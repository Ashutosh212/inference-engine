import os

# Must be set before PyTorch/OpenMP initialise their thread pools
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
try:
    import torch
    torch.set_num_threads(1)
except Exception:
    pass

import uuid
import secrets
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db, AsyncSessionLocal
from app.routers import health, inference, api_keys, dashboard
from app.middleware.rate_limiter import RateLimiterMiddleware
from app.middleware.logging_mw import RequestLoggingMiddleware

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs("./data", exist_ok=True)


async def create_admin_key():
    from app.models.db_models import APIKey
    from app.services.auth_service import generate_api_key, hash_key
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(APIKey).where(APIKey.is_admin == True).limit(1))
        existing = result.scalar_one_or_none()
        if existing:
            return

        raw_key, prefix = generate_api_key()
        key_hash = hash_key(raw_key)
        admin_key = APIKey(
            id=str(uuid.uuid4()),
            key_hash=key_hash,
            key_prefix=prefix,
            name=settings.ADMIN_KEY_NAME,
            is_admin=True,
            rate_limit=1000,
        )
        db.add(admin_key)
        await db.commit()
        print(f"\n{'='*60}")
        print(f"ADMIN API KEY (save this, shown only once):")
        print(f"  {raw_key}")
        print(f"{'='*60}\n")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await create_admin_key()
    # Pre-load the model so first request doesn't pay the cold-start cost
    from app.services.model_service import model_service
    try:
        model_service._load()
        print(f"Model loaded: {model_service.model_name}")
    except Exception as e:
        print(f"Warning: model pre-load failed: {e}")
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Vision model inference engine with preprocessing pipeline",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimiterMiddleware)
app.add_middleware(RequestLoggingMiddleware)

app.include_router(health.router)
app.include_router(inference.router)
app.include_router(api_keys.router)
app.include_router(dashboard.router)
