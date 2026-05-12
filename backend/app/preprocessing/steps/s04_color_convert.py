from PIL import Image
from app.preprocessing.base import PreprocessingStep, PreprocessingContext, PreprocessingError


class ColorConvertStep(PreprocessingStep):
    name = "color_convert"
    description = "Convert image to target color mode (RGB, grayscale, RGBA)"
    version = "1.0.0"
    order = 4
    enabled = True
    required = False

    async def process(self, ctx: PreprocessingContext, params: dict) -> PreprocessingContext:
        if ctx.image is None:
            raise PreprocessingError("No image to convert — decode step must run first")

        target_mode = params.get("target_mode", "RGB")
        original_mode = ctx.image.mode

        if original_mode == target_mode:
            ctx.step_outputs["color_convert"] = {"from": original_mode, "to": target_mode, "converted": False}
            return ctx

        img = ctx.image

        if target_mode == "RGB":
            if original_mode == "RGBA":
                background = Image.new("RGB", img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[3])
                img = background
            elif original_mode == "P":
                img = img.convert("RGBA")
                background = Image.new("RGB", img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[3])
                img = background
            elif original_mode == "CMYK":
                img = img.convert("RGB")
            elif original_mode == "L":
                img = img.convert("RGB")
            else:
                img = img.convert("RGB")
        elif target_mode == "L":
            img = img.convert("L")
        elif target_mode == "RGBA":
            img = img.convert("RGBA")
        else:
            img = img.convert(target_mode)

        ctx.image = img
        ctx.step_outputs["color_convert"] = {
            "from": original_mode,
            "to": target_mode,
            "converted": True,
        }

        return ctx
