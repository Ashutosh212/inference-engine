PIPELINE_CONFIG: dict = {
    "validate": {
        "enabled": True,
        "max_file_size_mb": 200,  # satellite images can be large
        "allowed_formats": ["jpeg", "jpg", "png", "webp", "bmp", "tiff"],
    },
    "decode": {
        "enabled": True,
    },
    # Resize is DISABLED — we never shrink a 3k satellite image before tiling
    "resize": {
        "enabled": False,
        "target_width": 640,
        "target_height": 640,
        "method": "bilinear",
        "keep_aspect_ratio": True,
        "padding_color": [0, 0, 0],
    },
    # Color conversion to RGB is still needed (some satellite images come as RGBA or palette)
    "color_convert": {
        "enabled": True,
        "target_mode": "RGB",
    },
    # Normalize is DISABLED — ultralytics YOLO handles its own normalization internally
    "normalize": {
        "enabled": False,
        "method": "imagenet",
        "mean": [0.485, 0.456, 0.406],
        "std": [0.229, 0.224, 0.225],
    },
    # Patch: satellite tile slicer — produces 640×640 tiles with 128px overlap
    "patch": {
        "enabled": True,
        "patch_size": 640,
        "overlap": 128,       # pixels of overlap between adjacent tiles
        "pad_incomplete": True,  # pad edge tiles to full patch_size with black
    },
    "augment": {
        "enabled": False,
        "horizontal_flip": False,
        "vertical_flip": False,
        "rotation_degrees": 0,
        "brightness_range": [1.0, 1.0],
        "contrast_range": [1.0, 1.0],
    },
    # Tensorize is DISABLED — ultralytics takes PIL Images directly
    "tensorize": {
        "enabled": False,
        "dtype": "float32",
        "add_batch_dim": True,
        "channel_first": True,
    },
}
