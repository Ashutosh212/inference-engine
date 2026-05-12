from pydantic import BaseModel, Field
from typing import Any, Optional
from datetime import datetime


class APIResponse(BaseModel):
    data: Any = None
    error: Optional[dict] = None


class APIKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    rate_limit: int = Field(default=60, ge=1, le=10000)
    is_admin: bool = False


class APIKeyUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    rate_limit: Optional[int] = Field(None, ge=1, le=10000)
    is_active: Optional[bool] = None


class APIKeyResponse(BaseModel):
    id: str
    key_prefix: str
    name: str
    created_at: datetime
    last_used_at: Optional[datetime]
    is_active: bool
    is_admin: bool
    rate_limit: int
    total_requests: int

    class Config:
        from_attributes = True


class APIKeyCreateResponse(APIKeyResponse):
    full_key: str


class PreprocessingInfo(BaseModel):
    steps_completed: list[str]
    step_timings: dict[str, float]
    step_outputs: dict[str, Any]
    total_preprocessing_ms: float
    errors: list[dict]


class PredictionResult(BaseModel):
    request_id: str
    status: str
    predictions: dict
    preprocessing: PreprocessingInfo
    inference_ms: float
    total_latency_ms: float
    created_at: str


class AsyncJobResponse(BaseModel):
    job_id: str
    status: str
    poll_url: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    predictions: Optional[dict] = None
    preprocessing: Optional[dict] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


class PipelineStepInfo(BaseModel):
    name: str
    description: str
    version: str
    order: int
    enabled: bool
    required: bool


class PipelineInfo(BaseModel):
    steps: list[PipelineStepInfo]
    config: dict


class PipelineUpdateRequest(BaseModel):
    config: dict


class RequestLogResponse(BaseModel):
    id: str
    api_key_id: Optional[str]
    endpoint: str
    method: str
    input_filename: Optional[str]
    input_size_bytes: Optional[int]
    input_format: Optional[str]
    output_preview: Optional[str]
    preprocessing_steps: Optional[str]
    preprocessing_ms: Optional[float]
    inference_ms: Optional[float]
    status_code: int
    total_latency_ms: Optional[int]
    created_at: datetime
    ip_address: Optional[str]
    step_timings: Optional[str]

    class Config:
        from_attributes = True


class StatsResponse(BaseModel):
    total_requests: int
    requests_today: int
    requests_this_week: int
    avg_latency_ms: float
    avg_preprocessing_ms: float
    avg_inference_ms: float
    p95_latency_ms: float
    error_rate: float
    requests_per_hour: list[dict]
    top_api_keys: list[dict]
    model_info: dict
    pipeline_info: list[dict]
    avg_step_timings: dict
