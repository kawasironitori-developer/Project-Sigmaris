from __future__ import annotations

import base64
import json
import os
from typing import Any, Dict, List, Optional

from openai import OpenAI


class OpenAIVisionError(RuntimeError):
    pass


def _env(name: str) -> Optional[str]:
    v = os.getenv(name)
    if v is None:
        return None
    v = v.strip()
    return v or None


def _bool_env(name: str) -> bool:
    v = (_env(name) or "").lower()
    return v in ("1", "true", "yes", "on")


def analyze_image_bytes(
    *,
    data: bytes,
    mime_type: str,
    file_name: str,
    max_tokens: int = 600,
) -> Dict[str, Any]:
    """
    OpenAI Vision (optional):
    Returns a JSON-like dict:
      - caption: str
      - detected_text: str
      - objects: list[str]
      - notes: list[str]
    Disabled unless SIGMARIS_IMAGE_VISION_ENABLED=1.
    """
    if not _bool_env("SIGMARIS_IMAGE_VISION_ENABLED"):
        raise OpenAIVisionError("vision disabled")

    api_key = _env("OPENAI_API_KEY")
    if not api_key:
        raise OpenAIVisionError("OPENAI_API_KEY missing")

    model = (
        _env("SIGMARIS_IMAGE_VISION_MODEL")
        or _env("SIGMARIS_VISION_MODEL")
        or _env("OPENAI_VISION_MODEL")
        or "gpt-5-mini"
    )

    b64 = base64.b64encode(data).decode("ascii")
    data_url = f"data:{mime_type or 'image/png'};base64,{b64}"

    client = OpenAI(api_key=api_key, timeout=float(os.getenv("SIGMARIS_IMAGE_VISION_TIMEOUT_SEC", "60") or "60"))

    system = (
        "You analyze an image and return STRICT JSON.\n"
        "Schema:\n"
        "{\n"
        '  "caption": string,\n'
        '  "detected_text": string,\n'
        '  "objects": string[],\n'
        '  "notes": string[]\n'
        "}\n"
        "Rules:\n"
        "- JSON only (no markdown).\n"
        "- caption is short (<= 200 chars).\n"
        "- detected_text contains readable text from the image (if any).\n"
        "- objects are simple nouns (max 10).\n"
    )
    user_text = f"file_name={file_name or ''}\nExtract caption, text, and objects."

    try:
        resp = client.chat.completions.create(
            model=model,
            temperature=0.2,
            max_completion_tokens=int(max_tokens),
            messages=[
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                },
            ],
        )
        content = (resp.choices[0].message.content or "").strip()
    except Exception as e:
        raise OpenAIVisionError(f"vision request failed: {type(e).__name__}") from e

    try:
        obj = json.loads(content)
    except Exception:
        # best-effort: wrap raw output
        return {"caption": "", "detected_text": "", "objects": [], "notes": ["invalid_json_from_model", content[:400]]}

    if not isinstance(obj, dict):
        return {"caption": "", "detected_text": "", "objects": [], "notes": ["non_object_json_from_model"]}

    caption = obj.get("caption") if isinstance(obj.get("caption"), str) else ""
    detected_text = obj.get("detected_text") if isinstance(obj.get("detected_text"), str) else ""
    objects_raw = obj.get("objects")
    objects: List[str] = []
    if isinstance(objects_raw, list):
        for x in objects_raw[:10]:
            if isinstance(x, str) and x.strip():
                objects.append(x.strip())

    notes_raw = obj.get("notes")
    notes: List[str] = []
    if isinstance(notes_raw, list):
        for x in notes_raw[:10]:
            if isinstance(x, str) and x.strip():
                notes.append(x.strip())

    return {"caption": caption[:400], "detected_text": detected_text[:4000], "objects": objects, "notes": notes}
