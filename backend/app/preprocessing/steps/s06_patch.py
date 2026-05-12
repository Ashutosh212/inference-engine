import numpy as np
from PIL import Image
from app.preprocessing.base import PreprocessingStep, PreprocessingContext, PreprocessingError


class PatchStep(PreprocessingStep):
    name = "patch"
    description = "Tile large satellite image into overlapping 640×640 patches, preserving pixel offsets for stitching"
    version = "2.1.0"
    order = 6
    enabled = True
    required = False

    async def process(self, ctx: PreprocessingContext, params: dict) -> PreprocessingContext:
        if ctx.image is None:
            raise PreprocessingError("No image to tile — decode step must run first")

        patch_size = params.get("patch_size", 640)
        overlap = params.get("overlap", 128)
        stride = patch_size - overlap

        # Convert to numpy once — avoids PIL C-allocator conflicts with PyTorch
        arr = np.array(ctx.image)
        H, W = arr.shape[:2]

        tiles: list[Image.Image] = []
        offsets: list[tuple[int, int]] = []
        seen: set[tuple[int, int]] = set()

        ys = _grid_positions(H, patch_size, stride)
        xs = _grid_positions(W, patch_size, stride)

        for y in ys:
            for x in xs:
                if (x, y) in seen:
                    continue
                seen.add((x, y))
                patch = arr[y:y + patch_size, x:x + patch_size]
                # Pad if edge tile is smaller than patch_size
                ph, pw = patch.shape[:2]
                if ph < patch_size or pw < patch_size:
                    pad = np.zeros((patch_size, patch_size, arr.shape[2] if arr.ndim == 3 else 1),
                                   dtype=arr.dtype)
                    if arr.ndim == 2:
                        pad = np.zeros((patch_size, patch_size), dtype=arr.dtype)
                    pad[:ph, :pw] = patch
                    patch = pad
                tiles.append(Image.fromarray(patch))
                offsets.append((x, y))

        ctx.tiles = tiles
        ctx.tile_offsets = offsets
        ctx.metadata["num_tiles"] = len(tiles)
        ctx.metadata["image_size"] = [W, H]
        ctx.metadata["patch_size"] = patch_size
        ctx.metadata["overlap"] = overlap
        ctx.metadata["stride"] = stride

        ctx.step_outputs["patch"] = {
            "num_tiles": len(tiles),
            "patch_size": patch_size,
            "overlap": overlap,
            "stride": stride,
            "image_size": [W, H],
        }

        return ctx


def _grid_positions(length: int, patch_size: int, stride: int) -> list[int]:
    """Return start positions covering [0, length) with given stride, always including the last patch."""
    if length <= patch_size:
        return [0]
    positions = list(range(0, length - patch_size, stride))
    last = length - patch_size
    if not positions or positions[-1] != last:
        positions.append(last)
    return positions
