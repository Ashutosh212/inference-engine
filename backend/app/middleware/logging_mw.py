import json
import time
import uuid
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        request.state.log_data = {}

        response = await call_next(request)

        elapsed_ms = int((time.perf_counter() - start) * 1000)

        if request.url.path.startswith("/v1/predict") and request.method == "POST":
            log_data = getattr(request.state, "log_data", {})
            if log_data:
                from app.database import AsyncSessionLocal
                from app.models.db_models import RequestLog

                async with AsyncSessionLocal() as db:
                    log = RequestLog(
                        id=str(uuid.uuid4()),
                        api_key_id=log_data.get("api_key_id"),
                        endpoint=str(request.url.path),
                        method=request.method,
                        input_filename=log_data.get("input_filename"),
                        input_size_bytes=log_data.get("input_size_bytes"),
                        input_format=log_data.get("input_format"),
                        output_preview=log_data.get("output_preview"),
                        preprocessing_steps=log_data.get("preprocessing_steps"),
                        preprocessing_ms=log_data.get("preprocessing_ms"),
                        inference_ms=log_data.get("inference_ms"),
                        status_code=response.status_code,
                        total_latency_ms=log_data.get("total_latency_ms", elapsed_ms),
                        ip_address=request.client.host if request.client else None,
                        step_timings=log_data.get("step_timings"),
                        save_dir=log_data.get("save_dir"),
                    )
                    db.add(log)
                    await db.commit()

        return response
