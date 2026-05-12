import json
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional
from app.database import get_db
from app.models.db_models import APIKey, RequestLog
from app.models.schemas import APIResponse
from app.services.auth_service import validate_api_key
from app.services.model_service import model_service
from app.preprocessing.registry import StepRegistry
from app.preprocessing.pipeline import PreprocessingPipeline
from app.preprocessing.config import PIPELINE_CONFIG

router = APIRouter(prefix="/v1", tags=["Dashboard"])


async def require_auth(x_api_key: Optional[str] = Header(None, alias="X-API-Key"), db: AsyncSession = Depends(get_db)) -> APIKey:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-API-Key required")
    api_key = await validate_api_key(db, x_api_key)
    if not api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return api_key


@router.get("/stats")
async def get_stats(_: APIKey = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    total_result = await db.execute(select(func.count(RequestLog.id)))
    total_requests = total_result.scalar() or 0

    today_result = await db.execute(
        select(func.count(RequestLog.id)).where(RequestLog.created_at >= today_start)
    )
    requests_today = today_result.scalar() or 0

    week_result = await db.execute(
        select(func.count(RequestLog.id)).where(RequestLog.created_at >= week_start)
    )
    requests_this_week = week_result.scalar() or 0

    latency_result = await db.execute(
        select(
            func.avg(RequestLog.total_latency_ms),
            func.avg(RequestLog.preprocessing_ms),
            func.avg(RequestLog.inference_ms),
        ).where(RequestLog.total_latency_ms.isnot(None))
    )
    latency_row = latency_result.first()
    avg_latency = round(float(latency_row[0] or 0), 2)
    avg_preprocess = round(float(latency_row[1] or 0), 2)
    avg_inference = round(float(latency_row[2] or 0), 2)

    p95_result = await db.execute(
        select(RequestLog.total_latency_ms)
        .where(RequestLog.total_latency_ms.isnot(None))
        .order_by(RequestLog.total_latency_ms)
    )
    latencies = [r[0] for r in p95_result.all()]
    p95 = 0.0
    if latencies:
        idx = int(len(latencies) * 0.95)
        p95 = float(latencies[min(idx, len(latencies) - 1)])

    error_result = await db.execute(
        select(func.count(RequestLog.id)).where(RequestLog.status_code >= 400)
    )
    error_count = error_result.scalar() or 0
    error_rate = round((error_count / total_requests * 100) if total_requests > 0 else 0.0, 2)

    hours_ago_24 = now - timedelta(hours=24)
    hourly_result = await db.execute(
        select(RequestLog.created_at)
        .where(RequestLog.created_at >= hours_ago_24)
        .order_by(RequestLog.created_at)
    )
    hourly_rows = hourly_result.scalars().all()
    hourly_counts: dict[str, int] = {}
    for ts in hourly_rows:
        hour_key = ts.strftime("%Y-%m-%dT%H:00:00Z") if ts.tzinfo else ts.replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:00:00Z")
        hourly_counts[hour_key] = hourly_counts.get(hour_key, 0) + 1
    requests_per_hour = [{"hour": k, "count": v} for k, v in sorted(hourly_counts.items())]

    top_keys_result = await db.execute(
        select(APIKey.id, APIKey.name, APIKey.key_prefix, APIKey.total_requests)
        .order_by(APIKey.total_requests.desc())
        .limit(5)
    )
    top_api_keys = [
        {"id": r[0], "name": r[1], "prefix": r[2], "total_requests": r[3]}
        for r in top_keys_result.all()
    ]

    all_logs_result = await db.execute(
        select(RequestLog.step_timings).where(RequestLog.step_timings.isnot(None))
    )
    all_step_timings: dict[str, list[float]] = {}
    for row in all_logs_result.scalars().all():
        try:
            timings = json.loads(row)
            for step, ms in timings.items():
                all_step_timings.setdefault(step, []).append(float(ms))
        except Exception:
            pass
    avg_step_timings = {step: round(sum(vals) / len(vals), 2) for step, vals in all_step_timings.items()}

    steps = StepRegistry.discover_steps()
    pipeline = PreprocessingPipeline(steps, PIPELINE_CONFIG)

    return APIResponse(
        data={
            "total_requests": total_requests,
            "requests_today": requests_today,
            "requests_this_week": requests_this_week,
            "avg_latency_ms": avg_latency,
            "avg_preprocessing_ms": avg_preprocess,
            "avg_inference_ms": avg_inference,
            "p95_latency_ms": p95,
            "error_rate": error_rate,
            "requests_per_hour": requests_per_hour,
            "top_api_keys": top_api_keys,
            "model_info": model_service.get_model_info(),
            "pipeline_info": pipeline.get_pipeline_info(),
            "avg_step_timings": avg_step_timings,
        }
    )


@router.get("/logs")
async def get_logs(
    page: int = 1,
    page_size: int = 25,
    status_code: Optional[int] = None,
    api_key_id: Optional[str] = None,
    _: APIKey = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    query = select(RequestLog).order_by(RequestLog.created_at.desc())
    count_query = select(func.count(RequestLog.id))

    if status_code:
        query = query.where(RequestLog.status_code == status_code)
        count_query = count_query.where(RequestLog.status_code == status_code)
    if api_key_id:
        query = query.where(RequestLog.api_key_id == api_key_id)
        count_query = count_query.where(RequestLog.api_key_id == api_key_id)

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    logs_result = await db.execute(query)
    logs = logs_result.scalars().all()

    return APIResponse(
        data={
            "logs": [
                {
                    "id": log.id,
                    "api_key_id": log.api_key_id,
                    "endpoint": log.endpoint,
                    "method": log.method,
                    "input_filename": log.input_filename,
                    "input_size_bytes": log.input_size_bytes,
                    "input_format": log.input_format,
                    "output_preview": log.output_preview,
                    "preprocessing_steps": log.preprocessing_steps,
                    "preprocessing_ms": log.preprocessing_ms,
                    "inference_ms": log.inference_ms,
                    "status_code": log.status_code,
                    "total_latency_ms": log.total_latency_ms,
                    "created_at": log.created_at.isoformat(),
                    "ip_address": log.ip_address,
                    "step_timings": log.step_timings,
                    "save_dir": log.save_dir,
                }
                for log in logs
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
        }
    )
