from app.preprocessing.base import PreprocessingStep, PreprocessingContext, PreprocessingError
from app.preprocessing.utils import detect_format, bytes_to_mb


class ValidateStep(PreprocessingStep):
    name = "validate"
    description = "Validate image format, size, and integrity"
    version = "1.0.0"
    order = 1
    enabled = True
    required = True

    async def process(self, ctx: PreprocessingContext, params: dict) -> PreprocessingContext:
        max_mb = params.get("max_file_size_mb", 20)
        allowed = [f.lower() for f in params.get("allowed_formats", ["jpeg", "jpg", "png", "webp", "bmp", "tiff"])]

        size_bytes = len(ctx.raw_bytes)
        size_mb = bytes_to_mb(size_bytes)

        if size_mb > max_mb:
            raise PreprocessingError(
                f"File size {size_mb:.1f}MB exceeds maximum {max_mb}MB"
            )

        detected = detect_format(ctx.raw_bytes)
        if detected is None:
            raise PreprocessingError("Could not detect image format from file signature")

        normalized_allowed = set(allowed)
        if "jpeg" in normalized_allowed:
            normalized_allowed.add("jpg")
        if "jpg" in normalized_allowed:
            normalized_allowed.add("jpeg")

        if detected not in normalized_allowed:
            raise PreprocessingError(
                f"Format '{detected}' not in allowed formats: {list(allowed)}"
            )

        ctx.metadata["original_format"] = detected
        ctx.metadata["file_size_bytes"] = size_bytes
        ctx.step_outputs["validate"] = {
            "format": detected,
            "size_bytes": size_bytes,
            "size_mb": round(size_mb, 3),
            "valid": True,
        }

        return ctx
