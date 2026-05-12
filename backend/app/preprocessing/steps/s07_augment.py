import numpy as np
from app.preprocessing.base import PreprocessingStep, PreprocessingContext


class AugmentStep(PreprocessingStep):
    name = "augment"
    description = "Optional augmentations (flip, rotate, brightness, contrast) — disabled by default for inference"
    version = "1.0.0"
    order = 7
    enabled = False
    required = False

    async def process(self, ctx: PreprocessingContext, params: dict) -> PreprocessingContext:
        applied = []
        skipped = []

        if ctx.image_array is None:
            ctx.step_outputs["augment"] = {"applied": [], "skipped": ["all"], "reason": "no image_array"}
            return ctx

        arr = ctx.image_array

        if params.get("horizontal_flip", False):
            arr = np.fliplr(arr)
            applied.append("horizontal_flip")
        else:
            skipped.append("horizontal_flip")

        if params.get("vertical_flip", False):
            arr = np.flipud(arr)
            applied.append("vertical_flip")
        else:
            skipped.append("vertical_flip")

        rotation = params.get("rotation_degrees", 0)
        if rotation != 0:
            from PIL import Image
            import io
            # Rotate via PIL for simplicity
            pil_img = ctx.image
            if pil_img is not None:
                pil_img = pil_img.rotate(rotation, expand=False)
                ctx.image = pil_img
                arr = np.array(pil_img, dtype=np.float32)
            applied.append(f"rotation_{rotation}deg")
        else:
            skipped.append("rotation")

        brightness_range = params.get("brightness_range", [1.0, 1.0])
        if brightness_range[0] != 1.0 or brightness_range[1] != 1.0:
            factor = np.random.uniform(brightness_range[0], brightness_range[1])
            arr = np.clip(arr * factor, arr.min(), arr.max())
            applied.append(f"brightness_{factor:.2f}")
        else:
            skipped.append("brightness")

        contrast_range = params.get("contrast_range", [1.0, 1.0])
        if contrast_range[0] != 1.0 or contrast_range[1] != 1.0:
            factor = np.random.uniform(contrast_range[0], contrast_range[1])
            mean = arr.mean()
            arr = np.clip((arr - mean) * factor + mean, arr.min(), arr.max())
            applied.append(f"contrast_{factor:.2f}")
        else:
            skipped.append("contrast")

        ctx.image_array = arr
        ctx.step_outputs["augment"] = {"applied": applied, "skipped": skipped}

        return ctx
