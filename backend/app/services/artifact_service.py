"""
Saves per-request artifacts to disk:
  /sfs/v1/predict/{request_id}/
    original.{ext}
    tiles/tile_{idx:04d}_x{x}_y{y}.png
    predictions.json
    metadata.json
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from app.config import settings
from app.preprocessing.base import PreprocessingContext


def request_dir(request_id: str) -> Path:
    return Path(settings.UPLOAD_DIR) / request_id


def save_artifacts(
    request_id: str,
    file_bytes: bytes,
    original_filename: str,
    ctx: PreprocessingContext,
    predictions: dict,
    preprocessing_info: dict,
    inference_ms: float,
    total_ms: float,
) -> str:
    """
    Writes all artifacts to disk synchronously (called from async endpoint via run_in_executor
    or directly — it's fast I/O so inline is fine for moderate image sizes).
    Returns the save_dir path as a string.
    """
    req_dir = request_dir(request_id)
    tiles_dir = req_dir / "tiles"
    tiles_dir.mkdir(parents=True, exist_ok=True)

    # 1. Original uploaded image
    ext = Path(original_filename).suffix or ".png"
    original_path = req_dir / f"original{ext}"
    original_path.write_bytes(file_bytes)

    # 2. Tiles
    tile_paths: list[str] = []
    for idx, (tile, (ox, oy)) in enumerate(zip(ctx.tiles, ctx.tile_offsets)):
        tile_filename = f"tile_{idx:04d}_x{ox}_y{oy}.png"
        tile_path = tiles_dir / tile_filename
        tile.save(tile_path, format="PNG")
        tile_paths.append(str(tile_path))

    # 3. predictions.json
    pred_payload = {
        "request_id": request_id,
        "original_filename": original_filename,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **predictions,
    }
    (req_dir / "predictions.json").write_text(json.dumps(pred_payload, indent=2))

    # 4. metadata.json
    meta_payload = {
        "request_id": request_id,
        "original_filename": original_filename,
        "original_size_bytes": len(file_bytes),
        "image_size": ctx.metadata.get("image_size"),
        "num_tiles": ctx.metadata.get("num_tiles"),
        "patch_size": ctx.metadata.get("patch_size"),
        "overlap": ctx.metadata.get("overlap"),
        "stride": ctx.metadata.get("stride"),
        "tile_offsets": ctx.tile_offsets,
        "tile_paths": [os.path.relpath(p, settings.UPLOAD_DIR) for p in tile_paths],
        "preprocessing": preprocessing_info,
        "inference_ms": inference_ms,
        "total_ms": total_ms,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    (req_dir / "metadata.json").write_text(json.dumps(meta_payload, indent=2))

    return str(req_dir)
