from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class PreprocessingContext:
    raw_bytes: bytes
    filename: str = ""
    content_type: str = ""
    image: Any = None
    image_array: Any = None
    patches: list = field(default_factory=list)
    tensor: Any = None
    metadata: dict = field(default_factory=dict)
    steps_completed: list = field(default_factory=list)
    step_timings: dict = field(default_factory=dict)
    step_outputs: dict = field(default_factory=dict)
    errors: list = field(default_factory=list)
    # Satellite tiling: PIL Image tiles + their (x1, y1) offsets in the original image
    tiles: list = field(default_factory=list)
    tile_offsets: list = field(default_factory=list)  # list of (offset_x, offset_y) tuples


class PreprocessingError(Exception):
    pass


class PreprocessingStep(ABC):
    name: str = "base_step"
    description: str = ""
    version: str = "1.0.0"
    order: int = 0
    enabled: bool = True
    required: bool = False

    @abstractmethod
    async def process(self, ctx: PreprocessingContext, params: dict) -> PreprocessingContext:
        pass

    def validate_config(self, params: dict) -> bool:
        return True

    def get_info(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "order": self.order,
            "enabled": self.enabled,
            "required": self.required,
        }
