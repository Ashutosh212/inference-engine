from PIL import Image
from app.preprocessing.base import PreprocessingStep, PreprocessingContext, PreprocessingError


RESAMPLE_METHODS = {
    "bilinear": Image.Resampling.BILINEAR,
    "bicubic": Image.Resampling.BICUBIC,
    "lanczos": Image.Resampling.LANCZOS,
    "nearest": Image.Resampling.NEAREST,
}


class ResizeStep(PreprocessingStep):
    name = "resize"
    description = "Resize image to target dimensions with optional aspect ratio preservation"
    version = "1.0.0"
    order = 3
    enabled = True
    required = False

    async def process(self, ctx: PreprocessingContext, params: dict) -> PreprocessingContext:
        if ctx.image is None:
            raise PreprocessingError("No image to resize — decode step must run first")

        target_w = params.get("target_width", 224)
        target_h = params.get("target_height", 224)
        method_name = params.get("method", "bilinear")
        keep_aspect = params.get("keep_aspect_ratio", True)
        pad_color = tuple(params.get("padding_color", [0, 0, 0]))

        resample = RESAMPLE_METHODS.get(method_name, Image.Resampling.BILINEAR)
        orig_w, orig_h = ctx.image.size
        padded = False

        if keep_aspect:
            ratio = min(target_w / orig_w, target_h / orig_h)
            new_w = int(orig_w * ratio)
            new_h = int(orig_h * ratio)
            resized = ctx.image.resize((new_w, new_h), resample)

            mode = resized.mode
            bg_color = pad_color if mode == "RGB" else (pad_color + (255,) if mode == "RGBA" else pad_color[0])
            canvas = Image.new(mode, (target_w, target_h), bg_color)
            offset_x = (target_w - new_w) // 2
            offset_y = (target_h - new_h) // 2
            canvas.paste(resized, (offset_x, offset_y))
            ctx.image = canvas
            padded = new_w != target_w or new_h != target_h
        else:
            ctx.image = ctx.image.resize((target_w, target_h), resample)

        ctx.step_outputs["resize"] = {
            "from": [orig_w, orig_h],
            "to": [target_w, target_h],
            "method": method_name,
            "padded": padded,
        }

        return ctx
