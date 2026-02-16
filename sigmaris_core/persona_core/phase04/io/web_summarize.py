from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

from openai import OpenAI


class WebSummarizeError(RuntimeError):
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


def summarize_text(
    *,
    url: str,
    title: str,
    text: str,
    max_tokens: int = 700,
) -> Dict[str, Any]:
    """
    Summarize fetched page text (paraphrase).
    NOTE: This must avoid long quotes (copyright). We instruct the model accordingly.
    """
    if not _bool_env("SIGMARIS_WEB_FETCH_SUMMARIZE"):
        raise WebSummarizeError("summarization disabled")

    api_key = _env("OPENAI_API_KEY")
    if not api_key:
        raise WebSummarizeError("OPENAI_API_KEY missing")

    model = _env("SIGMARIS_WEB_FETCH_SUMMARY_MODEL") or "gpt-5-mini"
    client = OpenAI(api_key=api_key, timeout=float(os.getenv("SIGMARIS_WEB_FETCH_SUMMARY_TIMEOUT_SEC", "60") or "60"))

    # Trim input to a bounded size to control cost
    src = (text or "").strip()
    if len(src) > 24000:
        src = src[:24000]

    system = (
        "You are a careful news/article summarizer.\n"
        "Return STRICT JSON only (no markdown).\n"
        "Do NOT reproduce long verbatim passages. Avoid quoting; if absolutely necessary, keep any quote under 25 words.\n"
        "Focus on paraphrase and factual structure.\n"
        "Schema:\n"
        "{\n"
        '  \"summary\": string,\n'
        '  \"key_points\": string[],\n'
        '  \"entities\": string[],\n'
        '  \"confidence\": number\n'
        "}\n"
        "Rules:\n"
        "- summary <= 600 chars (Japanese OK).\n"
        "- key_points up to 6.\n"
        "- entities up to 12.\n"
        "- confidence is 0..1.\n"
    )
    user = f"URL: {url}\nTITLE: {title}\n\nTEXT:\n{src}"

    try:
        resp = client.chat.completions.create(
            model=model,
            temperature=0.2,
            max_completion_tokens=int(max_tokens),
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        content = (resp.choices[0].message.content or "").strip()
    except Exception as e:
        raise WebSummarizeError(f"summarize_request_failed:{type(e).__name__}") from e

    try:
        obj = json.loads(content)
    except Exception:
        return {
            "summary": "",
            "key_points": [],
            "entities": [],
            "confidence": 0.0,
            "note": "invalid_json_from_model",
        }

    if not isinstance(obj, dict):
        return {"summary": "", "key_points": [], "entities": [], "confidence": 0.0, "note": "non_object_json"}

    summary = obj.get("summary") if isinstance(obj.get("summary"), str) else ""
    key_points_raw = obj.get("key_points")
    entities_raw = obj.get("entities")
    conf = obj.get("confidence")

    key_points: List[str] = []
    if isinstance(key_points_raw, list):
        for x in key_points_raw[:6]:
            if isinstance(x, str) and x.strip():
                key_points.append(x.strip())

    entities: List[str] = []
    if isinstance(entities_raw, list):
        for x in entities_raw[:12]:
            if isinstance(x, str) and x.strip():
                entities.append(x.strip())

    try:
        confidence = float(conf)
    except Exception:
        confidence = 0.0
    if confidence < 0.0:
        confidence = 0.0
    if confidence > 1.0:
        confidence = 1.0

    return {"summary": summary[:1200], "key_points": key_points, "entities": entities, "confidence": confidence}
