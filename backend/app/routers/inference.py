import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, File, UploadFile, Form, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.db_models import APIKey, InferenceJob
from app.models.schemas import APIResponse
from app.services.auth_service import validate_api_key
from app.services.model_service import model_service
from app.services.artifact_service import save_artifacts
from app.preprocessing.registry import StepRegistry
from app.preprocessing.pipeline import PreprocessingPipeline, PreprocessingError
from app.preprocessing.config import PIPELINE_CONFIG

router = APIRouter(prefix="/v1", tags=["Inference"])

_pipeline_config: dict = dict(PIPELINE_CONFIG)


async def get_current_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key"), db: AsyncSession = Depends(get_db)) -> APIKey:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-API-Key header required")
    api_key = await validate_api_key(db, x_api_key)
    if not api_key:
        raise HTTPException(status_code=401, detail="Invalid or inactive API key")
    return api_key


@router.post("/predict")
async def predict_sync(
    request: Request,
    file: UploadFile = File(...),
    parameters: Optional[str] = Form(None),
    api_key: APIKey = Depends(get_current_api_key),
    db: AsyncSession = Depends(get_db),
):
    start_total = time.perf_counter()
    request_id = str(uuid.uuid4())

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    param_overrides = {}
    if parameters:
        try:
            param_overrides = json.loads(parameters)
        except json.JSONDecodeError:
            raise HTTPException(status_code=422, detail="Invalid JSON in parameters field")

    merged_config = {**_pipeline_config, **param_overrides}

    steps = StepRegistry.discover_steps()
    pipeline = PreprocessingPipeline(steps, merged_config)

    start_preprocess = time.perf_counter()
    try:
        ctx = await pipeline.run(file_bytes, file.filename or "upload", file.content_type or "")
    except PreprocessingError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Preprocessing failed: {e}")
    preprocess_ms = (time.perf_counter() - start_preprocess) * 1000

    start_inference = time.perf_counter()
    predictions = await model_service.predict(ctx)
    inference_ms = (time.perf_counter() - start_inference) * 1000

    total_ms = (time.perf_counter() - start_total) * 1000

    preprocessing_info = {
        "steps_completed": ctx.steps_completed,
        "step_timings": ctx.step_timings,
        "step_outputs": ctx.step_outputs,
        "total_preprocessing_ms": round(preprocess_ms, 2),
        "errors": ctx.errors,
    }

    # Save artifacts to disk in a thread so we don't block the event loop
    loop = asyncio.get_running_loop()
    save_dir = await loop.run_in_executor(
        None,
        save_artifacts,
        request_id,
        file_bytes,
        file.filename or "upload",
        ctx,
        predictions,
        preprocessing_info,
        round(inference_ms, 2),
        round(total_ms, 2),
    )

    response_data = {
        "request_id": request_id,
        "status": "completed",
        "predictions": predictions,
        "preprocessing": preprocessing_info,
        "inference_ms": round(inference_ms, 2),
        "total_latency_ms": round(total_ms, 2),
        "save_dir": save_dir,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    request.state.log_data = {
        "api_key_id": api_key.id,
        "input_filename": file.filename,
        "input_size_bytes": len(file_bytes),
        "input_format": ctx.metadata.get("original_format"),
        "output_preview": json.dumps(response_data)[:200],
        "preprocessing_steps": json.dumps(ctx.steps_completed),
        "preprocessing_ms": round(preprocess_ms, 2),
        "inference_ms": round(inference_ms, 2),
        "total_latency_ms": int(total_ms),
        "step_timings": json.dumps(ctx.step_timings),
        "save_dir": save_dir,
    }

    return APIResponse(data=response_data)


@router.post("/predict/async")
async def predict_async(
    request: Request,
    file: UploadFile = File(...),
    parameters: Optional[str] = Form(None),
    api_key: APIKey = Depends(get_current_api_key),
    db: AsyncSession = Depends(get_db),
):
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    param_overrides = {}
    if parameters:
        try:
            param_overrides = json.loads(parameters)
        except json.JSONDecodeError:
            raise HTTPException(status_code=422, detail="Invalid JSON in parameters field")

    job_id = str(uuid.uuid4())
    job = InferenceJob(
        id=job_id,
        api_key_id=api_key.id,
        status="queued",
        input_filename=file.filename,
    )
    db.add(job)
    await db.flush()

    try:
        from app.services.queue_service import run_inference_task
        task = run_inference_task.delay(
            job_id,
            file_bytes.hex(),
            file.filename or "upload",
            file.content_type or "",
            param_overrides,
        )
        job.celery_task_id = task.id
        await db.flush()
    except Exception:
        pass

    return JSONResponse(
        status_code=202,
        content={
            "data": {
                "job_id": job_id,
                "status": "queued",
                "poll_url": f"/v1/jobs/{job_id}",
            },
            "error": None,
        },
    )


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str, api_key: APIKey = Depends(get_current_api_key), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InferenceJob).where(InferenceJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    result_data = None
    if job.result_json:
        result_data = json.loads(job.result_json)

    return APIResponse(
        data={
            "job_id": job.id,
            "status": job.status,
            "predictions": result_data.get("predictions") if result_data else None,
            "preprocessing": result_data.get("preprocessing") if result_data else None,
            "error": job.error_message,
            "created_at": job.created_at.isoformat(),
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        }
    )


@router.get("/pipeline")
async def get_pipeline(api_key: APIKey = Depends(get_current_api_key)):
    steps = StepRegistry.discover_steps()
    pipeline = PreprocessingPipeline(steps, _pipeline_config)
    return APIResponse(
        data={
            "steps": pipeline.get_pipeline_info(),
            "config": _pipeline_config,
        }
    )


@router.patch("/pipeline")
async def update_pipeline(body: dict, api_key: APIKey = Depends(get_current_api_key)):
    if not api_key.is_admin:
        raise HTTPException(status_code=403, detail="Admin key required")
    _pipeline_config.update(body)
    return APIResponse(data={"updated": True, "config": _pipeline_config})


@router.get("/models")
async def list_models(api_key: APIKey = Depends(get_current_api_key)):
    return APIResponse(data={"models": [model_service.get_model_info()]})
