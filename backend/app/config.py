from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    APP_NAME: str = "InferenceEngine"
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/inference.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    ADMIN_KEY_NAME: str = "admin-default"
    DEFAULT_RATE_LIMIT: int = 60
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    LOG_LEVEL: str = "INFO"
    MODEL_DEVICE: str = "cpu"
    MAX_UPLOAD_SIZE_MB: int = 200
    UPLOAD_DIR: str = "./uploads"
    SECRET_KEY: str = "change-me-in-production-use-a-long-random-string"
    MODEL_PATH: str = "/home/jovyan/yolov8s-obb.pt"
    MODEL_CONF: float = 0.25
    MODEL_NMS_IOU: float = 0.5

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
