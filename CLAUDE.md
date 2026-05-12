# InferenceEngine — Project Context

## Main Goal

Build a **human-in-the-loop satellite image inference platform** for object detection.

The platform allows analysts to:
1. Upload large satellite images (3000×3000px+, from UP42/Pléiades)
2. Run object detection inference (YOLOv8 OBB — oriented bounding boxes)
3. Visualize detection results overlaid on the image
4. Manually correct, add, or remove bounding boxes (human-in-the-loop)
5. Export corrected annotations for downstream use / retraining

## Domain

- **Imagery source:** UP42 / Pléiades satellite imagery
- **Task:** Object detection with oriented bounding boxes (OBB)
- **Model:** YOLOv8 OBB (`yolov8s-obb.pt`, `yolo26n.pt`)
- **Input images:** ~3000×3000px, high-resolution satellite tiles

## Core Inference Flow

```
Upload (3k×3k image)
  → Validate & Decode
  → Patch into N×M tiles (e.g. 640×640 with overlap)
  → Run YOLOv8 OBB inference on each patch
  → Stitch predictions back to original image coordinates
  → NMS across patch boundaries (suppress duplicate detections)
  → Return predictions + image for visualization
  → Human reviews & corrects detections in UI
```

## Architecture — Where Things Live

### Backend swap points (the 3 places to customize)

1. **`backend/app/services/model_service.py`**
   — `ModelService.predict()` is where the real model call goes.
   — Currently: dummy model returning fake cat/dog/bird predictions.
   — Replace with: `ultralytics YOLO(model_path).predict(tensor)`

2. **`backend/app/preprocessing/steps/`**
   — Each file is one preprocessing step, independently swappable.
   — Current steps: validate → decode → resize → color_convert → normalize → patch → augment → tensorize
   — For satellite OBB inference: the `patch` step (s06) needs to be replaced with
     a tile-based patcher that preserves original coordinates (offset_x, offset_y per patch).
   — Add a `stitch` post-processing step after inference.

3. **`backend/app/preprocessing/config.py`**
   — Controls patch size, stride/overlap, normalization method, etc.
   — Change parameters here without touching step code.

### Key files for model integration

| File | Purpose |
|------|---------|
| `backend/app/services/model_service.py` | Swap point: real model goes here |
| `backend/app/preprocessing/steps/s06_patch.py` | Tiling logic — produces patches + offset coords |
| `backend/app/preprocessing/config.py` | Patch size, stride, overlap settings |
| `backend/app/routers/inference.py` | `/v1/predict` endpoint — orchestrates pipeline → model |

## Current State (as of 2026-05-11)

- [x] Full backend skeleton (FastAPI, SQLAlchemy, API keys, logging)
- [x] 8-step preprocessing pipeline with auto-discovery
- [x] Real YOLOv8 OBB model integration (model_service.py)
- [x] Full frontend (Playground, Dashboard, Pipeline, Logs, API Keys, Docs)
- [x] Bounding box visualization overlay on image (`DetectionCanvas.tsx`)
- [x] Hover-to-reveal labels + per-detection delete button
- [ ] Satellite-aware tile patching (with coordinate offsets)
- [ ] Prediction stitching (NMS across tile boundaries)
- [ ] Human-in-the-loop annotation correction UI (draw new boxes, move boxes, export)

## Model Files

- `/home/jovyan/yolov8s-obb.pt` — YOLOv8 small OBB model
- `/home/jovyan/yolo26n.pt` — custom YOLOv8 nano OBB model (likely fine-tuned)
- Training data in `/sfs/data_train_up42/`, test data in `/sfs/data_test_up42/`

## DetectionCanvas — Implementation Reference

File: `frontend/src/components/DetectionCanvas.tsx`

### What it does
Renders YOLOv8 OBB predictions as rotated bounding boxes on a canvas, with:
- Confidence threshold slider (real-time, no re-inference)
- Hover-to-reveal: boxes are 50% opacity with no labels by default; hovering a box brings it to full opacity and shows `class_id · confidence%`
- Delete button: red × at the top-right corner of the hovered box's AABB; clicking removes that detection for the current result only
- Legend below the image: `[class_id chip] class_name ×count`, built from live prediction data

### Key functions — where to make changes

| Function | What it controls |
|----------|-----------------|
| `classColor(classId)` | Color per class — edit `PALETTE` array to change colors |
| `drawBox(ctx, p, sx, sy, alpha, showLabel)` | Visual style of one box — stroke width, fill opacity, label font |
| `drawScene(canvas, img, ...)` | Two-pass renderer: pass 1 = non-hovered boxes at 0.5 alpha; pass 2 = hovered box at 1.0 with label. Add a third pass here for e.g. selected/confirmed state |
| `hitTest(mx, my, p, sx, sy)` | Point-in-rotated-rect — extend for selection lasso, multi-select, etc. |
| `boxCorners(cx, cy, w, h, angle)` | Returns 4 rotated corner coords — used for label placement and AABB calculation |

### Component state

| State | Purpose |
|-------|---------|
| `hovered: HoverInfo \| null` | Which box index is hovered + CSS px position for the × button |
| `deletedIndices: Set<number>` | Indices into `predictions` that are removed; resets on new inference |
| `threshold` | Confidence cutoff; does NOT restore deleted boxes when changed |
| `isOverButtonRef` | Ref (not state) — prevents `onMouseMove` from clearing hover when cursor is on the × button |

### Mouse event design
Events are on the **container `<div>`**, not the `<canvas>`. DOM children (the × button) don't break the stream — the container still fires `onMouseMove` even when the cursor is over the button.

### Adding new interactive features
- **Multi-select**: extend `hitTest`, add `selectedIndices: Set<number>`, add a third pass in `drawScene` for selected boxes
- **Draw new boxes**: add a drawing mode; track `mousedown/mousemove/mouseup` on container, push to a `userBoxes` local array, render in a separate pass
- **Confirmed boxes**: add `confirmedIndices: Set<number>`, render with green stroke in an extra pass
- **Export corrections**: `deletedIndices` + `confirmedIndices` + `userBoxes` together = full human annotation correction; serialize to JSON

## Notes

- Images from UP42 are large (3k×3k+), never resize the full image — always tile
- OBB predictions have 5 coords: (x_center, y_center, width, height, angle in radians)
- After stitching, apply NMS to suppress duplicates at tile boundaries
- The human-in-the-loop UI needs to work on the full-resolution coordinate space
- Backend must be started with `./start.sh` (not bare uvicorn) — sets thread env vars and `--loop asyncio` to avoid PyTorch segfault
- Pipeline config `enabled: false` is respected at runtime in `pipeline.py`; without this, resize shrinks images to 224×224 and breaks coordinate space
