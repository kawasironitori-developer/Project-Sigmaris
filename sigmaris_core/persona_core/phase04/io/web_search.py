from __future__ import annotations

import json
import os
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


class WebSearchError(RuntimeError):
    pass


@dataclass
class WebSearchResult:
    title: str
    snippet: str
    url: str
    domain: str
    timestamp: Optional[str] = None
    source_type: str = "web_search"
    metadata: Dict[str, Any] = None  # type: ignore[assignment]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "snippet": self.snippet,
            "url": self.url,
            "domain": self.domain,
            "timestamp": self.timestamp,
            "source_type": self.source_type,
            "metadata": self.metadata or {},
        }


class WebSearchProvider:
    def search(
        self,
        *,
        query: str,
        max_results: int = 5,
        recency_days: Optional[int] = None,
        safe_search: str = "active",
        domains: Optional[List[str]] = None,
    ) -> List[WebSearchResult]:
        raise NotImplementedError


class SerperWebSearchProvider(WebSearchProvider):
    """
    Optional provider using Serper (https://serper.dev/).
    Requires:
      SERPER_API_KEY
    """

    def __init__(self, *, api_key: str, timeout_sec: int = 20) -> None:
        self._key = str(api_key)
        self._timeout = int(timeout_sec)

    def search(
        self,
        *,
        query: str,
        max_results: int = 5,
        recency_days: Optional[int] = None,
        safe_search: str = "active",
        domains: Optional[List[str]] = None,
    ) -> List[WebSearchResult]:
        q = str(query or "").strip()
        if not q:
            return []

        payload: Dict[str, Any] = {"q": q, "num": int(max(1, min(10, max_results)))}
        if domains:
            payload["gl"] = "us"
            payload["siteSearch"] = domains
        if recency_days is not None:
            payload["tbs"] = f"qdr:d{int(max(1, recency_days))}"
        if safe_search:
            payload["safe"] = str(safe_search)

        req = urllib.request.Request(
            url="https://google.serper.dev/search",
            method="POST",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "X-API-KEY": self._key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                raw = resp.read()
        except Exception as e:
            raise WebSearchError(f"serper request failed: {e}") from e

        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception as e:
            raise WebSearchError(f"serper invalid json: {e}") from e

        out: List[WebSearchResult] = []
        organic = data.get("organic") if isinstance(data, dict) else None
        if not isinstance(organic, list):
            return []

        for item in organic[: int(max(1, min(10, max_results)))]:
            if not isinstance(item, dict):
                continue
            url = str(item.get("link") or "")
            title = str(item.get("title") or "")
            snippet = str(item.get("snippet") or "")
            domain = ""
            try:
                domain = url.split("/")[2]
            except Exception:
                domain = ""
            out.append(WebSearchResult(title=title, snippet=snippet, url=url, domain=domain, metadata={}))
        return out


def get_web_search_provider() -> Optional[WebSearchProvider]:
    key = os.getenv("SERPER_API_KEY")
    if key and key.strip():
        return SerperWebSearchProvider(api_key=key.strip())
    return None

