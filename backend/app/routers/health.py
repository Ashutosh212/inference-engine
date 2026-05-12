import time
from fastapi import APIRouter
from app.services.model_service import model_service
from app.preprocessing.registry import StepRegistry

router = APIRouter()
START_TIME = time.time()


@router.get("/health")
async def health():
    steps = StepRegistry.discover_steps()
    enabled_steps = [s for s in steps if s.enabled]
    model_info = model_service.get_model_info()
    return {
        "data": {
            "status": "healthy",
            "model_loaded": model_info["status"] == "loaded",
            "pipeline_steps": len(enabled_steps),
            "uptime_seconds": int(time.time() - START_TIME),
        },
        "error": None,
    }
