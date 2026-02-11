from __future__ import annotations

import html
import ipaddress
import os
import re
import socket
import urllib.parse
import urllib.request
import urllib.error
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


class WebFetchError(RuntimeError):
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


def _split_csv(v: Optional[str]) -> List[str]:
    if not v:
        return []
    out: List[str] = []
    for part in v.split(","):
        p = part.strip().lower()
        if p:
            out.append(p)
    return out


def _is_private_host(host: str) -> bool:
    """
    SSRF guard: reject loopback/private/link-local/reserved IPs for both literals and DNS-resolved targets.
    """
    h = (host or "").strip()
    if not h:
        return True

    # IP literal
    try:
        ip = ipaddress.ip_address(h)
        return bool(
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        )
    except Exception:
        pass

    # Obvious local names
    if h in ("localhost",) or h.endswith(".localhost") or h.endswith(".local"):
        return True

    # DNS resolution check
    try:
        infos = socket.getaddrinfo(h, None)
    except Exception:
        # If it doesn't resolve, treat as unsafe (prevents weird schemes)
        return True

    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_reserved
                or ip.is_multicast
                or ip.is_unspecified
            ):
                return True
        except Exception:
            return True

    return False


def _host_allowed(host: str) -> bool:
    """
    Domain allowlist:
      - SIGMARIS_WEB_FETCH_ALLOW_DOMAINS: comma-separated domains (e.g., "nhk.or.jp, nikkei.com")
      - SIGMARIS_WEB_FETCH_ALLOW_ALL=1 for development only
    """
    if _bool_env("SIGMARIS_WEB_FETCH_ALLOW_ALL"):
        return True

    allow = _split_csv(_env("SIGMARIS_WEB_FETCH_ALLOW_DOMAINS"))
    if not allow:
        return False

    h = (host or "").strip().lower()
    if not h:
        return False

    for d in allow:
        if h == d:
            return True
        if h.endswith("." + d):
            return True
    return False


def _normalize_url(url: str) -> str:
    u = str(url or "").strip()
    if not u:
        raise WebFetchError("empty url")

    parsed = urllib.parse.urlparse(u)
    if parsed.scheme not in ("http", "https"):
        raise WebFetchError("only http/https supported")
    if not parsed.netloc:
        raise WebFetchError("missing host")

    # Remove fragments to stabilize caching
    parsed = parsed._replace(fragment="")
    return urllib.parse.urlunparse(parsed)


def _html_to_text(html_bytes: bytes, *, content_type: str) -> Tuple[str, Dict[str, Any]]:
    """
    Minimal HTML -> text extraction without extra deps.
    This is best-effort and intentionally conservative.
    """
    # Decode
    try:
        s = html_bytes.decode("utf-8")
        dec = {"encoding": "utf-8", "errors": "strict"}
    except Exception:
        s = html_bytes.decode("utf-8", errors="replace")
        dec = {"encoding": "utf-8", "errors": "replace"}

    # Remove scripts/styles/noscript
    s2 = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\\1>", " ", s)
    # Drop HTML comments
    s2 = re.sub(r"(?is)<!--.*?-->", " ", s2)
    # Prefer <article> if present (very rough)
    m = re.search(r"(?is)<article[^>]*>(.*?)</article>", s2)
    if m:
        s2 = m.group(1)

    # Strip tags
    s2 = re.sub(r"(?is)<[^>]+>", " ", s2)
    s2 = html.unescape(s2)
    s2 = re.sub(r"[\\u00A0\\t\\r]+", " ", s2)
    s2 = re.sub(r"\\n+", "\n", s2)
    s2 = re.sub(r" *\\n *", "\n", s2)
    s2 = re.sub(r" {2,}", " ", s2).strip()

    meta = {
        "content_type": content_type,
        **dec,
        "extraction": "article_tag_prefer_then_strip",
    }
    return s2, meta


@dataclass
class FetchResult:
    url: str
    final_url: str
    title: str
    text: str
    meta: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "url": self.url,
            "final_url": self.final_url,
            "title": self.title,
            "text": self.text,
            "meta": self.meta,
        }


def _extract_title(html_bytes: bytes) -> str:
    try:
        s = html_bytes.decode("utf-8", errors="ignore")
    except Exception:
        return ""
    m = re.search(r"(?is)<title[^>]*>(.*?)</title>", s)
    if not m:
        return ""
    t = re.sub(r"\\s+", " ", html.unescape(m.group(1))).strip()
    return t[:200]


def fetch_url(
    *,
    url: str,
    timeout_sec: int = 20,
    max_bytes: int = 1_500_000,
    user_agent: str = "sigmaris-core-web-fetch/1.0",
) -> FetchResult:
    normalized = _normalize_url(url)
    parsed = urllib.parse.urlparse(normalized)
    host = parsed.hostname or ""

    if _is_private_host(host):
        raise WebFetchError("forbidden host (private/loopback)")
    if not _host_allowed(host):
        raise WebFetchError("domain not allowlisted")

    req = urllib.request.Request(
        url=normalized,
        method="GET",
        headers={
            "User-Agent": user_agent,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=int(timeout_sec)) as resp:
            final_url = str(getattr(resp, "geturl", lambda: normalized)())
            ctype = str(resp.headers.get("Content-Type") or "")
            raw = resp.read(int(max_bytes) + 1)
    except urllib.error.HTTPError as e:
        raise WebFetchError(f"http_error:{getattr(e,'code',0)}") from e
    except Exception as e:
        raise WebFetchError(f"request_failed:{type(e).__name__}") from e

    if len(raw) > int(max_bytes):
        raise WebFetchError("response too large")

    title = _extract_title(raw)
    text, extract_meta = _html_to_text(raw, content_type=ctype)

    # Basic cleanup: keep only reasonably-sized content
    text = re.sub(r"\\n{3,}", "\n\n", text).strip()

    meta: Dict[str, Any] = {
        "content_type": ctype,
        "bytes": int(len(raw)),
        "host": host,
        "allowlist": _split_csv(_env("SIGMARIS_WEB_FETCH_ALLOW_DOMAINS")),
        "robots_checked": False,
        **extract_meta,
    }

    return FetchResult(url=normalized, final_url=final_url, title=title, text=text, meta=meta)

