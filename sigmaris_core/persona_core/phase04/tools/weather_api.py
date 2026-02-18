from __future__ import annotations

import re
from typing import Any, Dict, Optional


def _extract_city(text: str) -> Optional[str]:
    t = (text or "").strip()
    if not t:
        return None

    m = re.search(r"([^\s]{2,16})(?:の|で)?(?:天気|気温|予報)", t)
    if m:
        city = str(m.group(1) or "").strip()
        return city or None

    # Fallback: common JP city words (best-effort).
    for cand in ("東京", "大阪", "名古屋", "札幌", "福岡", "仙台", "横浜", "京都", "神戸", "広島"):
        if cand in t:
            return cand
    return None


def get_weather(city: str) -> Dict[str, Any]:
    """
    Stub weather API (API-style).
    External API integration is intentionally not implemented here.
    """
    loc = str(city or "").strip() or "UNKNOWN"
    return {
        "location": loc,
        "temperature": 0.0,
        "condition": "unknown",
        "humidity": 0,
        "wind": 0.0,
    }


def weather_api_flow(user_text: str) -> Dict[str, Any]:
    city = _extract_city(user_text or "") or "UNKNOWN"
    return get_weather(city)

