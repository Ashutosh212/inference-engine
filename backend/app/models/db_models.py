import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class APIKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    key_hash: Mapped[str] = mapped_column(String(256), index=True, nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    rate_limit: Mapped[int] = mapped_column(Integer, default=60)
    total_requests: Mapped[int] = mapped_column(Integer, default=0)

    logs: Mapped[list["RequestLog"]] = relationship("RequestLog", back_populates="api_key")


class RequestLog(Base):
    __tablename__ = "request_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    api_key_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("api_keys.id"), nullable=True)
    endpoint: Mapped[str] = mapped_column(String(256), nullable=False)
    method: Mapped[str] = mapped_column(String(16), nullable=False)
    input_filename: Mapped[str | None] = mapped_column(String(256), nullable=True)
    input_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    input_format: Mapped[str | None] = mapped_column(String(32), nullable=True)
    output_preview: Mapped[str | None] = mapped_column(Text, nullable=True)
    preprocessing_steps: Mapped[str | None] = mapped_column(Text, nullable=True)
    preprocessing_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    inference_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    total_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    step_timings: Mapped[str | None] = mapped_column(Text, nullable=True)
    save_dir: Mapped[str | None] = mapped_column(String(512), nullable=True)

    api_key: Mapped["APIKey | None"] = relationship("APIKey", back_populates="logs")


class InferenceJob(Base):
    __tablename__ = "inference_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    celery_task_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    api_key_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("api_keys.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="queued")
    input_filename: Mapped[str | None] = mapped_column(String(256), nullable=True)
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
