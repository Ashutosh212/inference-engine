import io
from PIL import Image
from app.preprocessing.base import PreprocessingStep, PreprocessingContext, PreprocessingError


class DecodeStep(PreprocessingStep):
    name = "decode"
    description = "Decode raw bytes into a PIL Image object"
    version = "1.0.0"
    order = 2
    enabled = True
    required = True

    async def process(self, ctx: PreprocessingContext, params: dict) -> PreprocessingContext:
        try:
            image = Image.open(io.BytesIO(ctx.raw_bytes))
            image.load()
        except Exception as e:
            raise PreprocessingError(f"Failed to decode image: {e}")

        ctx.image = image
        ctx.metadata["original_width"] = image.width
        ctx.metadata["original_height"] = image.height
        ctx.metadata["original_mode"] = image.mode

        channels = len(image.getbands())
        ctx.step_outputs["decode"] = {
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "channels": channels,
        }

        return ctx
