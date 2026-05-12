import math
import os
from typing import Any
from app.preprocessing.base import PreprocessingContext

MODEL_PATH = os.environ.get("MODEL_PATH", "/home/jovyan/yolov8s-obb.pt")
CONF_THRESHOLD = float(os.environ.get("MODEL_CONF", "0.25"))
NMS_IOU_THRESHOLD = float(os.environ.get("MODEL_NMS_IOU", "0.5"))


class ModelService:
    def __init__(self):
        self.model_path = MODEL_PATH
        self.model_name = os.path.basename(MODEL_PATH)
        self.model_version = "1.0.0"
        self._model: Any = None
        self._class_names: dict[int, str] = {}

    def _load(self):
        if self._model is not None:
            return
        try:
            from ultralytics import YOLO
            self._model = YOLO(self.model_path)
            self._class_names = self._model.names or {}
        except Exception as e:
            raise RuntimeError(f"Failed to load model from {self.model_path}: {e}")

    def _predict_tile(self, tile) -> list[dict]:
        results = self._model.predict(tile, conf=CONF_THRESHOLD, verbose=False)
        boxes: list[dict] = []
        r = results[0]
        if r.obb is None:
            return boxes
        for i in range(len(r.obb)):
            xywhr = r.obb.xywhr[i].tolist()   # [cx, cy, w, h, angle_rad]
            conf = float(r.obb.conf[i])
            cls_id = int(r.obb.cls[i])
            boxes.append({
                "cx": xywhr[0],
                "cy": xywhr[1],
                "width": xywhr[2],
                "height": xywhr[3],
                "angle": xywhr[4],
                "confidence": round(conf, 4),
                "class_id": cls_id,
                "class_name": self._class_names.get(cls_id, str(cls_id)),
            })
        return boxes

    async def predict(self, preprocessed: PreprocessingContext) -> dict:
        self._load()

        tiles = preprocessed.tiles
        offsets = preprocessed.tile_offsets

        if not tiles:
            if preprocessed.image is not None:
                tiles = [preprocessed.image]
                offsets = [(0, 0)]
            else:
                return self._empty_result(preprocessed)

        all_boxes: list[dict] = []
        for tile, (offset_x, offset_y) in zip(tiles, offsets):
            tile_boxes = self._predict_tile(tile)
            for box in tile_boxes:
                all_boxes.append({
                    **box,
                    "cx": round(box["cx"] + offset_x, 2),
                    "cy": round(box["cy"] + offset_y, 2),
                    "tile_offset": [offset_x, offset_y],
                })

        all_boxes = _nms_obb(all_boxes, iou_threshold=NMS_IOU_THRESHOLD)
        all_boxes.sort(key=lambda b: b["confidence"], reverse=True)

        return {
            "predictions": all_boxes,
            "num_detections": len(all_boxes),
            "num_tiles": len(tiles),
            "image_size": preprocessed.metadata.get("image_size", [None, None]),
            "model": self.model_name,
            "version": self.model_version,
            "conf_threshold": CONF_THRESHOLD,
        }

    def _empty_result(self, preprocessed: PreprocessingContext) -> dict:
        return {
            "predictions": [],
            "num_detections": 0,
            "num_tiles": 0,
            "image_size": preprocessed.metadata.get("image_size", [None, None]),
            "model": self.model_name,
            "version": self.model_version,
            "conf_threshold": CONF_THRESHOLD,
        }

    def get_model_info(self) -> dict:
        return {
            "name": self.model_name,
            "path": self.model_path,
            "version": self.model_version,
            "status": "loaded" if self._model is not None else "not_loaded",
            "input_type": "image",
            "task": "obb",
            "conf_threshold": CONF_THRESHOLD,
            "nms_iou_threshold": NMS_IOU_THRESHOLD,
        }


def _axis_aligned_box(box: dict) -> tuple[float, float, float, float]:
    """Approximate OBB as axis-aligned rect for NMS IoU computation."""
    cx, cy = box["cx"], box["cy"]
    w, h = box["width"], box["height"]
    angle = box["angle"]
    cos_a = abs(math.cos(angle))
    sin_a = abs(math.sin(angle))
    aw = w * cos_a + h * sin_a
    ah = w * sin_a + h * cos_a
    return cx - aw / 2, cy - ah / 2, cx + aw / 2, cy + ah / 2


def _iou(a: tuple, b: tuple) -> float:
    ix1 = max(a[0], b[0])
    iy1 = max(a[1], b[1])
    ix2 = min(a[2], b[2])
    iy2 = min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter == 0:
        return 0.0
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return inter / (area_a + area_b - inter)


def _nms_obb(boxes: list[dict], iou_threshold: float = 0.5) -> list[dict]:
    if not boxes:
        return boxes
    boxes = sorted(boxes, key=lambda b: b["confidence"], reverse=True)
    aabbs = [_axis_aligned_box(b) for b in boxes]
    keep: list[dict] = []
    suppressed = [False] * len(boxes)
    for i in range(len(boxes)):
        if suppressed[i]:
            continue
        keep.append(boxes[i])
        for j in range(i + 1, len(boxes)):
            if not suppressed[j] and _iou(aabbs[i], aabbs[j]) > iou_threshold:
                suppressed[j] = True
    return keep


model_service = ModelService()
