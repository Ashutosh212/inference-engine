import pytest
import io
import asyncio
import numpy as np
from PIL import Image

from app.preprocessing.base import PreprocessingContext
from app.preprocessing.steps.s01_validate import ValidateStep
from app.preprocessing.steps.s02_decode import DecodeStep
from app.preprocessing.steps.s03_resize import ResizeStep
from app.preprocessing.steps.s04_color_convert import ColorConvertStep
from app.preprocessing.steps.s05_normalize import NormalizeStep
from app.preprocessing.steps.s06_patch import PatchStep
from app.preprocessing.steps.s08_tensorize import TensorizeStep


def make_jpeg_bytes(width=100, height=100) -> bytes:
    img = Image.new("RGB", (width, height), color=(128, 64, 32))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_validate_step_valid():
    step = ValidateStep()
    ctx = PreprocessingContext(raw_bytes=make_jpeg_bytes())
    ctx = await step.process(ctx, {"max_file_size_mb": 20, "allowed_formats": ["jpeg", "png"]})
    assert ctx.step_outputs["validate"]["valid"] is True
    assert ctx.step_outputs["validate"]["format"] == "jpeg"


@pytest.mark.asyncio
async def test_decode_step():
    step = DecodeStep()
    ctx = PreprocessingContext(raw_bytes=make_jpeg_bytes(50, 50))
    validate = ValidateStep()
    ctx = await validate.process(ctx, {"max_file_size_mb": 20, "allowed_formats": ["jpeg"]})
    ctx = await step.process(ctx, {})
    assert ctx.image is not None
    assert ctx.step_outputs["decode"]["width"] == 50
    assert ctx.step_outputs["decode"]["height"] == 50


@pytest.mark.asyncio
async def test_resize_step():
    validate = ValidateStep()
    decode = DecodeStep()
    resize = ResizeStep()
    ctx = PreprocessingContext(raw_bytes=make_jpeg_bytes(200, 100))
    ctx = await validate.process(ctx, {"max_file_size_mb": 20, "allowed_formats": ["jpeg"]})
    ctx = await decode.process(ctx, {})
    ctx = await resize.process(ctx, {"target_width": 224, "target_height": 224, "method": "bilinear", "keep_aspect_ratio": True})
    assert ctx.image.size == (224, 224)


@pytest.mark.asyncio
async def test_normalize_step():
    validate = ValidateStep()
    decode = DecodeStep()
    normalize = NormalizeStep()
    ctx = PreprocessingContext(raw_bytes=make_jpeg_bytes(32, 32))
    ctx = await validate.process(ctx, {"max_file_size_mb": 20, "allowed_formats": ["jpeg"]})
    ctx = await decode.process(ctx, {})
    ctx = await normalize.process(ctx, {"method": "minmax"})
    assert ctx.image_array is not None
    assert ctx.image_array.max() <= 1.0 + 1e-6


@pytest.mark.asyncio
async def test_patch_step():
    from PIL import Image as PILImage
    ctx = PreprocessingContext(raw_bytes=b"x")
    ctx.image = PILImage.new("RGB", (1280, 1280), (128, 128, 128))
    step = PatchStep()
    ctx = await step.process(ctx, {"patch_size": 640, "overlap": 128, "pad_incomplete": True})
    # 1280px with 640 patch, 128 overlap → stride=512 → tiles at x=0, x=512, x=640 → 3 columns = 9 tiles
    assert ctx.metadata["num_tiles"] > 0
    assert len(ctx.tiles) == ctx.metadata["num_tiles"]
    assert len(ctx.tile_offsets) == ctx.metadata["num_tiles"]
    assert all(t.size == (640, 640) for t in ctx.tiles)


@pytest.mark.asyncio
async def test_tensorize_from_patches():
    ctx = PreprocessingContext(raw_bytes=b"x")
    ctx.patches = [np.zeros(768, dtype=np.float32) for _ in range(196)]
    step = TensorizeStep()
    ctx = await step.process(ctx, {"dtype": "float32", "add_batch_dim": True, "channel_first": True})
    assert ctx.tensor is not None
    assert ctx.tensor.shape == (1, 196, 768)
