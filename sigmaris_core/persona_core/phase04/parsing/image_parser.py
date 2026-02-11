from __future__ import annotations

import math
import os
from typing import Any, Dict, List


def _clamp01(v: float) -> float:
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return float(v)


def _safe_str(v: Any) -> str:
    try:
        return str(v)
    except Exception:
        return ""


def _dominant_colors(img, *, max_colors: int = 5) -> List[Dict[str, Any]]:
    # img expected in RGB
    try:
        small = img.copy()
        small.thumbnail((96, 96))
        pal = small.convert("P", palette=1, colors=32)
        palette = pal.getpalette() or []
        counts = pal.getcolors() or []
        counts.sort(key=lambda kv: int(kv[0]), reverse=True)
        out = []
        total = sum(int(c) for c, _ in counts) or 1
        for c, idx in counts[: max_colors]:
            i = int(idx) * 3
            r = int(palette[i]) if i + 2 < len(palette) else 0
            g = int(palette[i + 1]) if i + 2 < len(palette) else 0
            b = int(palette[i + 2]) if i + 2 < len(palette) else 0
            out.append({"rgb": [r, g, b], "ratio": float(int(c) / float(total))})
        return out
    except Exception:
        return []


def _edge_density(gray) -> float:
    # very lightweight gradient-based edge measure (no numpy)
    try:
        w, h = gray.size
        if w < 8 or h < 8:
            return 0.0
        small = gray.copy()
        small.thumbnail((128, 128))
        px = small.load()
        w, h = small.size
        acc = 0.0
        cnt = 0
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                gx = float(px[x + 1, y]) - float(px[x - 1, y])
                gy = float(px[x, y + 1]) - float(px[x, y - 1])
                g = math.sqrt(gx * gx + gy * gy)
                acc += g
                cnt += 1
        if cnt <= 0:
            return 0.0
        # normalize roughly
        return float(_clamp01((acc / float(cnt)) / 64.0))
    except Exception:
        return 0.0


def parse_image_bytes(*, data: bytes, file_name: str, mime_type: str) -> Dict[str, Any]:
    """
    Phase04 MVP image parsing:
    - Metadata via Pillow (if installed)
    - OCR / caption is intentionally optional and not performed by default
    - Structural features: dominant colors + edge density
    """
    try:
        from PIL import Image  # type: ignore
    except Exception as e:
        return {
            "file_type": "image",
            "metadata": {
                "format": None,
                "resolution": None,
                "file_size": int(len(data)),
                "color_space": None,
                "exif_data": None,
                "timestamp": None,
                "note": f"pillow_missing:{type(e).__name__}",
            },
            "ocr": {
                "detected_text": "",
                "confidence": 0.0,
                "language_detected": None,
                "bounding_regions": [],
                "note": "ocr_not_available",
            },
            "visual_features": {
                "dominant_colors": [],
                "edge_density": 0.0,
                "structural_complexity": 0.0,
                "detected_objects": [],
            },
            "excerpt_summary": "Image uploaded (parser unavailable).",
            "metadata_extra": {"file_name": file_name, "mime_type": mime_type},
        }

    import io

    with Image.open(io.BytesIO(data)) as img:
        fmt = _safe_str(getattr(img, "format", None) or "").upper() or None
        w, h = img.size
        mode = _safe_str(getattr(img, "mode", None))

        exif = None
        try:
            exif_obj = img.getexif()
            if exif_obj:
                exif = {str(k): _safe_str(v) for k, v in dict(exif_obj).items()}
        except Exception:
            exif = None

        rgb = img.convert("RGB")
        gray = img.convert("L")

        dom = _dominant_colors(rgb)
        ed = _edge_density(gray)
        complexity = float(_clamp01(0.35 * ed + 0.65 * (len(dom) / 5.0)))

        excerpt = "Image contains"
        if dom:
            excerpt += f" {len(dom)} dominant color clusters"
        excerpt += f" with edge_density≈{ed:.2f}."

        # Optional: OpenAI Vision-based caption/OCR (disabled by default)
        vision_caption = ""
        vision_text = ""
        vision_objects: List[str] = []
        vision_note = "ocr_not_enabled"
        try:
            enabled = (os.getenv("SIGMARIS_IMAGE_VISION_ENABLED", "").strip().lower() in ("1", "true", "yes", "on"))
        except Exception:
            enabled = False

        if enabled:
            try:
                from persona_core.phase04.parsing.openai_vision import analyze_image_bytes, OpenAIVisionError

                vr = analyze_image_bytes(data=data, mime_type=mime_type, file_name=file_name)
                vision_caption = str(vr.get("caption") or "").strip()
                vision_text = str(vr.get("detected_text") or "").strip()
                vision_objects = [str(x) for x in (vr.get("objects") or []) if str(x).strip()][:10]
                vision_note = "vision_ok"
                if vision_caption:
                    excerpt = vision_caption
            except OpenAIVisionError as e:
                vision_note = f"vision_failed:{_safe_str(e)}"
            except Exception as e:
                vision_note = f"vision_failed:{type(e).__name__}"

        return {
            "file_type": "image",
            "metadata": {
                "format": fmt,
                "resolution": {"width": int(w), "height": int(h)},
                "file_size": int(len(data)),
                "color_space": mode or None,
                "exif_data": exif,
                "timestamp": None,
            },
            "ocr": {
                "detected_text": vision_text,
                "confidence": (0.65 if vision_text else 0.0),
                "language_detected": None,
                "bounding_regions": [],
                "note": vision_note,
            },
            "visual_features": {
                "dominant_colors": dom,
                "edge_density": float(ed),
                "structural_complexity": complexity,
                "detected_objects": vision_objects,
            },
            "excerpt_summary": excerpt,
            "raw_excerpt": vision_text[:1600] if vision_text else excerpt,
            "metadata_extra": {"file_name": file_name, "mime_type": mime_type},
        }
