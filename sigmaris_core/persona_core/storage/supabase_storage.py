from __future__ import annotations

import json
import urllib.parse
import urllib.request
import urllib.error
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple


class SupabaseStorageError(RuntimeError):
    pass


@dataclass(frozen=True)
class SupabaseStorageConfig:
    url: str
    service_role_key: str


class SupabaseStorageClient:
    """
    Minimal Supabase Storage client (urllib) for server-side use.

    Uses service role key (bypass RLS).
    """

    def __init__(self, cfg: SupabaseStorageConfig, *, timeout_sec: int = 30) -> None:
        self._cfg = cfg
        self._timeout = int(timeout_sec)

    def _base(self) -> str:
        return str(self._cfg.url).rstrip("/")

    def _headers(self, *, content_type: Optional[str] = None) -> Dict[str, str]:
        h = {
            "apikey": self._cfg.service_role_key,
            "Authorization": f"Bearer {self._cfg.service_role_key}",
            "Accept": "application/json",
        }
        if content_type:
            h["Content-Type"] = str(content_type)
        return h

    def _req(self, method: str, url: str, *, data: Optional[bytes], headers: Dict[str, str]) -> Tuple[int, bytes]:
        req = urllib.request.Request(url=url, method=method.upper(), data=data, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                raw = resp.read()
                return int(resp.status), raw
        except urllib.error.HTTPError as e:
            raw = e.read()
            return int(getattr(e, "code", 0) or 0), raw
        except Exception as e:
            raise SupabaseStorageError(f"storage request failed: {e}") from e

    def upload(
        self,
        *,
        bucket_id: str,
        object_path: str,
        data: bytes,
        content_type: str,
        upsert: bool = True,
    ) -> Dict[str, Any]:
        """
        PUT /storage/v1/object/{bucket}/{path}
        """
        bucket = urllib.parse.quote(str(bucket_id).strip(), safe="")
        path = urllib.parse.quote(str(object_path).lstrip("/"), safe="/")
        url = f"{self._base()}/storage/v1/object/{bucket}/{path}"
        headers = self._headers(content_type=content_type)
        headers["x-upsert"] = "true" if upsert else "false"
        status, raw = self._req("PUT", url, data=data, headers=headers)
        if status >= 400:
            raise SupabaseStorageError(f"upload failed HTTP {status}: {raw[:400]!r}")
        try:
            return json.loads(raw.decode("utf-8")) if raw else {"ok": True}
        except Exception:
            return {"ok": True}

    def download(
        self,
        *,
        bucket_id: str,
        object_path: str,
    ) -> bytes:
        """
        GET /storage/v1/object/{bucket}/{path}
        """
        bucket = urllib.parse.quote(str(bucket_id).strip(), safe="")
        path = urllib.parse.quote(str(object_path).lstrip("/"), safe="/")
        url = f"{self._base()}/storage/v1/object/{bucket}/{path}"
        headers = self._headers()
        status, raw = self._req("GET", url, data=None, headers=headers)
        if status >= 400:
            raise SupabaseStorageError(f"download failed HTTP {status}: {raw[:400]!r}")
        return raw or b""

