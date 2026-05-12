import numpy as np
from app.preprocessing.base import PreprocessingStep, PreprocessingContext, PreprocessingError


class NormalizeStep(PreprocessingStep):
    name = "normalize"
    description = "Normalize pixel values using imagenet stats, minmax, or standard scaling"
    version = "1.0.0"
    order = 5
    enabled = True
    required = False

    async def process(self, ctx: PreprocessingContext, params: dict) -> PreprocessingContext:
        if ctx.image is None:
            raise PreprocessingError("No image to normalize — decode step must run first")

        method = params.get("method", "imagenet")
        arr = np.array(ctx.image, dtype=np.float32)

        if method == "imagenet":
            mean = np.array(params.get("mean", [0.485, 0.456, 0.406]), dtype=np.float32)
            std = np.array(params.get("std", [0.229, 0.224, 0.225]), dtype=np.float32)
            arr = arr / 255.0
            if arr.ndim == 3 and arr.shape[2] == 3:
                arr = (arr - mean) / std
            elif arr.ndim == 2:
                arr = (arr - mean[0]) / std[0]
        elif method == "minmax":
            arr = arr / 255.0
        elif method == "standard":
            mean_val = arr.mean()
            std_val = arr.std()
            if std_val > 0:
                arr = (arr - mean_val) / std_val
        elif method == "none":
            pass

        ctx.image_array = arr
        pixel_min = float(arr.min())
        pixel_max = float(arr.max())

        ctx.step_outputs["normalize"] = {
            "method": method,
            "shape": list(arr.shape),
            "dtype": str(arr.dtype),
            "pixel_range": [round(pixel_min, 4), round(pixel_max, 4)],
        }

        return ctx
