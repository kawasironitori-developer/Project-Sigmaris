from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
import urllib.error
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


class GitHubSearchError(RuntimeError):
    pass


def _env(name: str) -> Optional[str]:
    v = os.getenv(name)
    if not v:
        return None
    v = v.strip()
    return v or None


@dataclass
class RepoResult:
    name: str
    owner: str
    description: str
    stars: int
    language: Optional[str]
    last_updated: Optional[str]
    repository_url: str
    source_type: str = "github_search"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "owner": self.owner,
            "description": self.description,
            "stars": int(self.stars),
            "language": self.language,
            "last_updated": self.last_updated,
            "repository_url": self.repository_url,
            "source_type": self.source_type,
        }


@dataclass
class CodeResult:
    file_path: str
    repository: str
    language: Optional[str]
    snippet: str
    repository_url: str
    source_type: str = "github_search"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "file_path": self.file_path,
            "repository": self.repository,
            "language": self.language,
            "snippet": self.snippet,
            "repository_url": self.repository_url,
            "source_type": self.source_type,
        }


class GitHubSearchProvider:
    def __init__(self, *, token: Optional[str] = None, timeout_sec: int = 20) -> None:
        self._token = token
        self._timeout = int(timeout_sec)

    def _headers(self) -> Dict[str, str]:
        h = {"Accept": "application/vnd.github+json", "User-Agent": "sigmaris-core"}
        if self._token:
            h["Authorization"] = f"Bearer {self._token}"
        return h

    def _get(self, url: str) -> Any:
        req = urllib.request.Request(url=url, method="GET", headers=self._headers())
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as e:
            raw = e.read()
            raise GitHubSearchError(f"GitHub HTTP {getattr(e,'code',0)}: {raw[:300]!r}")
        except Exception as e:
            raise GitHubSearchError(f"GitHub request failed: {e}") from e
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception as e:
            raise GitHubSearchError(f"GitHub invalid json: {e}") from e

    def search_repositories(self, *, query: str, max_results: int = 5) -> List[RepoResult]:
        q = str(query or "").strip()
        if not q:
            return []
        url = "https://api.github.com/search/repositories?" + urllib.parse.urlencode(
            {"q": q, "per_page": str(int(max(1, min(10, max_results))))}
        )
        data = self._get(url)
        items = data.get("items") if isinstance(data, dict) else None
        if not isinstance(items, list):
            return []
        out: List[RepoResult] = []
        for it in items[: int(max(1, min(10, max_results)))]:
            if not isinstance(it, dict):
                continue
            owner = it.get("owner") if isinstance(it.get("owner"), dict) else {}
            out.append(
                RepoResult(
                    name=str(it.get("name") or ""),
                    owner=str((owner or {}).get("login") or ""),
                    description=str(it.get("description") or ""),
                    stars=int(it.get("stargazers_count") or 0),
                    language=(str(it.get("language")) if it.get("language") is not None else None),
                    last_updated=(str(it.get("updated_at")) if it.get("updated_at") is not None else None),
                    repository_url=str(it.get("html_url") or ""),
                )
            )
        return out

    def search_code(self, *, query: str, max_results: int = 5) -> List[CodeResult]:
        q = str(query or "").strip()
        if not q:
            return []
        url = "https://api.github.com/search/code?" + urllib.parse.urlencode(
            {"q": q, "per_page": str(int(max(1, min(10, max_results))))}
        )
        data = self._get(url)
        items = data.get("items") if isinstance(data, dict) else None
        if not isinstance(items, list):
            return []
        out: List[CodeResult] = []
        for it in items[: int(max(1, min(10, max_results)))]:
            if not isinstance(it, dict):
                continue
            repo = it.get("repository") if isinstance(it.get("repository"), dict) else {}
            out.append(
                CodeResult(
                    file_path=str(it.get("path") or ""),
                    repository=str((repo or {}).get("full_name") or ""),
                    language=None,
                    snippet=str(it.get("text_matches") or "")[:240],
                    repository_url=str((repo or {}).get("html_url") or ""),
                )
            )
        return out


def get_github_provider() -> GitHubSearchProvider:
    token = _env("GITHUB_TOKEN") or _env("GH_TOKEN")
    return GitHubSearchProvider(token=token)

