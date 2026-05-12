import io
from typing import Optional


MAGIC_BYTES: dict[str, list[bytes]] = {
    "jpeg": [b"\xff\xd8\xff"],
    "png": [b"\x89PNG"],
    "webp": [b"RIFF"],
    "bmp": [b"BM"],
    "tiff": [b"II*\x00", b"MM\x00*"],
    "gif": [b"GIF87a", b"GIF89a"],
}


def detect_format(data: bytes) -> Optional[str]:
    for fmt, signatures in MAGIC_BYTES.items():
        for sig in signatures:
            if data[: len(sig)] == sig:
                if fmt == "webp" and len(data) >= 12:
                    if data[8:12] == b"WEBP":
                        return "webp"
                    continue
                return fmt
    return None


def bytes_to_mb(size_bytes: int) -> float:
    return size_bytes / (1024 * 1024)
