from __future__ import annotations

import json
import urllib.request
import urllib.error
from dataclasses import dataclass
from typing import Any, Dict, Optional


class SupabaseAuthError(RuntimeError):
    pass


@dataclass(frozen=True)
class SupabaseUser:
    user_id: str
    email: Optional[str] = None
    raw: Optional[Dict[str, Any]] = None


def _bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    s = str(authorization).strip()
    if not s:
        return None
    if s.lower().startswith("bearer "):
        token = s[7:].strip()
        return token or None
    return None


def resolve_user_from_bearer(
    *,
    supabase_url: str,
    supabase_api_key: str,
    authorization: Optional[str],
    timeout_sec: int = 15,
) -> SupabaseUser:
    """
    Resolve authenticated user from a Supabase access token by calling:
      GET {SUPABASE_URL}/auth/v1/user

    This avoids bundling JWT verification deps in the core.

    Requirements:
    - `authorization` must be a Bearer token string.
    - `supabase_api_key` can be anon key or service role key.
    """
    token = _bearer_token(authorization)
    if not token:
        raise SupabaseAuthError("Missing bearer token")

    base = str(supabase_url).rstrip("/")
    url = base + "/auth/v1/user"

    headers = {
        "apikey": str(supabase_api_key),
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }

    req = urllib.request.Request(url=url, method="GET", headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=int(timeout_sec)) as resp:
            raw = resp.read()
            status = int(resp.status)
    except urllib.error.HTTPError as e:
        raw = e.read()
        status = int(getattr(e, "code", 0) or 0)
    except Exception as e:
        raise SupabaseAuthError(f"Supabase auth request failed: {e}") from e

    if status >= 400:
        try:
            payload = json.loads((raw or b"{}").decode("utf-8"))
        except Exception:
            payload = {"error": (raw or b"").decode("utf-8", errors="replace")}
        raise SupabaseAuthError(f"Supabase auth HTTP {status}: {payload}")

    try:
        payload = json.loads((raw or b"{}").decode("utf-8"))
    except Exception as e:
        raise SupabaseAuthError(f"Invalid Supabase auth response: {e}") from e

    uid = payload.get("id")
    if not isinstance(uid, str) or not uid:
        raise SupabaseAuthError("Supabase auth response missing user id")

    email = payload.get("email")
    if not isinstance(email, str) or not email:
        email = None

    return SupabaseUser(user_id=uid, email=email, raw=(payload if isinstance(payload, dict) else None))

