from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from persona_core.phase04.io.web_fetch import WebFetchError, fetch_url
from persona_core.phase04.io.web_search import WebSearchError, get_web_search_provider
from persona_core.phase04.io.web_summarize import WebSummarizeError, summarize_text


def _extract_items(user_text: str) -> Tuple[Optional[str], Optional[str]]:
    t = (user_text or "").strip()
    if not t:
        return (None, None)

    m = re.search(r"(.+?)\s*(?:と|vs|VS|対)\s*(.+?)(?:\s|$)", t)
    if m:
        a = str(m.group(1) or "").strip()
        b = str(m.group(2) or "").strip()
        a = re.sub(r"(比較|違い|どっち|どちら|選ぶなら)+", "", a).strip()
        b = re.sub(r"(比較|違い|どっち|どちら|選ぶなら)+", "", b).strip()
        return (a or None, b or None)

    return (None, None)


def _fetch_one(query: str) -> Dict[str, Any]:
    provider = get_web_search_provider()
    if provider is None:
        return {"query": query, "sources": [], "summary": None, "key_points": None, "entities": None, "confidence": None}

    try:
        results = provider.search(query=query, max_results=3, recency_days=None, safe_search="active", domains=None)
    except WebSearchError:
        results = []

    picked_url = None
    picked_title = None
    snippet = None
    for r in results[:3]:
        u = getattr(r, "url", None)
        if isinstance(u, str) and u.strip():
            picked_url = u.strip()
            picked_title = str(getattr(r, "title", "") or "").strip() or None
            snippet = str(getattr(r, "snippet", "") or "").strip() or None
            break

    sources: List[Dict[str, Any]] = []
    if picked_url:
        sources.append({"url": picked_url, "title": picked_title, "snippet": snippet})

    if not picked_url:
        return {"query": query, "sources": sources, "summary": None, "key_points": None, "entities": None, "confidence": None}

    try:
        fr = fetch_url(url=picked_url, timeout_sec=20, max_bytes=1_500_000, user_agent="sigmaris-core-web-fetch/1.0")
    except WebFetchError:
        return {"query": query, "sources": sources, "summary": None, "key_points": None, "entities": None, "confidence": None}
    except Exception:
        return {"query": query, "sources": sources, "summary": None, "key_points": None, "entities": None, "confidence": None}

    excerpt = (fr.text or "").strip()[:6000]
    summary_obj: Optional[Dict[str, Any]]
    try:
        summary_obj = summarize_text(url=fr.final_url or fr.url, title=fr.title or "", text=excerpt)
    except WebSummarizeError:
        summary_obj = None
    except Exception:
        summary_obj = None

    if isinstance(fr.final_url, str) and fr.final_url.strip():
        sources = [{"url": fr.final_url.strip(), "title": (fr.title or "").strip() or picked_title or None, "snippet": snippet}]

    return {
        "query": query,
        "sources": sources,
        "summary": (summary_obj or {}).get("summary") if isinstance(summary_obj, dict) else None,
        "key_points": (summary_obj or {}).get("key_points") if isinstance(summary_obj, dict) else None,
        "entities": (summary_obj or {}).get("entities") if isinstance(summary_obj, dict) else None,
        "confidence": (summary_obj or {}).get("confidence") if isinstance(summary_obj, dict) else None,
    }


def comparison_flow(user_text: str) -> Dict[str, Any]:
    a, b = _extract_items(user_text)
    if not a or not b:
        return {"item_a": None, "item_b": None, "differences": [], "sources": []}

    qa = f"{a} 仕様 価格 レビュー"
    qb = f"{b} 仕様 価格 レビュー"

    ra = _fetch_one(qa)
    rb = _fetch_one(qb)

    sources: List[Dict[str, Any]] = []
    for s in (ra.get("sources") or []):
        if isinstance(s, dict) and s.get("url"):
            sources.append(s)
    for s in (rb.get("sources") or []):
        if isinstance(s, dict) and s.get("url"):
            sources.append(s)

    diffs: List[str] = []
    sa = ra.get("summary") if isinstance(ra.get("summary"), str) else ""
    sb = rb.get("summary") if isinstance(rb.get("summary"), str) else ""
    if sa and sb:
        diffs.append("summary_available")

    return {
        "item_a": {"name": a, "result": ra},
        "item_b": {"name": b, "result": rb},
        "differences": diffs,
        "sources": sources[:6],
    }

