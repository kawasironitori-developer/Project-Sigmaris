from __future__ import annotations

import os
import re
import time
import urllib.parse
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from persona_core.phase04.io.web_fetch import RawFetchResult, WebFetchError, fetch_url_raw
from persona_core.phase04.io.web_search import WebSearchError, WebSearchResult, get_web_search_provider
from persona_core.phase04.io.web_summarize import WebSummarizeError, summarize_text


class WebRagError(RuntimeError):
    pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _env(name: str) -> Optional[str]:
    v = os.getenv(name)
    if v is None:
        return None
    v = v.strip()
    return v or None


def _bool_env(name: str, default: bool = False) -> bool:
    v = _env(name)
    if v is None:
        return bool(default)
    return v.lower() in ("1", "true", "yes", "on")


def _int_env(name: str, default: int) -> int:
    try:
        v = int((_env(name) or str(default)).strip())
    except Exception:
        v = int(default)
    if v < 0:
        v = int(default)
    return int(v)


def _split_csv(v: Optional[str]) -> List[str]:
    if not v:
        return []
    out: List[str] = []
    for part in str(v).split(","):
        p = part.strip().lower()
        if p:
            out.append(p)
    return out


def _host_matches_domains(host: str, domains: List[str]) -> bool:
    h = (host or "").strip().lower()
    if not h:
        return False
    for d in domains:
        dd = (d or "").strip().lower()
        if not dd:
            continue
        if h == dd:
            return True
        if h.endswith("." + dd):
            return True
    return False


_TRACKING_PARAMS_PREFIXES = ("utm_",)
_TRACKING_PARAMS_EXACT = {"fbclid", "gclid", "yclid", "mc_cid", "mc_eid", "ref", "ref_src", "ref_url"}


def _canonicalize_url(url: str) -> str:
    u = str(url or "").strip()
    if not u:
        return ""
    try:
        p = urllib.parse.urlparse(u)
    except Exception:
        return u
    if p.scheme not in ("http", "https"):
        return ""
    if not p.netloc:
        return ""

    # strip fragment
    p = p._replace(fragment="")

    # strip tracking query params
    try:
        q = urllib.parse.parse_qsl(p.query, keep_blank_values=False)
        q2 = []
        for k, v in q:
            kk = (k or "").lower()
            if not kk:
                continue
            if kk in _TRACKING_PARAMS_EXACT:
                continue
            if any(kk.startswith(pref) for pref in _TRACKING_PARAMS_PREFIXES):
                continue
            q2.append((k, v))
        p = p._replace(query=urllib.parse.urlencode(q2))
    except Exception:
        pass

    try:
        return urllib.parse.urlunparse(p)
    except Exception:
        return u


def _join_url(base_url: str, href: str) -> str:
    try:
        return urllib.parse.urljoin(base_url, href)
    except Exception:
        return ""


def _extract_links(html_bytes: bytes, *, base_url: str, limit: int = 120) -> List[str]:
    out: List[str] = []
    if not html_bytes:
        return out

    # Prefer selectolax if installed (fast + accurate)
    try:
        from selectolax.parser import HTMLParser  # type: ignore

        tree = HTMLParser(html_bytes)
        for node in tree.css("a"):
            href = node.attributes.get("href") if hasattr(node, "attributes") else None
            if not href:
                continue
            u = _join_url(base_url, str(href))
            u = _canonicalize_url(u)
            if u:
                out.append(u)
            if len(out) >= int(limit):
                break
        return out
    except Exception:
        pass

    # Fallback: regex href extraction
    try:
        s = html_bytes.decode("utf-8", errors="ignore")
    except Exception:
        return out

    for m in re.finditer(r'(?is)href\\s*=\\s*["\\\']([^"\\\']+)["\\\']', s):
        href = (m.group(1) or "").strip()
        if not href:
            continue
        if href.startswith("#") or href.lower().startswith("javascript:"):
            continue
        u = _join_url(base_url, href)
        u = _canonicalize_url(u)
        if u:
            out.append(u)
        if len(out) >= int(limit):
            break
    return out


def _extract_urls(text: str, *, limit: int = 5) -> List[str]:
    t = str(text or "")
    re_url = re.compile(r"https?://[^\\s<>\"')\\]]+", re.IGNORECASE)
    matches = re_url.findall(t) or []
    uniq: List[str] = []
    for m in matches:
        u = _canonicalize_url(m)
        if not u:
            continue
        if u not in uniq:
            uniq.append(u)
        if len(uniq) >= int(limit):
            break
    return uniq


def _strip_urls(text: str) -> str:
    t = str(text or "")
    return re.sub(r"https?://[^\\s<>\"')\\]]+", " ", t, flags=re.IGNORECASE).strip()


def _extract_text_high_quality(fr: RawFetchResult) -> Tuple[str, Dict[str, Any]]:
    """
    Higher-quality HTML -> text extraction.
    Prefers trafilatura/readability when available; falls back to server's minimal extractor.
    """
    html_bytes = fr.html_bytes or b""
    if not html_bytes:
        return ("", {"extractor": "empty"})

    # 1) trafilatura (best general-purpose)
    try:
        import trafilatura  # type: ignore

        s = trafilatura.extract(
            html_bytes,
            output_format="txt",
            include_links=False,
            include_tables=False,
            include_images=False,
            favor_precision=True,
        )
        if isinstance(s, str) and s.strip():
            return (s.strip(), {"extractor": "trafilatura"})
    except Exception:
        pass

    # 2) readability-lxml (fast boilerplate removal)
    try:
        from readability import Document  # type: ignore

        try:
            html_str = html_bytes.decode("utf-8", errors="replace")
        except Exception:
            html_str = str(html_bytes)

        doc = Document(html_str)
        content_html = doc.summary(html_partial=True)
        # Use the existing minimal extraction on the reduced HTML
        from persona_core.phase04.io.web_fetch import _html_to_text  # local import of a private helper

        text, meta = _html_to_text(content_html.encode("utf-8", errors="ignore"), content_type=fr.content_type)
        if text.strip():
            meta = dict(meta or {})
            meta["extractor"] = "readability-lxml+strip"
            return (text.strip(), meta)
    except Exception:
        pass

    # 3) fallback: minimal extraction from web_fetch module (via _html_to_text)
    try:
        from persona_core.phase04.io.web_fetch import _html_to_text  # type: ignore

        text, meta = _html_to_text(html_bytes, content_type=fr.content_type)
        meta = dict(meta or {})
        meta["extractor"] = "minimal_strip"
        return (text.strip(), meta)
    except Exception:
        return ("", {"extractor": "failed"})


def _tokenize_ja_safe(s: str) -> List[str]:
    """
    Lightweight tokenizer for BM25.
    - For Japanese, whitespace tokenization is weak; we approximate with char 2-grams (bounded).
    - For non-Japanese/whitespace languages, keep word tokens.
    """
    txt = (s or "").strip()
    if not txt:
        return []

    # If it contains many CJK chars, use 2-grams
    cjk = sum(1 for ch in txt if ("\u3040" <= ch <= "\u30ff") or ("\u4e00" <= ch <= "\u9fff"))
    if cjk >= 6:
        base = re.sub(r"\\s+", "", txt)
        base = base[:1600]
        grams = [base[i : i + 2] for i in range(0, max(0, len(base) - 1))]
        return grams[:2200]

    # Else: words
    words = re.findall(r"[A-Za-z0-9_\\-\\.]+", txt.lower())
    return words[:2200]


def _bm25_rank(query: str, docs: List[str]) -> List[float]:
    try:
        from rank_bm25 import BM25Okapi  # type: ignore

        corpus = [_tokenize_ja_safe(d) for d in docs]
        bm25 = BM25Okapi(corpus)
        q = _tokenize_ja_safe(query)
        scores = bm25.get_scores(q)
        return [float(x) for x in scores]
    except Exception:
        # fallback: crude overlap score
        qset = set(_tokenize_ja_safe(query))
        out = []
        for d in docs:
            dset = set(_tokenize_ja_safe(d))
            if not qset or not dset:
                out.append(0.0)
                continue
            out.append(float(len(qset.intersection(dset)) / float(max(1, len(qset)))))
        return out


def _dedupe_sources(sources: List["WebRagSource"]) -> List["WebRagSource"]:
    # 1) URL canonicalization exact dedupe
    seen: Set[str] = set()
    out: List[WebRagSource] = []
    for s in sources:
        key = _canonicalize_url(s.final_url or s.url) or _canonicalize_url(s.url)
        if not key:
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(s)

    # 2) fuzzy title dedupe if rapidfuzz available
    try:
        from rapidfuzz.fuzz import ratio  # type: ignore

        final: List[WebRagSource] = []
        for s in out:
            t = (s.title or "").strip()
            if not t:
                final.append(s)
                continue
            dup = False
            for x in final:
                tt = (x.title or "").strip()
                if not tt:
                    continue
                if ratio(t, tt) >= 92:
                    dup = True
                    break
            if not dup:
                final.append(s)
        return final
    except Exception:
        return out


@dataclass
class WebRagSource:
    url: str
    final_url: str
    title: str
    snippet: str
    depth: int
    fetched_at: str
    summary: Optional[str] = None
    key_points: Optional[List[str]] = None
    entities: Optional[List[str]] = None
    confidence: Optional[float] = None
    score: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "url": self.url,
            "final_url": self.final_url,
            "title": self.title,
            "snippet": self.snippet,
            "depth": int(self.depth),
            "fetched_at": self.fetched_at,
            "summary": self.summary,
            "key_points": self.key_points if isinstance(self.key_points, list) else None,
            "entities": self.entities if isinstance(self.entities, list) else None,
            "confidence": float(self.confidence) if isinstance(self.confidence, (int, float)) else None,
            "score": float(self.score),
        }


@dataclass
class WebRagOutput:
    context_text: str
    sources: List[WebRagSource]
    meta: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "context_text": self.context_text,
            "sources": [s.to_dict() for s in self.sources],
            "meta": self.meta,
        }


def build_web_rag(
    *,
    query: str,
    seed_urls: Optional[List[str]] = None,
    max_search_results: int = 8,
    recency_days: Optional[int] = None,
    safe_search: str = "active",
    domains: Optional[List[str]] = None,
    max_pages: int = 20,
    max_depth: int = 1,
    top_k: int = 6,
    per_host_limit: int = 8,
    summarize: bool = True,
    timeout_sec: int = 20,
    max_bytes: int = 1_500_000,
) -> WebRagOutput:
    """
    High-quality Web RAG (MVP++) using:
    - Serper web search provider (existing in sigmaris-core)
    - allowlist/denylist policy gates
    - bounded BFS crawl by following links (optional, max_depth)
    - high-quality extraction (trafilatura/readability) when installed
    - BM25 ranking + dedupe
    - optional per-page summarization via OpenAI (paraphrase, no long quotes)
    """
    q = (query or "").strip()
    seeds = [s for s in (seed_urls or []) if isinstance(s, str) and s.strip()]
    if not seeds:
        # Accept URLs embedded in query for URL-seed mode.
        seeds = _extract_urls(q, limit=5)
    q_rank = _strip_urls(q)

    if not q_rank and not seeds:
        raise WebRagError("empty query")

    provider = None
    if not seeds:
        provider = get_web_search_provider()
        if provider is None:
            raise WebRagError("web search provider not configured")

    allow_domains = _split_csv(_env("SIGMARIS_WEB_RAG_ALLOW_DOMAINS"))
    deny_domains = _split_csv(_env("SIGMARIS_WEB_RAG_DENY_DOMAINS"))

    # Use web_fetch allowlist as the final guard; here we add additional gating.
    max_pages = int(max(0, max_pages))
    max_depth = int(max(0, max_depth))
    top_k = int(max(0, top_k))
    per_host_limit = int(max(1, per_host_limit))

    started = time.time()
    results: List[WebSearchResult] = []
    queue: List[Tuple[str, int, str]] = []
    if seeds:
        for u0 in seeds:
            u = _canonicalize_url(u0)
            if not u:
                continue
            queue.append((u, 0, ""))
    else:
        try:
            results = provider.search(
                query=q_rank or q,
                max_results=int(max_search_results),
                recency_days=recency_days,
                safe_search=safe_search,
                domains=domains,
            )
        except WebSearchError as e:
            raise WebRagError(str(e)) from e
        for r in results:
            u = _canonicalize_url(r.url)
            if not u:
                continue
            queue.append((u, 0, (r.snippet or "")[:220]))

    visited: Set[str] = set()
    fetched: List[WebRagSource] = []
    host_count: Dict[str, int] = {}

    def _allowed(u: str, *, seed_host: Optional[str] = None) -> bool:
        try:
            p = urllib.parse.urlparse(u)
        except Exception:
            return False
        host = (p.hostname or "").lower()
        if not host:
            return False
        if deny_domains and _host_matches_domains(host, deny_domains):
            return False
        if allow_domains and (not _host_matches_domains(host, allow_domains)):
            return False
        if seed_host and not _bool_env("SIGMARIS_WEB_RAG_CRAWL_CROSS_DOMAIN", default=False):
            if host != seed_host:
                return False
        if host_count.get(host, 0) >= int(per_host_limit):
            return False
        return True

    while queue and len(fetched) < int(max_pages):
        u, depth, seed_snippet = queue.pop(0)
        cu = _canonicalize_url(u)
        if not cu or cu in visited:
            continue
        visited.add(cu)
        try:
            p = urllib.parse.urlparse(cu)
            seed_host = (p.hostname or "").lower()
        except Exception:
            seed_host = None

        if not _allowed(cu, seed_host=seed_host):
            continue

        try:
            fr = fetch_url_raw(url=cu, timeout_sec=timeout_sec, max_bytes=max_bytes)
        except WebFetchError:
            continue
        except Exception:
            continue

        final_u = _canonicalize_url(fr.final_url or fr.url) or cu
        try:
            host = (urllib.parse.urlparse(final_u).hostname or "").lower()
        except Exception:
            host = ""
        if host:
            host_count[host] = int(host_count.get(host, 0) + 1)

        text, extract_meta = _extract_text_high_quality(fr)
        text = (text or "").strip()
        if not text:
            continue
        excerpt = text[:6000]

        summary_obj = None
        if summarize and _bool_env("SIGMARIS_WEB_RAG_SUMMARIZE", default=True):
            try:
                summary_obj = summarize_text(url=final_u, title=fr.title or "", text=excerpt)
            except WebSummarizeError:
                summary_obj = None
            except Exception:
                summary_obj = None

        src = WebRagSource(
            url=fr.url,
            final_url=str(fr.final_url or fr.url),
            title=(fr.title or "").strip()[:240],
            snippet=str(seed_snippet or "").strip()[:240],
            depth=int(depth),
            fetched_at=_now_iso(),
            summary=(summary_obj or {}).get("summary") if isinstance(summary_obj, dict) else None,
            key_points=(summary_obj or {}).get("key_points") if isinstance(summary_obj, dict) else None,
            entities=(summary_obj or {}).get("entities") if isinstance(summary_obj, dict) else None,
            confidence=(summary_obj or {}).get("confidence") if isinstance(summary_obj, dict) else None,
        )
        fetched.append(src)

        # Crawl expansion
        if depth < int(max_depth):
            links = _extract_links(fr.html_bytes, base_url=final_u, limit=_int_env("SIGMARIS_WEB_RAG_LINKS_PER_PAGE", 120))
            for link in links:
                cl = _canonicalize_url(link)
                if not cl or cl in visited:
                    continue
                if not _allowed(cl, seed_host=seed_host):
                    continue
                queue.append((cl, int(depth) + 1, ""))  # snippet unknown for crawled links

    deduped = _dedupe_sources(fetched)

    # Rank
    docs = []
    for s in deduped:
        blob = "\n".join(
            [
                (s.title or ""),
                (s.snippet or ""),
                (s.summary or ""),
                (" ".join(s.key_points or []) if isinstance(s.key_points, list) else ""),
            ]
        )
        docs.append(blob.strip())
    scores = _bm25_rank(q_rank or q, docs)
    for i, s in enumerate(deduped):
        s.score = float(scores[i] if i < len(scores) else 0.0)

    ranked = sorted(deduped, key=lambda s: float(s.score), reverse=True)
    picked = ranked[: int(top_k or 0)] if top_k > 0 else ranked

    # Build injection context: short, citation-first, no long quotes.
    ts = _now_iso()
    lines: List[str] = []
    lines.append("External Web Context (retrieved, paraphrase-only).")
    lines.append(f"- query: {q_rank or q}")
    lines.append(f"- retrieved_at_utc: {ts}")
    lines.append("")
    lines.append("Usage rules:")
    lines.append("- Use this as supporting evidence only; do not quote long passages.")
    lines.append("- If you use a claim from a source, reference its source_id in your reply.")
    lines.append("- Prefer Japanese sources when available; mention recency if relevant.")
    lines.append("")
    lines.append("Sources:")
    for idx, s in enumerate(picked, start=1):
        title = s.title or "(no title)"
        summ = (s.summary or "").strip()
        if not summ:
            summ = (s.snippet or "").strip()
        summ = summ[:800]
        lines.append(f"[{idx}] {title}")
        lines.append(f"- source_id: {idx}")
        if summ:
            lines.append(f"- summary: {summ}")
        if isinstance(s.key_points, list) and s.key_points:
            kp = [str(x).strip() for x in s.key_points if isinstance(x, str) and x.strip()]
            if kp:
                lines.append(f"- key_points: {', '.join(kp[:6])}")
        lines.append("")

    meta = {
        "retrieved_at_utc": ts,
        "elapsed_ms": int((time.time() - started) * 1000),
        "searched": int(len(results)),
        "fetched": int(len(fetched)),
        "deduped": int(len(deduped)),
        "picked": int(len(picked)),
        "max_pages": int(max_pages),
        "max_depth": int(max_depth),
        "provider": "serper",
        "seed_urls": [str(u) for u in seeds[:5]] if seeds else [],
        "policy": {
            "allow_domains": allow_domains,
            "deny_domains": deny_domains,
            "crawl_cross_domain": _bool_env("SIGMARIS_WEB_RAG_CRAWL_CROSS_DOMAIN", default=False),
        },
    }

    return WebRagOutput(context_text="\n".join(lines).strip(), sources=picked, meta=meta)
