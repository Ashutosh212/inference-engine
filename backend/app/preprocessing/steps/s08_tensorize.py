import numpy as np
from app.preprocessing.base import PreprocessingStep, PreprocessingContext, PreprocessingError


DTYPE_MAP = {
    "float32": np.float32,
    "float64": np.float64,
    "int32": np.int32,
    "int64": np.int64,
    "uint8": np.uint8,
}


class TensorizeStep(PreprocessingStep):
    name = "tensorize"
    description = "Convert processed image or patches to model-ready tensor format"
    version = "1.0.0"
    order = 8
    enabled = True
    required = False

    async def process(self, ctx: PreprocessingContext, params: dict) -> PreprocessingContext:
        dtype_name = params.get("dtype", "float32")
        add_batch_dim = params.get("add_batch_dim", True)
        channel_first = params.get("channel_first", True)
        dtype = DTYPE_MAP.get(dtype_name, np.float32)

        source = "unknown"

        if ctx.patches:
            stack = np.stack(ctx.patches, axis=0).astype(dtype)
            if add_batch_dim:
                stack = stack[np.newaxis, ...]
            ctx.tensor = stack
            source = "patches"
            shape = list(stack.shape)
        elif ctx.image_array is not None:
            arr = ctx.image_array.astype(dtype)
            if arr.ndim == 2:
                arr = arr[:, :, np.newaxis]
            if channel_first and arr.ndim == 3:
                arr = np.transpose(arr, (2, 0, 1))
            if add_batch_dim:
                arr = arr[np.newaxis, ...]
            ctx.tensor = arr
            source = "image_array"
            shape = list(arr.shape)
        else:
            raise PreprocessingError("No patches or image_array available for tensorization")

        ctx.step_outputs["tensorize"] = {
            "shape": shape,
            "dtype": dtype_name,
            "from": source,
        }

        return ctx
