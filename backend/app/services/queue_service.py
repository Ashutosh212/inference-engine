import asyncio
import json
import uuid
from datetime import datetime, timezone
from celery import Celery
from app.config import settings

celery_app = Celery("inference_engine", broker=settings.REDIS_URL, backend=settings.REDIS_URL)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)


@celery_app.task(name="app.services.queue_service.run_inference_task")
def run_inference_task(job_id: str, file_bytes_hex: str, filename: str, content_type: str, params: dict):
    import asyncio
    from app.database import AsyncSessionLocal
    from app.models.db_models import InferenceJob
    from app.preprocessing.registry import StepRegistry
    from app.preprocessing.pipeline import PreprocessingPipeline
    from app.preprocessing.config import PIPELINE_CONFIG
    from app.services.model_service import model_service
    from sqlalchemy import select

    async def _run():
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(InferenceJob).where(InferenceJob.id == job_id))
            job = result.scalar_one_or_none()
            if not job:
                return

            job.status = "processing"
            await db.commit()

            try:
                file_bytes = bytes.fromhex(file_bytes_hex)
                steps = StepRegistry.discover_steps()
                config = {**PIPELINE_CONFIG, **params}
                pipeline = PreprocessingPipeline(steps, config)
                ctx = await pipeline.run(file_bytes, filename, content_type)
                predictions = await model_service.predict(ctx)

                result_data = {
                    "predictions": predictions,
                    "preprocessing": {
                        "steps_completed": ctx.steps_completed,
                        "step_timings": ctx.step_timings,
                        "step_outputs": ctx.step_outputs,
                        "total_preprocessing_ms": sum(ctx.step_timings.values()),
                        "errors": ctx.errors,
                    },
                }
                job.status = "completed"
                job.result_json = json.dumps(result_data)
                job.completed_at = datetime.now(timezone.utc)
            except Exception as e:
                job.status = "failed"
                job.error_message = str(e)
                job.completed_at = datetime.now(timezone.utc)

            await db.commit()

    asyncio.run(_run())
