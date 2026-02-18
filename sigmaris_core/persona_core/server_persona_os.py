"""
sigmaris_core/persona_core/server_persona_os.py

Persona OS v2（PersonaController）を FastAPI で公開する、単体のサーバ実装です。

このファイルの狙い:
- 入口を 1つに絞り、処理の流れを追いやすくする
- どこで何をしているか（記憶/同一性/ドリフト/状態/生成/保存）をログで追えるようにする

起動例:
  uvicorn server_persona_os:app --reload --port 8000

トレースログ:
- `SIGMARIS_TRACE=1` で追跡ログ（debug）を出力
- `SIGMARIS_TRACE_TEXT=1` で message/reply のプレビューも出力（個人情報に注意）
"""

from __future__ import annotations

import os
import json
import time
import uuid
import hashlib
import sys
import asyncio
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi import Header
from fastapi import Depends, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, field_validator, model_validator

from persona_core.storage.env_loader import load_dotenv
from persona_core.controller.persona_controller import PersonaController, PersonaControllerConfig
from persona_core.identity.identity_continuity import IdentityContinuityEngineV3
from persona_core.llm.openai_llm_client import OpenAILLMClient
from persona_core.memory.ambiguity_resolver import AmbiguityResolver
from persona_core.memory.episode_merger import EpisodeMerger
from persona_core.memory.episode_store import Episode
from persona_core.memory.memory_orchestrator import MemoryOrchestrator
from persona_core.memory.selective_recall import SelectiveRecall
from persona_core.safety.safety_layer import SafetyLayer
from persona_core.state.global_state_machine import GlobalStateMachine
from persona_core.trace import TRACE_INCLUDE_TEXT, get_logger, new_trace_id, preview_text, trace_event
from persona_core.trait.trait_drift_engine import TraitDriftEngine, TraitState
from persona_core.types.core_types import PersonaRequest
from persona_core.value.value_drift_engine import ValueDriftEngine, ValueState
from persona_core.storage.supabase_rest import SupabaseConfig, SupabaseRESTClient
from persona_core.storage.supabase_store import SupabaseEpisodeStore, SupabasePersonaDB
from persona_core.storage.supabase_auth import SupabaseAuthError, resolve_user_from_bearer
from persona_core.storage.supabase_storage import SupabaseStorageClient, SupabaseStorageConfig, SupabaseStorageError
from persona_core.ego.ego_state import EgoContinuityState
from persona_core.temporal_identity.temporal_identity_state import TemporalIdentityState
from persona_core.phase04.runtime import get_phase04_runtime


log = get_logger(__name__)

# `.env` から Supabase/モデル設定を読み込めるようにする（環境変数が優先）
load_dotenv(override=False)

DEFAULT_MODEL = os.getenv("SIGMARIS_PERSONA_MODEL", "gpt-5.2")
DEFAULT_EMBEDDING_MODEL = os.getenv("SIGMARIS_EMBEDDING_MODEL", "text-embedding-3-small")
DEFAULT_USER_ID = os.getenv("SIGMARIS_DEFAULT_USER_ID", "default-user")

META_VERSION = 1
ENGINE_VERSION = os.getenv("SIGMARIS_ENGINE_VERSION", "sigmaris-core")
BUILD_SHA = (
    os.getenv("SIGMARIS_BUILD_SHA")
    or os.getenv("GIT_COMMIT_SHA")
    or os.getenv("VERCEL_GIT_COMMIT_SHA")
    or os.getenv("RENDER_GIT_COMMIT")
    or os.getenv("FLY_APP_NAME")  # better than empty; still non-secret
    or "UNKNOWN"
)


def _compute_config_hash() -> str:
    """
    Best-effort stable hash for "engine configuration" (not per-turn state).
    """
    cfg: Dict[str, Any] = {
        "meta_version": META_VERSION,
        "engine_version": ENGINE_VERSION,
        "build_sha": BUILD_SHA,
        "model": DEFAULT_MODEL,
        "embedding_model": DEFAULT_EMBEDDING_MODEL,
        "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "phase03_session_cap": os.getenv("SIGMARIS_PHASE03_SESSION_CAP", "1024"),
        "contradiction_open_limit": os.getenv("SIGMARIS_CONTRADICTION_OPEN_LIMIT", "6"),
    }
    payload = json.dumps(cfg, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


CONFIG_HASH = _compute_config_hash()


def _is_uuid(v: Optional[str]) -> bool:
    try:
        uuid.UUID(str(v))
        return True
    except Exception:
        return False


def _now_iso_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256_json(obj: Any) -> str:
    payload = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _io_cache_enabled() -> bool:
    return os.getenv("SIGMARIS_IO_CACHE_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")


def _io_cache_ttl_sec() -> int:
    try:
        return int(os.getenv("SIGMARIS_IO_CACHE_TTL_SEC", "3600") or "3600")
    except Exception:
        return 3600


def _io_audit_excerpt_chars() -> int:
    try:
        n = int(os.getenv("SIGMARIS_IO_AUDIT_STORE_EXCERPT_CHARS", "2000") or "2000")
    except Exception:
        n = 2000
    return max(0, min(20000, n))


def _cache_key(*, event_type: str, request_payload: Dict[str, Any]) -> str:
    return hashlib.sha256(
        json.dumps({"event_type": event_type, "request": request_payload}, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
    ).hexdigest()

# =============================================================
# FastAPI App
# - ルートデコレータ評価時に `app` が未定義にならないよう、早めに定義しておく
# =============================================================

app = FastAPI(title="Sigmaris Persona OS API", version="1.0.0")

_cors_origins_raw = os.getenv("SIGMARIS_CORS_ORIGINS", "").strip()
if _cors_origins_raw:
    origins = [s.strip() for s in _cors_origins_raw.split(",") if s.strip()]
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

_supabase_cfg = SupabaseConfig.from_env()
_supabase: Optional[SupabaseRESTClient]
if _supabase_cfg is not None:
    _supabase = SupabaseRESTClient(_supabase_cfg)
else:
    _supabase = None

_storage_bucket = os.getenv("SIGMARIS_STORAGE_BUCKET", "sigmaris-attachments").strip() or "sigmaris-attachments"
_storage: Optional[SupabaseStorageClient] = None
if _supabase_cfg is not None:
    try:
        _storage = SupabaseStorageClient(
            SupabaseStorageConfig(url=_supabase_cfg.url, service_role_key=_supabase_cfg.service_role_key)
        )
    except Exception:
        _storage = None

_auth_required_default = os.getenv("SIGMARIS_REQUIRE_AUTH", "").strip().lower() in ("1", "true", "yes", "on")
_auth_required = bool(_auth_required_default or (_supabase_cfg is not None))
_auth_timeout_sec = int(os.getenv("SIGMARIS_AUTH_TIMEOUT_SEC", "15") or "15")


class AuthContext(BaseModel):
    user_id: str
    email: Optional[str] = None


"""
Performance helpers (TTFT)
- Parallelize independent Supabase REST calls (urllib is blocking)
- Optional short-lived caching for auth/state loads (disabled by default)
"""

_state_load_workers = int(os.getenv("SIGMARIS_STATE_LOAD_WORKERS", "6") or "6")
_state_load_workers = max(2, min(32, _state_load_workers))
_STATE_LOAD_POOL: ThreadPoolExecutor = ThreadPoolExecutor(max_workers=_state_load_workers)

_state_cache_ttl_sec = float(os.getenv("SIGMARIS_STATE_CACHE_TTL_SEC", "0") or "0")
_state_cache_max = int(os.getenv("SIGMARIS_STATE_CACHE_MAX", "256") or "256")
_state_cache_max = max(0, min(5000, _state_cache_max))
_state_cache: Dict[str, Dict[str, Any]] = {}  # user_id -> {"ts": float, ...payload}

_auth_cache_ttl_sec = float(os.getenv("SIGMARIS_AUTH_CACHE_TTL_SEC", "0") or "0")
_auth_cache_max = int(os.getenv("SIGMARIS_AUTH_CACHE_MAX", "1024") or "1024")
_auth_cache_max = max(0, min(10000, _auth_cache_max))
_auth_cache: Dict[str, Dict[str, Any]] = {}  # token_hash -> {"ts": float, "ctx": AuthContext}


async def _to_thread(fn, *args, **kwargs):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_STATE_LOAD_POOL, lambda: fn(*args, **kwargs))


def _cache_get(cache: Dict[str, Dict[str, Any]], key: str, ttl_sec: float) -> Optional[Dict[str, Any]]:
    if ttl_sec <= 0:
        return None
    v = cache.get(key)
    if not isinstance(v, dict):
        return None
    ts = v.get("ts")
    if not isinstance(ts, (int, float)):
        cache.pop(key, None)
        return None
    if (time.time() - float(ts)) > float(ttl_sec):
        cache.pop(key, None)
        return None
    return v


def _cache_put(cache: Dict[str, Dict[str, Any]], key: str, payload: Dict[str, Any], *, max_items: int) -> None:
    if max_items <= 0:
        return
    payload = dict(payload)
    payload["ts"] = float(time.time())
    cache[key] = payload
    if len(cache) <= max_items:
        return
    # best-effort eviction: drop ~10% oldest-ish entries without heavy LRU bookkeeping
    try:
        items = list(cache.items())
        items.sort(key=lambda kv: float((kv[1] or {}).get("ts") or 0.0))
        drop_n = max(1, int(max_items * 0.1))
        for k, _ in items[:drop_n]:
            cache.pop(k, None)
    except Exception:
        cache.clear()


async def _load_supabase_initial_states(
    *,
    persona_db: "SupabasePersonaDB",
    user_id: str,
) -> Dict[str, Any]:
    cached = _cache_get(_state_cache, user_id, _state_cache_ttl_sec)
    if isinstance(cached, dict):
        return cached

    tasks = [
        _to_thread(persona_db.load_last_operator_override, user_id=user_id, kind="ops_mode_set"),
        _to_thread(persona_db.load_last_value_state, user_id=user_id),
        _to_thread(persona_db.load_last_trait_state, user_id=user_id),
        _to_thread(persona_db.load_last_ego_state, user_id=user_id),
        _to_thread(persona_db.load_last_temporal_identity_state, user_id=user_id),
    ]
    op, value, trait, ego, tid = await asyncio.gather(*tasks, return_exceptions=True)

    if isinstance(value, Exception) or not isinstance(value, ValueState):
        value = ValueState()
    if isinstance(trait, Exception) or not isinstance(trait, TraitState):
        trait = TraitState()
    if isinstance(op, Exception):
        op = None
    if isinstance(ego, Exception):
        ego = None
    if isinstance(tid, Exception):
        tid = None

    payload = {"op": op, "value": value, "trait": trait, "ego": ego, "tid": tid}
    if _state_cache_ttl_sec > 0 and _state_cache_max > 0:
        _cache_put(_state_cache, user_id, payload, max_items=_state_cache_max)
    return payload


def _auth_api_key() -> Optional[str]:
    """
    Prefer ANON key for auth calls if present, otherwise fall back to service role key.
    (Either works for /auth/v1/user; using anon key is the least-privileged default.)
    """
    anon = os.getenv("SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if anon and anon.strip():
        return anon.strip()
    if _supabase_cfg is not None and _supabase_cfg.service_role_key:
        return _supabase_cfg.service_role_key
    return None


def get_auth_context(authorization: Optional[str] = Header(default=None)) -> Optional[AuthContext]:
    """
    Public deployment invariant:
    - Derive user_id from validated bearer token.
    - Ignore any body-provided user_id.

    If auth is not required (local demo), returns None.
    """
    if not _auth_required:
        return None

    if _supabase_cfg is None:
        raise HTTPException(status_code=500, detail="Auth required but Supabase is not configured")

    api_key = _auth_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="Auth required but SUPABASE_ANON_KEY is not configured")

    try:
        token = None
        try:
            s = str(authorization or "").strip()
            if s.lower().startswith("bearer "):
                token = s[7:].strip() or None
        except Exception:
            token = None

        if token and _auth_cache_ttl_sec > 0 and _auth_cache_max > 0:
            th = hashlib.sha256(token.encode("utf-8", errors="ignore")).hexdigest()
            cached = _cache_get(_auth_cache, th, _auth_cache_ttl_sec)
            if isinstance(cached, dict):
                ctx = cached.get("ctx")
                if isinstance(ctx, AuthContext):
                    return ctx

        u = resolve_user_from_bearer(
            supabase_url=_supabase_cfg.url,
            supabase_api_key=api_key,
            authorization=authorization,
            timeout_sec=_auth_timeout_sec,
        )
        ctx = AuthContext(user_id=u.user_id, email=u.email)
        if token and _auth_cache_ttl_sec > 0 and _auth_cache_max > 0:
            _cache_put(_auth_cache, th, {"ctx": ctx}, max_items=_auth_cache_max)
        return ctx
    except SupabaseAuthError as e:
        raise HTTPException(status_code=401, detail=str(e))


def _v0_defaults(trace_id: str) -> Dict[str, Any]:
    return {
        "trace_id": str(trace_id or "UNKNOWN"),
        "intent": {},
        "dialogue_state": "UNKNOWN",
        "telemetry": {"C": 0.0, "N": 0.0, "M": 0.0, "S": 0.0, "R": 0.0},
        "safety": {"total_risk": 0.0, "override": False},
    }


def _normalize_v0(*, trace_id: str, controller_meta: Any) -> Dict[str, Any]:
    base = _v0_defaults(trace_id)
    if not isinstance(controller_meta, dict):
        return base
    v0 = controller_meta.get("v0")
    if not isinstance(v0, dict):
        return base

    # shallow merge + type guards
    out = dict(base)
    if isinstance(v0.get("intent"), dict):
        out["intent"] = {k: float(v) for k, v in v0["intent"].items() if isinstance(k, str) and isinstance(v, (int, float))}
    if isinstance(v0.get("dialogue_state"), str) and v0.get("dialogue_state"):
        out["dialogue_state"] = v0["dialogue_state"]
    if isinstance(v0.get("telemetry"), dict):
        tel = {}
        for k in ("C", "N", "M", "S", "R"):
            v = v0["telemetry"].get(k)
            tel[k] = float(v) if isinstance(v, (int, float)) else 0.0
        out["telemetry"] = tel
    if isinstance(v0.get("safety"), dict):
        s = v0["safety"]
        out["safety"] = {
            "total_risk": float(s.get("total_risk")) if isinstance(s.get("total_risk"), (int, float)) else 0.0,
            "override": bool(s.get("override") or False),
        }
    return out


def _normalize_decision_candidates(*, controller_meta: Any, v0: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    decision_candidates v1 (always non-null list).
    """
    if isinstance(controller_meta, dict):
        dc = controller_meta.get("decision_candidates")
        if isinstance(dc, list):
            out: List[Dict[str, Any]] = []
            for item in dc:
                if not isinstance(item, dict):
                    continue
                out.append(
                    {
                        "id": str(item.get("id") or ""),
                        "label": str(item.get("label") or ""),
                        "score": float(item.get("score")) if isinstance(item.get("score"), (int, float)) else 0.0,
                        "reason": str(item.get("reason") or ""),
                    }
                )
            return out

    # Fallback: derive 3 candidates from v0
    intent = v0.get("intent") if isinstance(v0.get("intent"), dict) else {}
    scores = [float(v) for v in intent.values() if isinstance(v, (int, float))]
    scores.sort(reverse=True)
    primary = float(scores[0]) if len(scores) >= 1 else 0.0
    secondary = float(scores[1]) if len(scores) >= 2 else 0.0
    ds = str(v0.get("dialogue_state") or "UNKNOWN")
    total_risk = float((v0.get("safety") or {}).get("total_risk") or 0.0) if isinstance(v0.get("safety"), dict) else 0.0

    return [
        {"id": "primary", "label": f"{ds}_answer" if ds != "UNKNOWN" else "primary", "score": primary, "reason": "Selected by mode + intent alignment"},
        {"id": "alt_short", "label": "task_focused_short", "score": secondary, "reason": "Viable but not optimal for current mode"},
        {"id": "alt_refuse", "label": "safety_refusal", "score": total_risk, "reason": "Safety threshold relevance"},
    ]


def _extract_persona_runtime_meta(gen: Any) -> Dict[str, Any]:
    """
    Expose small, stable persona runtime fields for reproducibility/debugging.
    Must NOT include full persona_system prompt (too large, can leak instructions).
    """
    if not isinstance(gen, dict):
        return {}
    allow = (
        "quality_pipeline",
        "quality_mode",
        "_touhou_chat_mode",
        "_persona_version",
        "_persona_hash",
        "_persona_state",
    )
    out: Dict[str, Any] = {}
    for k in allow:
        if k not in gen:
            continue
        v = gen.get(k)
        if v is None:
            continue
        # keep JSON-serializable + small
        if isinstance(v, (str, int, float, bool)):
            out[k] = v
        elif isinstance(v, dict):
            # persona_state is expected to be a small dict
            out[k] = {str(kk): vv for kk, vv in v.items() if isinstance(kk, str)}
    return out


def _estimate_overload_score(message: str) -> float:
    """
    overload_score は GlobalStateMachine の入力のひとつです。
    ここでは「入力が長いほど overload」を雑に数値化します（0.0..1.0）。
    """
    n = len(message or "")
    return max(0.0, min(1.0, n / 800.0))  # 800文字で 1.0 目安


# =============================================================
# In-memory EpisodeStore（開発/デモ用）
# - 永続化しない（プロセス再起動で消える）
# =============================================================


class InMemoryEpisodeStore:
    """
    PersonaController が使う Episodic Memory の最小I/F。
    - add(ep)
    - fetch_recent(limit)
    - fetch_by_ids(ids)
    """

    def __init__(self) -> None:
        self._episodes: List[Episode] = []

    def add(self, ep: Episode) -> None:
        self._episodes.append(ep)

    def fetch_recent(self, limit: int = 50) -> List[Episode]:
        return list(self._episodes[-limit:])

    def fetch_by_ids(self, ids: List[str]) -> List[Episode]:
        id_set = set(ids)
        return [ep for ep in self._episodes if ep.episode_id in id_set]


# =============================================================
# In-memory PersonaDB（開発/デモ用）
# - DriftEngine / PersonaController が「保存できるなら保存する」前提で呼ぶAPIのみ実装
# =============================================================


class InMemoryPersonaDB:
    def __init__(self) -> None:
        self.episodes: List[Dict[str, Any]] = []
        self.value_snapshots: List[Dict[str, Any]] = []
        self.trait_snapshots: List[Dict[str, Any]] = []

    def store_episode(
        self,
        *,
        session_id: str,
        role: str,
        content: str,
        topic_hint: Optional[str],
        emotion_hint: Optional[str],
        importance: float,
        meta: Dict[str, Any],
    ) -> None:
        self.episodes.append(
            {
                "session_id": session_id,
                "role": role,
                "content": content,
                "topic_hint": topic_hint,
                "emotion_hint": emotion_hint,
                "importance": importance,
                "meta": meta,
                "timestamp": datetime.now(timezone.utc),
            }
        )

    def store_value_snapshot(
        self,
        *,
        user_id: Optional[str],
        state: Dict[str, float],
        delta: Dict[str, float],
        meta: Dict[str, Any],
    ) -> None:
        self.value_snapshots.append(
            {
                "user_id": user_id,
                "state": state,
                "delta": delta,
                "meta": meta,
                "timestamp": datetime.now(timezone.utc),
            }
        )

    def store_trait_snapshot(
        self,
        *,
        user_id: Optional[str],
        state: Dict[str, float],
        delta: Dict[str, float],
        meta: Dict[str, Any],
    ) -> None:
        self.trait_snapshots.append(
            {
                "user_id": user_id,
                "state": state,
                "delta": delta,
                "meta": meta,
                "timestamp": datetime.now(timezone.utc),
            }
        )


# =============================================================
# FastAPI Models
# =============================================================


class ChatRequest(BaseModel):
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    # Backward compatible: clients may send either `message` or `messages` (Vercel AI SDK style).
    message: str = ""
    # Optional: Vercel AI SDK style messages (UIMessage-like dicts). If provided, core extracts the latest user message.
    messages: Optional[List[Dict[str, Any]]] = None
    # Optional: short-term chat history for better immediate continuity (list of {role,content} or UIMessage-like dicts).
    history: Optional[List[Dict[str, Any]]] = None
    # Optional: additional system prompt injection (treated as external persona/system, never replaces core OS prompt).
    system: Optional[str] = None

    # Optional character/persona injection (safe, ignored unless provided)
    character_id: Optional[str] = None
    persona_system: Optional[str] = None
    # Optional per-request generation params (e.g., {"temperature":0.8,"max_tokens":600})
    gen: Optional[Dict[str, Any]] = None

    reward_signal: float = 0.0
    affect_signal: Optional[Dict[str, float]] = None
    # Trait baseline (0..1). If provided, controller uses it and returns updated baseline in meta.
    trait_baseline: Optional[Dict[str, float]] = None

    # Phase04: attachment metadata references (bytes are uploaded separately)
    attachments: Optional[List[Dict[str, Any]]] = None

    @model_validator(mode="after")
    def _require_message_or_messages(self) -> "ChatRequest":
        has_message = isinstance(self.message, str) and bool((self.message or "").strip())
        has_messages = isinstance(self.messages, list) and len(self.messages) > 0
        if not has_message and not has_messages:
            raise ValueError("Either `message` or `messages` is required")
        return self


class ChatResponse(BaseModel):
    reply: str
    meta: Dict[str, Any]

def _safe_str(v: Any) -> str:
    try:
        return str(v)
    except Exception:
        return ""


def _extract_text_from_ui_content(content: Any) -> str:
    """
    Best-effort extraction of plain text from Vercel AI SDK style message content.
    Accepts:
      - string
      - list of parts: {"type":"text","text":"..."} or {"text":"..."} or mixed
      - dict with "text" or "content"
    """
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        if isinstance(content.get("text"), str):
            return content.get("text") or ""
        if isinstance(content.get("content"), str):
            return content.get("content") or ""
        # Some UIs nest as { type, ... } - ignore non-text here.
        return ""
    if isinstance(content, list):
        parts: List[str] = []
        for p in content:
            if isinstance(p, str):
                if p.strip():
                    parts.append(p)
                continue
            if isinstance(p, dict):
                # Common shapes:
                # - { type: "text", text: "..." }
                # - { text: "..." }
                # - { type: "input_text", text: "..." }
                t = p.get("text")
                if isinstance(t, str) and t.strip():
                    parts.append(t)
                    continue
                # fallback keys
                c = p.get("content")
                if isinstance(c, str) and c.strip():
                    parts.append(c)
                    continue
        return "\n".join(parts).strip()
    return ""


def _normalize_history_items(items: Any) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    if not isinstance(items, list):
        return out
    for m in items:
        if not isinstance(m, dict):
            continue
        role = _safe_str(m.get("role") or "").strip().lower()
        if role in ("ai",):
            role = "assistant"
        if role not in ("user", "assistant"):
            continue
        content = _extract_text_from_ui_content(m.get("content"))
        if not content.strip():
            # some sources use "text" directly
            content = _safe_str(m.get("text") or "")
        content = content.strip()
        if not content:
            continue
        out.append({"role": role, "content": content})
    return out


def _derive_message_and_history(req: ChatRequest) -> tuple[str, List[Dict[str, str]]]:
    """
    Derive (effective_message, client_history) from request fields.
    Priority:
      - effective_message: req.message if non-empty else last user message in req.messages
      - client_history: req.history if provided else derived from req.messages (excluding the effective user message)
    """
    eff_message = (req.message or "").strip()
    msgs_norm = _normalize_history_items(req.messages)
    if not eff_message and msgs_norm:
        # pick the last user message as the effective turn
        for m in reversed(msgs_norm):
            if m.get("role") == "user" and m.get("content", "").strip():
                eff_message = m["content"].strip()
                break

    history_norm = _normalize_history_items(req.history)
    if not history_norm and msgs_norm:
        history_norm = msgs_norm[:]
        # drop trailing effective user message if present
        if history_norm and history_norm[-1].get("role") == "user":
            tail = (history_norm[-1].get("content") or "").strip()
            if tail and eff_message and tail == eff_message:
                history_norm = history_norm[:-1]

    # clamp
    max_msgs = int(os.getenv("SIGMARIS_CLIENT_HISTORY_MAX_MESSAGES", "16") or "16")
    if max_msgs > 0 and len(history_norm) > max_msgs:
        history_norm = history_norm[-max_msgs:]
    max_chars = int(os.getenv("SIGMARIS_CLIENT_HISTORY_MAX_CHARS_PER_MESSAGE", "1200") or "1200")
    if max_chars > 0:
        for m in history_norm:
            c = (m.get("content") or "").strip()
            if len(c) > max_chars:
                m["content"] = c[: max(0, max_chars - 1)] + "…"

    return eff_message, history_norm


def _merge_external_system(persona_system: Optional[str], system: Optional[str]) -> Optional[str]:
    a = (persona_system or "").strip()
    b = (system or "").strip()
    if a and b:
        return a + "\n\n" + b
    return a or b or None


def _web_rag_enabled() -> bool:
    return os.getenv("SIGMARIS_WEB_RAG_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")


def _web_rag_auto_enabled() -> bool:
    return os.getenv("SIGMARIS_WEB_RAG_AUTO", "").strip().lower() in ("1", "true", "yes", "on")


def _web_rag_explicit_request(message: str) -> bool:
    s = (message or "")
    # Explicit user intent (Japanese + common English)
    keywords = [
        "最新",
        "直近",
        "最近",
        "ニュース",
        "記事",
        "話題",
        "見出し",
        "探して",
        "調べてほしい",
        "調べて欲しい",
        "引っ張って",
        "拾って",
        "値段",
        "価格",
        "相場",
        "いくら",
        "最安",
        "障害",
        "不具合",
        "落ちて",
        "重い",
        "遅い",
        "繋がらない",
        "つながらない",
        "ステータス",
        "検索",
        "調べて",
        "検索して",
        "確認して",
        "ソース",
        "出典",
        "引用元",
        "一次ソース",
        "リンク",
        "URL",
        "news",
        "headline",
        "article",
        "outage",
        "status",
        "source",
        "citation",
        "browse",
        "web search",
    ]
    return any(k in s for k in keywords)


def _web_rag_time_sensitive_hint(message: str) -> bool:
    s = (message or "")
    keywords = [
        "最新",
        "今日",
        "昨日",
        "今週",
        "今月",
        "ニュース",
        "速報",
        "いま",
        "現状",
        "障害",
        "不具合",
        "落ちて",
        "重い",
        "遅い",
        "繋がらない",
        "つながらない",
        "料金",
        "価格",
        "リリース",
        "バージョン",
    ]
    return any(k in s for k in keywords)


async def _maybe_web_rag_for_turn(
    *,
    message: str,
    gen: Optional[Dict[str, Any]],
    trace_id: str,
    session_id: str,
    user_id: str,
    persona_db: Optional[Any],
) -> tuple[Optional[str], Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """
    Build (context_text, sources, meta) for prompt injection.

    - Default: disabled unless SIGMARIS_WEB_RAG_ENABLED=1
    - Auto trigger: SIGMARIS_WEB_RAG_AUTO=1 + heuristics (time-sensitive)
    - Explicit trigger: user asked to search/cite
    - Cache: uses IO event cache when enabled (same TTL env as other IO)
    """
    if not _web_rag_enabled():
        return (None, None, None)

    g = gen if isinstance(gen, dict) else {}
    web_cfg = g.get("web_rag")
    force = False
    if isinstance(web_cfg, dict):
        force = bool(web_cfg.get("enabled") is True)
    elif web_cfg is True:
        force = True

    explicit = _web_rag_explicit_request(message)
    auto = _web_rag_auto_enabled() and _web_rag_time_sensitive_hint(message)
    if not (force or explicit or auto):
        return (None, None, None)

    # Extract seed URLs (list pages etc.) from the message.
    seed_urls: List[str] = []
    try:
        seed_urls = re.findall(r"https?://[^\\s<>\"')\\]]+", str(message or ""))[:5]
        seed_urls = [u.strip() for u in seed_urls if isinstance(u, str) and u.strip()]
    except Exception:
        seed_urls = []

    # Provider must be configured (SERPER_API_KEY etc) only when we don't have seed URLs.
    if not seed_urls:
        try:
            from persona_core.phase04.io.web_search import get_web_search_provider

            if get_web_search_provider() is None:
                return (None, None, None)
        except Exception:
            return (None, None, None)

    # Build request payload from env defaults + optional overrides
    def _get_int(key: str, default: int) -> int:
        try:
            if isinstance(web_cfg, dict) and key in web_cfg:
                return int(web_cfg.get(key))
        except Exception:
            pass
        try:
            return int(os.getenv(f"SIGMARIS_WEB_RAG_{key.upper()}", str(default)) or str(default))
        except Exception:
            return int(default)

    def _get_bool(key: str, default: bool) -> bool:
        try:
            if isinstance(web_cfg, dict) and key in web_cfg:
                return bool(web_cfg.get(key))
        except Exception:
            pass
        v = os.getenv(f"SIGMARIS_WEB_RAG_{key.upper()}", "1" if default else "0") or ("1" if default else "0")
        return str(v).strip().lower() in ("1", "true", "yes", "on")

    def _get_str(key: str, default: str) -> str:
        try:
            if isinstance(web_cfg, dict) and key in web_cfg and isinstance(web_cfg.get(key), str):
                return str(web_cfg.get(key) or "").strip() or default
        except Exception:
            pass
        return str(os.getenv(f"SIGMARIS_WEB_RAG_{key.upper()}", default) or default).strip() or default

    recency_days: Optional[int] = None
    try:
        if isinstance(web_cfg, dict) and web_cfg.get("recency_days") is not None:
            recency_days = int(web_cfg.get("recency_days"))
        elif _web_rag_time_sensitive_hint(message):
            recency_days = int(os.getenv("SIGMARIS_WEB_RAG_RECENCY_DAYS", "14") or "14")
    except Exception:
        recency_days = None

    request_payload: Dict[str, Any] = {
        "query": str(message or "").strip()[:800],
        "seed_urls": list(seed_urls),
        "max_search_results": _get_int("max_search_results", 8),
        "recency_days": int(recency_days) if recency_days is not None else None,
        "safe_search": _get_str("safe_search", "active"),
        "domains": list(web_cfg.get("domains") or []) if isinstance(web_cfg, dict) and isinstance(web_cfg.get("domains"), list) else [],
        "max_pages": _get_int("max_pages", 20),
        "max_depth": _get_int("max_depth", 1),
        "top_k": _get_int("top_k", 6),
        "per_host_limit": _get_int("per_host_limit", 8),
        "summarize": _get_bool("summarize", True),
    }

    ck = _cache_key(event_type="web_rag", request_payload=request_payload)

    if persona_db is not None and _io_cache_enabled():
        ttl = _io_cache_ttl_sec()
        if ttl > 0:
            not_before = (datetime.now(timezone.utc) - timedelta(seconds=int(ttl))).isoformat()
            try:
                cached = persona_db.load_cached_io_event(
                    user_id=str(user_id),
                    event_type="web_rag",
                    cache_key=ck,
                    not_before_iso=not_before,
                )
            except Exception:
                cached = None
            if isinstance(cached, dict):
                resp = cached.get("response") if isinstance(cached.get("response"), dict) else {}
                ctx = resp.get("context_text") if isinstance(resp.get("context_text"), str) else None
                sources = resp.get("sources") if isinstance(resp.get("sources"), list) else None
                meta = resp.get("meta") if isinstance(resp.get("meta"), dict) else None
                if isinstance(ctx, str) and isinstance(sources, list):
                    return (ctx, sources, (meta or {}))

    try:
        from persona_core.phase04.io.web_rag import build_web_rag

        out = await asyncio.to_thread(
            build_web_rag,
            query=str(request_payload["query"]),
            seed_urls=(request_payload.get("seed_urls") if isinstance(request_payload.get("seed_urls"), list) else None),
            max_search_results=int(request_payload["max_search_results"]),
            recency_days=(int(request_payload["recency_days"]) if request_payload.get("recency_days") is not None else None),
            safe_search=str(request_payload["safe_search"] or "active"),
            domains=(request_payload.get("domains") if isinstance(request_payload.get("domains"), list) else None),
            max_pages=int(request_payload["max_pages"]),
            max_depth=int(request_payload["max_depth"]),
            top_k=int(request_payload["top_k"]),
            per_host_limit=int(request_payload["per_host_limit"]),
            summarize=bool(request_payload["summarize"]),
            timeout_sec=int(os.getenv("SIGMARIS_WEB_FETCH_TIMEOUT_SEC", "20") or "20"),
            max_bytes=int(os.getenv("SIGMARIS_WEB_FETCH_MAX_BYTES", "1500000") or "1500000"),
        )
    except Exception:
        return (None, None, None)

    ctx = str(getattr(out, "context_text", "") or "").strip()
    sources_obj = getattr(out, "sources", None)
    sources: List[Dict[str, Any]] = []
    if isinstance(sources_obj, list):
        for s in sources_obj:
            try:
                if hasattr(s, "to_dict"):
                    sources.append(s.to_dict())
                elif isinstance(s, dict):
                    sources.append(s)
            except Exception:
                continue

    meta_obj = getattr(out, "meta", None)
    meta = meta_obj if isinstance(meta_obj, dict) else {}

    if persona_db is not None:
        try:
            audit_chars = _io_audit_excerpt_chars()
            audit_ctx = ctx[:audit_chars] if (audit_chars > 0 and ctx) else ""
            resp_payload: Dict[str, Any] = {"context_text": audit_ctx, "sources": sources, "meta": meta}
            source_urls = []
            for s in sources:
                if isinstance(s, dict) and (s.get("final_url") or s.get("url")):
                    source_urls.append(str(s.get("final_url") or s.get("url")))
            persona_db.insert_io_event(
                user_id=str(user_id),
                session_id=str(session_id),
                trace_id=str(trace_id),
                event_type="web_rag",
                cache_key=ck,
                ok=True,
                error=None,
                request=request_payload,
                response=resp_payload,
                source_urls=source_urls[:64],
                content_sha256=_sha256_json(resp_payload),
                meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA, "audit_excerpt_chars": audit_chars},
            )
        except Exception:
            pass

    return (ctx if ctx else None, sources if sources else None, meta if isinstance(meta, dict) else None)


def _attachment_excerpt_from_parsed(parsed: Any) -> str:
    if not isinstance(parsed, dict):
        return ""
    for k in ("parsed_excerpt", "raw_excerpt", "text_excerpt", "content_summary", "excerpt_summary"):
        v = parsed.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    # image OCR shape
    ocr = parsed.get("ocr")
    if isinstance(ocr, dict):
        v = ocr.get("detected_text")
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def _build_attachments_context(
    *,
    attachments: Optional[List[Dict[str, Any]]],
    auth: Optional[AuthContext],
) -> str:
    """
    Convert attachments metadata into a bounded context block.
    If SIGMARIS_CHAT_AUTO_PARSE_ATTACHMENTS is enabled, attempts to parse missing excerpts via attachment_id.
    """
    atts = attachments if isinstance(attachments, list) else []
    if not atts:
        return ""

    auto_parse = os.getenv("SIGMARIS_CHAT_AUTO_PARSE_ATTACHMENTS", "").strip().lower() in ("1", "true", "yes", "on")
    max_items = int(os.getenv("SIGMARIS_CHAT_ATTACHMENTS_MAX_ITEMS", "3") or "3")
    max_excerpt = int(os.getenv("SIGMARIS_CHAT_ATTACHMENTS_MAX_EXCERPT_CHARS", "1200") or "1200")

    from persona_core.phase04.parsing.file_parser import parse_file_bytes  # local import

    lines: List[str] = ["# Attachments (Phase04)"]
    count = 0
    for raw in atts[: max(0, max_items)]:
        if not isinstance(raw, dict):
            continue
        attachment_id = raw.get("attachment_id")
        if not isinstance(attachment_id, str) or not attachment_id.strip():
            continue

        file_name = _safe_str(raw.get("file_name") or raw.get("name") or "").strip()
        mime_type = _safe_str(raw.get("mime_type") or "").strip()
        kind_hint = _safe_str(raw.get("kind") or "").strip() or None

        excerpt = ""
        parsed_excerpt = raw.get("parsed_excerpt")
        if isinstance(parsed_excerpt, str) and parsed_excerpt.strip():
            excerpt = parsed_excerpt.strip()
        elif auto_parse:
            # Best-effort: download bytes and parse here (same auth rules as /io/parse).
            try:
                data: Optional[bytes] = None
                meta: Dict[str, Any] = {}
                if _supabase is not None and _storage is not None and auth is not None:
                    persona_db = SupabasePersonaDB(_supabase)
                    row = persona_db.load_attachment(attachment_id=str(attachment_id))
                    if not row:
                        raise RuntimeError("attachment not found")
                    owner = row.get("user_id")
                    if owner and str(owner) != str(auth.user_id):
                        raise RuntimeError("forbidden")
                    bucket_id = str(row.get("bucket_id") or _storage_bucket)
                    object_path = str(row.get("object_path") or "")
                    if not object_path:
                        raise RuntimeError("missing object_path")
                    data = _storage.download(bucket_id=bucket_id, object_path=object_path)
                    meta = row if isinstance(row, dict) else {}
                else:
                    base_dir = os.getenv("SIGMARIS_UPLOAD_DIR") or os.path.join("sigmaris_core", "data", "uploads")
                    path = os.path.join(base_dir, str(attachment_id))
                    meta_path = path + ".json"
                    if not os.path.exists(path) or not os.path.isfile(path):
                        raise RuntimeError("attachment not found")
                    if _auth_required and auth is not None and os.path.exists(meta_path):
                        try:
                            with open(meta_path, "r", encoding="utf-8") as f:
                                meta = json.load(f) or {}
                            owner = meta.get("user_id")
                            if owner and str(owner) != str(auth.user_id):
                                raise RuntimeError("forbidden")
                        except Exception:
                            pass
                    with open(path, "rb") as f:
                        data = f.read()
                if data is not None:
                    pk, parsed = parse_file_bytes(
                        data=data,
                        file_name=file_name or _safe_str(meta.get("file_name") or ""),
                        mime_type=mime_type or _safe_str(meta.get("mime_type") or ""),
                        kind=kind_hint,
                    )
                    _ = pk
                    excerpt = _attachment_excerpt_from_parsed(parsed)
            except Exception:
                excerpt = ""

        count += 1
        head = f"[{count}] {file_name or '(unnamed)'}"
        if mime_type:
            head += f" ({mime_type})"
        head += f" id={attachment_id}"
        lines.append(head)
        if excerpt:
            ex = excerpt.strip()
            if max_excerpt > 0 and len(ex) > max_excerpt:
                ex = ex[: max(0, max_excerpt - 1)] + "…"
            lines.append(ex)

    if count <= 0:
        return ""
    return "\n".join(lines).strip()


# =============================================================
# Phase04: Upload + Parse (MVP)
# =============================================================

class UploadResponse(BaseModel):
    attachment_id: str
    file_name: str
    mime_type: str
    size: int


class ParseRequest(BaseModel):
    attachment_id: str
    kind: Optional[str] = None  # "text" | "markdown" | "code" | "image" | None(auto)


class ParseResponse(BaseModel):
    ok: bool
    kind: str
    parsed: Dict[str, Any]


class WebSearchRequest(BaseModel):
    query: str
    max_results: int = 5
    recency_days: Optional[int] = None
    safe_search: str = "active"
    domains: Optional[List[str]] = None

    @field_validator("safe_search", mode="before")
    @classmethod
    def _coerce_safe_search(cls, v: Any) -> str:
        # Backward-compat: some clients may send boolean.
        if v is True:
            return "active"
        if v is False:
            return "off"
        if v is None:
            return "active"
        if isinstance(v, str):
            s = v.strip()
            if s.lower() in ("true", "1", "yes", "on"):
                return "active"
            if s.lower() in ("false", "0", "no", "off"):
                return "off"
            return s or "active"
        return "active"


class WebSearchResponse(BaseModel):
    ok: bool
    results: List[Dict[str, Any]]


class WebFetchRequest(BaseModel):
    url: str
    summarize: bool = True
    max_chars: int = 12000


class WebFetchResponse(BaseModel):
    ok: bool
    url: str
    final_url: str
    title: str
    summary: Optional[str] = None
    key_points: Optional[List[str]] = None
    entities: Optional[List[str]] = None
    confidence: Optional[float] = None
    text_excerpt: Optional[str] = None
    sources: List[Dict[str, Any]] = []


class WebRagRequest(BaseModel):
    query: str
    seed_urls: Optional[List[str]] = None
    max_search_results: int = 8
    recency_days: Optional[int] = None
    safe_search: str = "active"
    domains: Optional[List[str]] = None

    max_pages: int = 20
    max_depth: int = 1
    top_k: int = 6
    per_host_limit: int = 8

    summarize: bool = True

    @field_validator("safe_search", mode="before")
    @classmethod
    def _coerce_safe_search(cls, v: Any) -> str:
        # Keep parity with WebSearchRequest.
        if v is True:
            return "active"
        if v is False:
            return "off"
        if v is None:
            return "active"
        if isinstance(v, str):
            s = v.strip()
            if s.lower() in ("true", "1", "yes", "on"):
                return "active"
            if s.lower() in ("false", "0", "no", "off"):
                return "off"
            return s or "active"
        return "active"


class WebRagResponse(BaseModel):
    ok: bool
    context_text: str
    sources: List[Dict[str, Any]]
    meta: Dict[str, Any] = {}


class GitHubRepoSearchRequest(BaseModel):
    query: str
    max_results: int = 5


class GitHubCodeSearchRequest(BaseModel):
    query: str
    max_results: int = 5


class GitHubSearchResponse(BaseModel):
    ok: bool
    results: List[Dict[str, Any]]


# =============================================================
# Persona OS v2 wiring（組み立て）
# =============================================================


_episode_store = InMemoryEpisodeStore()
_persona_db = InMemoryPersonaDB()

# Safety: このサーバでは “外側” で safety_flag を計算して controller に渡す（後で統合も可能）
_llm_client: Optional[OpenAILLMClient] = None
_inmemory_controller: Optional[PersonaController] = None
_safety_layer: Optional[SafetyLayer] = None


def _get_llm_client() -> OpenAILLMClient:
    """
    OpenAI クライアントは環境変数に依存するため、起動時ではなく必要時に作る。
    - `.env` が未作成でもサーバ自体は起動できる
    - 呼び出し時に設定が無ければ、分かりやすいエラーを返す
    """
    global _llm_client
    if _llm_client is not None:
        return _llm_client

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is missing. "
            "Copy `.env.example` to `.env` and set OPENAI_API_KEY, or export it in the environment."
        )

    _llm_client = OpenAILLMClient(
        model=DEFAULT_MODEL,
        embedding_model=DEFAULT_EMBEDDING_MODEL,
        api_key=api_key,
    )
    return _llm_client


def _get_inmemory_controller() -> PersonaController:
    """
    In-memory 版の wiring を遅延作成して保持する。
    """
    global _inmemory_controller
    if _inmemory_controller is not None:
        return _inmemory_controller

    llm = _get_llm_client()
    embedding_model = llm

    selective_recall = SelectiveRecall(memory_backend=_episode_store, embedding_model=embedding_model)
    ambiguity_resolver = AmbiguityResolver(embedding_model=embedding_model)
    episode_merger = EpisodeMerger(memory_backend=_episode_store)
    memory_orchestrator = MemoryOrchestrator(
        selective_recall=selective_recall,
        episode_merger=episode_merger,
        ambiguity_resolver=ambiguity_resolver,
    )

    _inmemory_controller = PersonaController(
        config=PersonaControllerConfig(default_user_id=None),
        memory_orchestrator=memory_orchestrator,
        identity_engine=IdentityContinuityEngineV3(),
        value_engine=ValueDriftEngine(),
        trait_engine=TraitDriftEngine(),
        global_fsm=GlobalStateMachine(),
        episode_store=_episode_store,
        persona_db=_persona_db,
        llm_client=llm,
        initial_value_state=ValueState(),
        initial_trait_state=TraitState(),
    )
    return _inmemory_controller


def _get_safety_layer(*, embedding_model: Any) -> SafetyLayer:
    """
    SafetyLayer は embedding_model を必要とするため、LLM/embedding が確定してから生成する。
    """
    global _safety_layer
    if _safety_layer is not None:
        return _safety_layer
    _safety_layer = SafetyLayer(embedding_model=embedding_model)
    return _safety_layer


# =============================================================
# Operator / Override APIs
# =============================================================


class OperatorOverrideRequest(BaseModel):
    user_id: str
    kind: str  # "trait_set" | "value_set" | ...
    actor: Optional[str] = None
    payload: Dict[str, Any] = {}


@app.post("/persona/operator/override")
async def persona_operator_override(
    req: OperatorOverrideRequest,
    x_sigmaris_operator_key: Optional[str] = Header(default=None),
):
    """
    Phase01 Part06/Part07:
    - Human override must be possible.
    - Must be logged / auditable.

    This endpoint is intentionally protected by an operator key.
    """
    expected = os.getenv("SIGMARIS_OPERATOR_KEY")
    if expected and (x_sigmaris_operator_key or "") != expected:
        raise HTTPException(status_code=403, detail="Forbidden")

    if _supabase is None:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    trace_id = new_trace_id()
    persona_db = SupabasePersonaDB(_supabase)

    # audit log
    try:
        persona_db.store_operator_override(
            user_id=req.user_id,
            trace_id=trace_id,
            actor=req.actor,
            kind=req.kind,
            payload=req.payload or {},
        )
        persona_db.store_life_event(
            user_id=req.user_id,
            session_id=None,
            trace_id=trace_id,
            kind="external_update",
            payload={"kind": req.kind, "actor": req.actor, "payload": req.payload or {}},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"audit failed: {e}")

    # apply as forced snapshot so the next load picks it up
    try:
        if req.kind == "trait_set":
            calm = float((req.payload or {}).get("calm", 0.5))
            empathy = float((req.payload or {}).get("empathy", 0.5))
            curiosity = float((req.payload or {}).get("curiosity", 0.5))
            persona_db.store_trait_snapshot(
                user_id=req.user_id,
                state={"calm": calm, "empathy": empathy, "curiosity": curiosity},
                delta={"calm": 0.0, "empathy": 0.0, "curiosity": 0.0},
                meta={"trace_id": trace_id, "kind": "operator_override"},
            )
        elif req.kind == "value_set":
            stability = float((req.payload or {}).get("stability", 0.0))
            openness = float((req.payload or {}).get("openness", 0.0))
            safety_bias = float((req.payload or {}).get("safety_bias", 0.0))
            user_alignment = float((req.payload or {}).get("user_alignment", 0.0))
            persona_db.store_value_snapshot(
                user_id=req.user_id,
                state={
                    "stability": stability,
                    "openness": openness,
                    "safety_bias": safety_bias,
                    "user_alignment": user_alignment,
                },
                delta={
                    "stability": 0.0,
                    "openness": 0.0,
                    "safety_bias": 0.0,
                    "user_alignment": 0.0,
                },
                meta={"trace_id": trace_id, "kind": "operator_override"},
            )
    except Exception:
        # do not fail: audit succeeded; snapshot is best-effort
        pass

    return {"ok": True, "trace_id": trace_id}


@app.post("/persona/chat", response_model=ChatResponse)
async def persona_chat(req: ChatRequest, auth: Optional[AuthContext] = Depends(get_auth_context)) -> ChatResponse:
    """
    1ターン分のチャット処理。
    - 入力を PersonaRequest に変換
    - SafetyLayer で safety_flag を判定（簡易）
    - PersonaController.handle_turn(...) に渡して reply を生成
    - meta に内部状態（記憶/同一性/ドリフト/状態）を付けて返す
    """

    trace_id = new_trace_id()
    t0 = time.time()

    user_id = (auth.user_id if auth is not None else (req.user_id or DEFAULT_USER_ID))
    session_id = req.session_id or f"{user_id}:{uuid.uuid4().hex}"

    effective_message, client_history = _derive_message_and_history(req)
    external_system = _merge_external_system(req.persona_system, req.system)
    attachments_ctx = _build_attachments_context(attachments=req.attachments, auth=auth)
    if attachments_ctx:
        effective_message = (effective_message + "\n\n" + attachments_ctx).strip()

    overload_score = _estimate_overload_score(effective_message)

    # Intent Router (core-side)
    try:
        from persona_core.intent_router import classify_intent

        intent = classify_intent(effective_message)
    except Exception:
        intent = "general"

    # Fallback: explicit search requests should still trigger Web RAG when enabled.
    try:
        if intent == "general" and _web_rag_enabled() and _web_rag_explicit_request(effective_message):
            intent = "realtime_fact"
    except Exception:
        pass

    web_ctx = None
    web_sources = None
    web_meta = None

    tool_weather = None
    tool_comparison = None
    personalization_hint: Optional[Dict[str, Any]] = None

    if intent == "weather":
        try:
            from persona_core.phase04.tools.weather_api import weather_api_flow

            tool_weather = weather_api_flow(effective_message)
            web_ctx = (
                "External Tool Context (weather_api).\n"
                "Usage rules:\n"
                "- Use this as supporting evidence.\n\n"
                "tool.weather:\n"
                + json.dumps(tool_weather, ensure_ascii=False, separators=(",", ":"))
            )
            web_sources = []
            web_meta = {"intent": "weather", "provider": "weather_api"}
        except Exception:
            tool_weather = None
            web_ctx, web_sources, web_meta = (None, None, None)
    elif intent == "comparison":
        try:
            from persona_core.phase04.tools.comparison_flow import comparison_flow

            tool_comparison = comparison_flow(effective_message)

            # Remove URLs from injected context; keep sources in metadata only.
            safe = {}
            try:
                if isinstance(tool_comparison, dict):
                    ia = tool_comparison.get("item_a") if isinstance(tool_comparison.get("item_a"), dict) else None
                    ib = tool_comparison.get("item_b") if isinstance(tool_comparison.get("item_b"), dict) else None
                    safe = {
                        "item_a": {
                            "name": (ia or {}).get("name"),
                            "summary": ((ia or {}).get("result") or {}).get("summary") if isinstance((ia or {}).get("result"), dict) else None,
                            "key_points": ((ia or {}).get("result") or {}).get("key_points") if isinstance((ia or {}).get("result"), dict) else None,
                        },
                        "item_b": {
                            "name": (ib or {}).get("name"),
                            "summary": ((ib or {}).get("result") or {}).get("summary") if isinstance((ib or {}).get("result"), dict) else None,
                            "key_points": ((ib or {}).get("result") or {}).get("key_points") if isinstance((ib or {}).get("result"), dict) else None,
                        },
                        "differences": tool_comparison.get("differences") if isinstance(tool_comparison.get("differences"), list) else [],
                    }
            except Exception:
                safe = {}

            web_ctx = (
                "External Tool Context (comparison_flow).\n"
                "Usage rules:\n"
                "- Use this as supporting evidence.\n"
                "- Do NOT invent specs not present.\n\n"
                "tool.comparison:\n"
                + json.dumps(safe, ensure_ascii=False, separators=(",", ":"))
            )
            web_sources = []
            web_meta = {"intent": "comparison", "provider": "comparison_flow"}
        except Exception:
            tool_comparison = None
            web_ctx, web_sources, web_meta = (None, None, None)
    elif intent == "personalized_realtime":
        try:
            forced_gen: Optional[Dict[str, Any]] = None
            try:
                g0 = req.gen if isinstance(req.gen, dict) else {}
                forced_gen = dict(g0)
                web_cfg = forced_gen.get("web_rag")
                if isinstance(web_cfg, dict):
                    forced_gen["web_rag"] = {**web_cfg, "enabled": True}
                else:
                    forced_gen["web_rag"] = {"enabled": True}
            except Exception:
                forced_gen = (req.gen if isinstance(req.gen, dict) else None)

            web_ctx, web_sources, web_meta = await _maybe_web_rag_for_turn(
                message=effective_message,
                gen=forced_gen,
                trace_id=trace_id,
                session_id=session_id,
                user_id=str(user_id),
                persona_db=(SupabasePersonaDB(_supabase) if (_supabase is not None and _is_uuid(str(user_id))) else None),
            )
        except Exception:
            web_ctx, web_sources, web_meta = (None, None, None)

        # Attach a lightweight personalization hint (best-effort; no impact to persona logic).
        try:
            hint_profile: Dict[str, Any] = {"user_id": str(user_id)}
            if _supabase is not None and _is_uuid(str(user_id)):
                try:
                    persona_db2 = SupabasePersonaDB(_supabase)
                    vs = persona_db2.load_last_value_state(user_id=str(user_id))
                    ts = persona_db2.load_last_trait_state(user_id=str(user_id))
                    if vs is not None:
                        hint_profile["value_state"] = vs.to_dict()
                    if ts is not None:
                        hint_profile["trait_state"] = ts.to_dict()
                except Exception:
                    pass

            project_type: Optional[str] = None
            try:
                if isinstance(req.gen, dict):
                    for k in ("project_type", "app", "channel", "client"):
                        v = req.gen.get(k)
                        if isinstance(v, str) and v.strip():
                            project_type = v.strip()
                            break
            except Exception:
                project_type = None

            personalization_hint = {
                "user_profile": hint_profile,
                "project_type": project_type,
            }
        except Exception:
            personalization_hint = None
    elif intent == "realtime_fact":
        try:
            forced_gen: Optional[Dict[str, Any]] = None
            try:
                g0 = req.gen if isinstance(req.gen, dict) else {}
                forced_gen = dict(g0)
                web_cfg = forced_gen.get("web_rag")
                if isinstance(web_cfg, dict):
                    forced_gen["web_rag"] = {**web_cfg, "enabled": True}
                else:
                    forced_gen["web_rag"] = {"enabled": True}
            except Exception:
                forced_gen = (req.gen if isinstance(req.gen, dict) else None)

            web_ctx, web_sources, web_meta = await _maybe_web_rag_for_turn(
                message=effective_message,
                gen=forced_gen,
                trace_id=trace_id,
                session_id=session_id,
                user_id=str(user_id),
                persona_db=(SupabasePersonaDB(_supabase) if (_supabase is not None and _is_uuid(str(user_id))) else None),
            )
        except Exception:
            web_ctx, web_sources, web_meta = (None, None, None)

    preq = PersonaRequest(
        user_id=user_id,
        session_id=session_id,
        message=effective_message,
        context={
            "_trace_id": trace_id,
            "_intent": intent,
            **({"_personalization_hint": personalization_hint} if isinstance(personalization_hint, dict) and personalization_hint else {}),
            **({"_tool_weather": tool_weather} if isinstance(tool_weather, dict) and tool_weather else {}),
            **({"_comparison": tool_comparison} if isinstance(tool_comparison, dict) and tool_comparison else {}),
            **({"character_id": req.character_id} if req.character_id else {}),
            **({"persona_system": external_system} if external_system else {}),
            **({"_external_knowledge": web_ctx} if isinstance(web_ctx, str) and web_ctx.strip() else {}),
            **({"_web_rag_sources": web_sources} if isinstance(web_sources, list) and web_sources else {}),
            **({"_web_rag_meta": web_meta} if isinstance(web_meta, dict) and web_meta else {}),
            **({"gen": req.gen} if isinstance(req.gen, dict) and req.gen else {}),
            **({"client_history": client_history} if client_history else {}),
        },
    )

    phase04_db: Any = None
    phase04_meta: Dict[str, Any] = {}

    # baseline はフロント側（Supabaseの直近snapshot）から渡せるようにする。
    baseline_from_client: Optional[TraitState] = None
    try:
        if isinstance(req.trait_baseline, dict):
            baseline_from_client = TraitState(
                calm=float(req.trait_baseline.get("calm", 0.5)),
                empathy=float(req.trait_baseline.get("empathy", 0.5)),
                curiosity=float(req.trait_baseline.get("curiosity", 0.5)),
            )
    except Exception:
        baseline_from_client = None

    # =========================================================
    # Storage selection
    # - SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY があれば Supabase(Postgres) を正史として使う
    # =========================================================
    if _supabase is not None:
        llm_client = _get_llm_client()
        embedding_model = llm_client

        persona_db = SupabasePersonaDB(_supabase)
        phase04_db = persona_db
        init_states = await _load_supabase_initial_states(persona_db=persona_db, user_id=user_id)

        # Phase02: operator overrides (best-effort). These affect *behavior*, not stored identity directly.
        # - subjectivity_mode: force mode (S0..S3) or "AUTO"
        # - freeze_updates: force drift freeze on this request
        try:
            op = init_states.get("op")
            payload = (op or {}).get("payload") if isinstance(op, dict) else None
            if isinstance(payload, dict):
                mode = payload.get("subjectivity_mode")
                freeze = payload.get("freeze_updates")
                if isinstance(mode, str) and mode.strip():
                    preq.metadata["_operator_subjectivity_mode"] = mode.strip()
                if isinstance(freeze, bool):
                    preq.metadata["_freeze_updates"] = bool(preq.metadata.get("_freeze_updates") or freeze)
        except Exception:
            pass

        # 直近スナップショットから状態を復元（初回は default）
        init_states = await _load_supabase_initial_states(persona_db=persona_db, user_id=user_id)
        init_value = init_states.get("value") if isinstance(init_states.get("value"), ValueState) else ValueState()
        init_trait = init_states.get("trait") if isinstance(init_states.get("trait"), TraitState) else TraitState()
        init_ego: Optional[EgoContinuityState] = None
        try:
            st = init_states.get("ego")
            if isinstance(st, dict):
                init_ego = EgoContinuityState.from_dict(st)
        except Exception:
            init_ego = None

        init_tid: Optional[TemporalIdentityState] = None
        try:
            st = init_states.get("tid")
            if isinstance(st, dict):
                init_tid = TemporalIdentityState.from_dict(st)
        except Exception:
            init_tid = None

        # user_id ごとに EpisodeStore を分離（同一 user の記憶が永続化される）
        episode_store = SupabaseEpisodeStore(_supabase, user_id=user_id)

        # wiring（requestごとに controller を組み立てて、DBの状態を正とする）
        selective_recall = SelectiveRecall(memory_backend=episode_store, embedding_model=embedding_model)
        ambiguity_resolver = AmbiguityResolver(embedding_model=embedding_model)
        episode_merger = EpisodeMerger(memory_backend=episode_store)
        memory_orchestrator = MemoryOrchestrator(
            selective_recall=selective_recall,
            episode_merger=episode_merger,
            ambiguity_resolver=ambiguity_resolver,
        )

        controller = PersonaController(
            config=PersonaControllerConfig(default_user_id=None),
            memory_orchestrator=memory_orchestrator,
            identity_engine=IdentityContinuityEngineV3(),
            value_engine=ValueDriftEngine(),
            trait_engine=TraitDriftEngine(),
            global_fsm=GlobalStateMachine(),
            episode_store=episode_store,
            persona_db=persona_db,
            llm_client=llm_client,
            initial_value_state=init_value,
            initial_trait_state=init_trait,
            initial_trait_baseline=baseline_from_client or init_trait,
            initial_ego_state=init_ego,
            initial_temporal_identity_state=init_tid,
        )

        # Safety は復元状態を使って評価
        safety_layer = _get_safety_layer(embedding_model=embedding_model)
        safety = safety_layer.assess(
            req=preq,
            value_state=init_value,
            trait_state=init_trait,
            memory=None,
        )

        # Safety 監査ログ（任意）
        try:
            _supabase.insert(
                "common_safety_assessments",
                {
                    "trace_id": trace_id,
                    "user_id": user_id,
                    "session_id": session_id,
                    "safety_flag": safety.safety_flag,
                    "risk_score": float(safety.risk_score),
                    "categories": safety.categories,
                    "reasons": safety.reasons,
                    "meta": safety.meta,
                },
            )
        except Exception:
            pass

    else:
        persona_db = _persona_db
        episode_store = _episode_store
        phase04_db = None
        try:
            controller = _get_inmemory_controller()
        except RuntimeError as e:
            # サーバは起動するが、LLMが使えない状態ではAPI呼び出しを明示的に失敗させる
            raise HTTPException(status_code=500, detail=str(e))

        # SafetyLayer は Value/Trait/Memory を受け取れる設計だが、
        # in-memory デモでは「まず追えること」を優先して簡易判定にする。
        llm_client = _get_llm_client()
        safety_layer = _get_safety_layer(embedding_model=llm_client)
        safety = safety_layer.assess(
            req=preq,
            value_state=ValueState(),
            trait_state=TraitState(),
            memory=None,
        )

    # SafetyLayer の数値メタを controller 側でも参照できるように注入
    try:
        if isinstance(getattr(preq, "metadata", None), dict):
            preq.metadata["_safety_risk_score"] = float(getattr(safety, "risk_score", 0.0) or 0.0)
            preq.metadata["_safety_flag"] = getattr(safety, "safety_flag", None)
            preq.metadata["_safety_categories"] = getattr(safety, "categories", {}) or {}
    except Exception:
        pass

    trace_event(
        log,
        trace_id=trace_id,
        event="persona_chat.received",
        fields={
            "user_id": user_id,
            "session_id": session_id,
            "message_len": len(effective_message or ""),
            "message_preview": preview_text(effective_message) if TRACE_INCLUDE_TEXT else "",
            "overload_score": overload_score,
            "safety_flag": safety.safety_flag,
            "risk_score": safety.risk_score,
        },
    )

    result = controller.handle_turn(
        preq,
        user_id=user_id,
        safety_flag=safety.safety_flag,
        overload_score=overload_score,
        reward_signal=req.reward_signal,
        affect_signal=req.affect_signal,
    )

    v0 = _normalize_v0(trace_id=trace_id, controller_meta=result.meta)
    decision_candidates = _normalize_decision_candidates(controller_meta=result.meta, v0=v0)

    try:
        rt = get_phase04_runtime()
        phase04_meta = rt.run_for_turn(
            user_id=user_id,
            session_id=session_id,
            message=effective_message,
            trace_id=trace_id,
            persist=phase04_db,
            attachments=req.attachments if isinstance(req.attachments, list) else None,
        )
    except Exception:
        phase04_meta = {"error": "phase04_failed"}

    meta: Dict[str, Any] = {
        "meta_version": META_VERSION,
        "engine_version": ENGINE_VERSION,
        "build_sha": str(BUILD_SHA),
        "config_hash": str(CONFIG_HASH),
        "trace_id": trace_id,
        "intent": v0.get("intent") or {},
        "dialogue_state": v0.get("dialogue_state") or "UNKNOWN",
        "telemetry": v0.get("telemetry") or {"C": 0.0, "N": 0.0, "M": 0.0, "S": 0.0, "R": 0.0},
        "decision_candidates": decision_candidates,
        "timing_ms": int((time.time() - t0) * 1000),
        "safety": {
            "flag": safety.safety_flag,
            "risk_score": safety.risk_score,
            "total_risk": float((v0.get("safety") or {}).get("total_risk") or 0.0),
            "override": bool((v0.get("safety") or {}).get("override") or False),
            "categories": safety.categories,
            "reasons": safety.reasons,
        },
        "memory": result.memory.raw,
        "identity": result.identity.identity_context,
        "value": {"state": result.value.new_state.to_dict(), "delta": result.value.delta},
        "trait": {
            "state": result.trait.new_state.to_dict(),
            "delta": result.trait.delta,
            "baseline": (result.meta or {}).get("trait_baseline"),
            "baseline_delta": (result.meta or {}).get("trait_baseline_delta"),
        },
        "global_state": result.global_state.to_dict(),
        "v0": v0,
        "controller_meta": result.meta,
        "io": {
            "message_preview": preview_text(req.message) if TRACE_INCLUDE_TEXT else "",
            "reply_preview": preview_text(result.reply_text) if TRACE_INCLUDE_TEXT else "",
        },
        "phase04": phase04_meta,
    }

    # Web RAG observability (best-effort; safe to expose)
    try:
        sources_out: List[Dict[str, Any]] = []
        try:
            if isinstance(web_sources, list):
                for idx, s in enumerate(web_sources, start=1):
                    if not isinstance(s, dict):
                        continue
                    u = str(s.get("final_url") or s.get("url") or "").strip()
                    if not u:
                        continue
                    sources_out.append(
                        {
                            "id": int(idx),
                            "title": str(s.get("title") or "").strip(),
                            "url": u,
                            "confidence": float(s.get("confidence")) if isinstance(s.get("confidence"), (int, float)) else None,
                        }
                    )
        except Exception:
            sources_out = []

        meta["web_rag"] = {
            "enabled": bool(_web_rag_enabled()),
            "injected": bool(isinstance(web_ctx, str) and web_ctx.strip()),
            "sources_count": int(len(web_sources)) if isinstance(web_sources, list) else 0,
            "meta": (web_meta if isinstance(web_meta, dict) else {}),
            "sources": sources_out,
        }
    except Exception:
        pass

    persona_runtime = _extract_persona_runtime_meta(req.gen)
    if persona_runtime:
        meta["persona_runtime"] = persona_runtime

    # Stable compact summary block (v1) for integration/debugging.
    # Always non-null; intentionally excludes raw controller internals.
    meta["meta_v1"] = {
        "trace_id": str(meta.get("trace_id") or trace_id),
        "intent": meta.get("intent") or {},
        "dialogue_state": str(meta.get("dialogue_state") or "UNKNOWN"),
        "telemetry": meta.get("telemetry") or {"C": 0.0, "N": 0.0, "M": 0.0, "S": 0.0, "R": 0.0},
        "safety": {
            "total_risk": float(((meta.get("safety") or {}).get("total_risk") or 0.0)),
            "override": bool(((meta.get("safety") or {}).get("override") or False)),
        },
        "decision_candidates": meta.get("decision_candidates") or [],
    }

    trace_event(
        log,
        trace_id=trace_id,
        event="persona_chat.completed",
        fields={
            "timing_ms": meta["timing_ms"],
            "reply_len": len(result.reply_text or ""),
            "global_state": meta["global_state"].get("state"),
            "memory_pointer_count": meta["memory"].get("initial_pointer_count")
            if isinstance(meta.get("memory"), dict)
            else None,
        },
    )

    return ChatResponse(reply=result.reply_text, meta=meta)


@app.post("/persona/chat/stream")
async def persona_chat_stream(req: ChatRequest, auth: Optional[AuthContext] = Depends(get_auth_context)):
    """
    SSE streaming version of /persona/chat.
    - event: delta -> data: {"text": "..."}
    - event: done  -> data: {"reply": "...", "meta": {...}}
    """

    trace_id = new_trace_id()
    t0 = time.time()

    user_id = (auth.user_id if auth is not None else (req.user_id or DEFAULT_USER_ID))
    session_id = req.session_id or f"{user_id}:{uuid.uuid4().hex}"
    effective_message, client_history = _derive_message_and_history(req)
    external_system = _merge_external_system(req.persona_system, req.system)
    attachments_ctx = _build_attachments_context(attachments=req.attachments, auth=auth)
    if attachments_ctx:
        effective_message = (effective_message + "\n\n" + attachments_ctx).strip()

    overload_score = _estimate_overload_score(effective_message)

    # Intent Router (core-side)
    try:
        from persona_core.intent_router import classify_intent

        intent = classify_intent(effective_message)
    except Exception:
        intent = "general"

    # Fallback: explicit search requests should still trigger Web RAG when enabled.
    try:
        if intent == "general" and _web_rag_enabled() and _web_rag_explicit_request(effective_message):
            intent = "realtime_fact"
    except Exception:
        pass

    web_ctx = None
    web_sources = None
    web_meta = None

    tool_weather = None
    tool_comparison = None
    personalization_hint: Optional[Dict[str, Any]] = None

    if intent == "weather":
        try:
            from persona_core.phase04.tools.weather_api import weather_api_flow

            tool_weather = weather_api_flow(effective_message)
            web_ctx = (
                "External Tool Context (weather_api).\n"
                "Usage rules:\n"
                "- Use this as supporting evidence.\n\n"
                "tool.weather:\n"
                + json.dumps(tool_weather, ensure_ascii=False, separators=(",", ":"))
            )
            web_sources = []
            web_meta = {"intent": "weather", "provider": "weather_api"}
        except Exception:
            tool_weather = None
            web_ctx, web_sources, web_meta = (None, None, None)
    elif intent == "comparison":
        try:
            from persona_core.phase04.tools.comparison_flow import comparison_flow

            tool_comparison = comparison_flow(effective_message)

            safe = {}
            try:
                if isinstance(tool_comparison, dict):
                    ia = tool_comparison.get("item_a") if isinstance(tool_comparison.get("item_a"), dict) else None
                    ib = tool_comparison.get("item_b") if isinstance(tool_comparison.get("item_b"), dict) else None
                    safe = {
                        "item_a": {
                            "name": (ia or {}).get("name"),
                            "summary": ((ia or {}).get("result") or {}).get("summary") if isinstance((ia or {}).get("result"), dict) else None,
                            "key_points": ((ia or {}).get("result") or {}).get("key_points") if isinstance((ia or {}).get("result"), dict) else None,
                        },
                        "item_b": {
                            "name": (ib or {}).get("name"),
                            "summary": ((ib or {}).get("result") or {}).get("summary") if isinstance((ib or {}).get("result"), dict) else None,
                            "key_points": ((ib or {}).get("result") or {}).get("key_points") if isinstance((ib or {}).get("result"), dict) else None,
                        },
                        "differences": tool_comparison.get("differences") if isinstance(tool_comparison.get("differences"), list) else [],
                    }
            except Exception:
                safe = {}

            web_ctx = (
                "External Tool Context (comparison_flow).\n"
                "Usage rules:\n"
                "- Use this as supporting evidence.\n"
                "- Do NOT invent specs not present.\n\n"
                "tool.comparison:\n"
                + json.dumps(safe, ensure_ascii=False, separators=(",", ":"))
            )
            web_sources = []
            web_meta = {"intent": "comparison", "provider": "comparison_flow"}
        except Exception:
            tool_comparison = None
            web_ctx, web_sources, web_meta = (None, None, None)
    elif intent == "personalized_realtime":
        try:
            forced_gen: Optional[Dict[str, Any]] = None
            try:
                g0 = req.gen if isinstance(req.gen, dict) else {}
                forced_gen = dict(g0)
                web_cfg = forced_gen.get("web_rag")
                if isinstance(web_cfg, dict):
                    forced_gen["web_rag"] = {**web_cfg, "enabled": True}
                else:
                    forced_gen["web_rag"] = {"enabled": True}
            except Exception:
                forced_gen = (req.gen if isinstance(req.gen, dict) else None)

            web_ctx, web_sources, web_meta = await _maybe_web_rag_for_turn(
                message=effective_message,
                gen=forced_gen,
                trace_id=trace_id,
                session_id=session_id,
                user_id=str(user_id),
                persona_db=(SupabasePersonaDB(_supabase) if (_supabase is not None and _is_uuid(str(user_id))) else None),
            )
        except Exception:
            web_ctx, web_sources, web_meta = (None, None, None)

        try:
            hint_profile: Dict[str, Any] = {"user_id": str(user_id)}
            if _supabase is not None and _is_uuid(str(user_id)):
                try:
                    persona_db2 = SupabasePersonaDB(_supabase)
                    vs = persona_db2.load_last_value_state(user_id=str(user_id))
                    ts = persona_db2.load_last_trait_state(user_id=str(user_id))
                    if vs is not None:
                        hint_profile["value_state"] = vs.to_dict()
                    if ts is not None:
                        hint_profile["trait_state"] = ts.to_dict()
                except Exception:
                    pass

            project_type: Optional[str] = None
            try:
                if isinstance(req.gen, dict):
                    for k in ("project_type", "app", "channel", "client"):
                        v = req.gen.get(k)
                        if isinstance(v, str) and v.strip():
                            project_type = v.strip()
                            break
            except Exception:
                project_type = None

            personalization_hint = {
                "user_profile": hint_profile,
                "project_type": project_type,
            }
        except Exception:
            personalization_hint = None
    elif intent == "realtime_fact":
        try:
            forced_gen: Optional[Dict[str, Any]] = None
            try:
                g0 = req.gen if isinstance(req.gen, dict) else {}
                forced_gen = dict(g0)
                web_cfg = forced_gen.get("web_rag")
                if isinstance(web_cfg, dict):
                    forced_gen["web_rag"] = {**web_cfg, "enabled": True}
                else:
                    forced_gen["web_rag"] = {"enabled": True}
            except Exception:
                forced_gen = (req.gen if isinstance(req.gen, dict) else None)

            web_ctx, web_sources, web_meta = await _maybe_web_rag_for_turn(
                message=effective_message,
                gen=forced_gen,
                trace_id=trace_id,
                session_id=session_id,
                user_id=str(user_id),
                persona_db=(SupabasePersonaDB(_supabase) if (_supabase is not None and _is_uuid(str(user_id))) else None),
            )
        except Exception:
            web_ctx, web_sources, web_meta = (None, None, None)

    preq = PersonaRequest(
        user_id=user_id,
        session_id=session_id,
        message=effective_message,
        context={
            "_trace_id": trace_id,
            "_intent": intent,
            **({"_personalization_hint": personalization_hint} if isinstance(personalization_hint, dict) and personalization_hint else {}),
            **({"_tool_weather": tool_weather} if isinstance(tool_weather, dict) and tool_weather else {}),
            **({"_comparison": tool_comparison} if isinstance(tool_comparison, dict) and tool_comparison else {}),
            **({"character_id": req.character_id} if req.character_id else {}),
            **({"persona_system": external_system} if external_system else {}),
            **({"_external_knowledge": web_ctx} if isinstance(web_ctx, str) and web_ctx.strip() else {}),
            **({"_web_rag_sources": web_sources} if isinstance(web_sources, list) and web_sources else {}),
            **({"_web_rag_meta": web_meta} if isinstance(web_meta, dict) and web_meta else {}),
            **({"gen": req.gen} if isinstance(req.gen, dict) and req.gen else {}),
            **({"client_history": client_history} if client_history else {}),
        },
    )

    phase04_db: Any = None

    baseline_from_client: Optional[TraitState] = None
    try:
        if isinstance(req.trait_baseline, dict):
            baseline_from_client = TraitState(
                calm=float(req.trait_baseline.get("calm", 0.5)),
                empathy=float(req.trait_baseline.get("empathy", 0.5)),
                curiosity=float(req.trait_baseline.get("curiosity", 0.5)),
            )
    except Exception:
        baseline_from_client = None

    # wire controller (same as /persona/chat)
    if _supabase is not None:
        llm_client = _get_llm_client()
        embedding_model = llm_client
        persona_db = SupabasePersonaDB(_supabase)
        phase04_db = persona_db
        init_states = await _load_supabase_initial_states(persona_db=persona_db, user_id=user_id)

        # Phase02: operator overrides (best-effort)
        try:
            op = init_states.get("op")
            payload = (op or {}).get("payload") if isinstance(op, dict) else None
            if isinstance(payload, dict):
                mode = payload.get("subjectivity_mode")
                freeze = payload.get("freeze_updates")
                if isinstance(mode, str) and mode.strip():
                    preq.metadata["_operator_subjectivity_mode"] = mode.strip()
                if isinstance(freeze, bool):
                    preq.metadata["_freeze_updates"] = bool(preq.metadata.get("_freeze_updates") or freeze)
        except Exception:
            pass

        init_value = init_states.get("value") if isinstance(init_states.get("value"), ValueState) else ValueState()
        init_trait = init_states.get("trait") if isinstance(init_states.get("trait"), TraitState) else TraitState()
        init_ego: Optional[EgoContinuityState] = None
        try:
            st = init_states.get("ego")
            if isinstance(st, dict):
                init_ego = EgoContinuityState.from_dict(st)
        except Exception:
            init_ego = None
        init_tid: Optional[TemporalIdentityState] = None
        try:
            st = init_states.get("tid")
            if isinstance(st, dict):
                init_tid = TemporalIdentityState.from_dict(st)
        except Exception:
            init_tid = None
        episode_store = SupabaseEpisodeStore(_supabase, user_id=user_id)

        selective_recall = SelectiveRecall(memory_backend=episode_store, embedding_model=embedding_model)
        ambiguity_resolver = AmbiguityResolver(embedding_model=embedding_model)
        episode_merger = EpisodeMerger(memory_backend=episode_store)
        memory_orchestrator = MemoryOrchestrator(
            selective_recall=selective_recall,
            episode_merger=episode_merger,
            ambiguity_resolver=ambiguity_resolver,
        )

        controller = PersonaController(
            config=PersonaControllerConfig(default_user_id=None),
            memory_orchestrator=memory_orchestrator,
            identity_engine=IdentityContinuityEngineV3(),
            value_engine=ValueDriftEngine(),
            trait_engine=TraitDriftEngine(),
            global_fsm=GlobalStateMachine(),
            episode_store=episode_store,
            persona_db=persona_db,
            llm_client=llm_client,
            initial_value_state=init_value,
            initial_trait_state=init_trait,
            initial_trait_baseline=baseline_from_client or init_trait,
            initial_ego_state=init_ego,
            initial_temporal_identity_state=init_tid,
        )

        safety_layer = _get_safety_layer(embedding_model=embedding_model)
        safety = safety_layer.assess(
            req=preq,
            value_state=init_value,
            trait_state=init_trait,
            memory=None,
        )

    else:
        try:
            controller = _get_inmemory_controller()
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e))

        llm_client = _get_llm_client()
        safety_layer = _get_safety_layer(embedding_model=llm_client)
        safety = safety_layer.assess(
            req=preq,
            value_state=ValueState(),
            trait_state=TraitState(),
            memory=None,
        )
        phase04_db = None

    # SafetyLayer の数値メタを controller 側でも参照できるように注入
    try:
        if isinstance(getattr(preq, "metadata", None), dict):
            preq.metadata["_safety_risk_score"] = float(getattr(safety, "risk_score", 0.0) or 0.0)
            preq.metadata["_safety_flag"] = getattr(safety, "safety_flag", None)
            preq.metadata["_safety_categories"] = getattr(safety, "categories", {}) or {}
    except Exception:
        pass

    def _sse(event: str, data: Any) -> str:
        payload = json.dumps(data, ensure_ascii=False)
        return f"event: {event}\ndata: {payload}\n\n"

    def event_stream():
        try:
            # start (trace id)
            yield _sse("start", {"trace_id": trace_id, "session_id": session_id})

            reply_parts: List[str] = []
            for ev in controller.handle_turn_stream(
                preq,
                user_id=user_id,
                safety_flag=safety.safety_flag,
                overload_score=overload_score,
                reward_signal=req.reward_signal,
                affect_signal=req.affect_signal,
                defer_persistence=True,
            ):
                if ev.get("type") == "delta":
                    text = str(ev.get("text") or "")
                    if text:
                        reply_parts.append(text)
                        yield _sse("delta", {"text": text})
                elif ev.get("type") == "done":
                    result = ev.get("result")
                    reply_text = (getattr(result, "reply_text", None) or "").strip()

                    v0 = _normalize_v0(trace_id=trace_id, controller_meta=getattr(result, "meta", None))
                    decision_candidates = _normalize_decision_candidates(
                        controller_meta=getattr(result, "meta", None), v0=v0
                    )

                    meta: Dict[str, Any] = {
                        "meta_version": META_VERSION,
                        "engine_version": ENGINE_VERSION,
                        "build_sha": str(BUILD_SHA),
                        "config_hash": str(CONFIG_HASH),
                        "trace_id": trace_id,
                        "intent": v0.get("intent") or {},
                        "dialogue_state": v0.get("dialogue_state") or "UNKNOWN",
                        "telemetry": v0.get("telemetry") or {"C": 0.0, "N": 0.0, "M": 0.0, "S": 0.0, "R": 0.0},
                        "decision_candidates": decision_candidates,
                        "timing_ms": int((time.time() - t0) * 1000),
                        "safety": {
                            "flag": safety.safety_flag,
                            "risk_score": safety.risk_score,
                            "total_risk": float((v0.get("safety") or {}).get("total_risk") or 0.0),
                            "override": bool((v0.get("safety") or {}).get("override") or False),
                            "categories": safety.categories,
                            "reasons": safety.reasons,
                        },
                        "memory": result.memory.raw,
                        "identity": result.identity.identity_context,
                        "value": {
                            "state": result.value.new_state.to_dict(),
                            "delta": result.value.delta,
                        },
                        "trait": {
                            "state": result.trait.new_state.to_dict(),
                            "delta": result.trait.delta,
                            "baseline": (result.meta or {}).get("trait_baseline"),
                            "baseline_delta": (result.meta or {}).get("trait_baseline_delta"),
                        },
                        "global_state": result.global_state.to_dict(),
                        "v0": v0,
                        "controller_meta": result.meta,
                        "io": {
                            "message_preview": preview_text(effective_message) if TRACE_INCLUDE_TEXT else "",
                            "reply_preview": preview_text(reply_text) if TRACE_INCLUDE_TEXT else "",
                        },
                        "phase04": None,
                    }

                    try:
                        rt = get_phase04_runtime()
                        meta["phase04"] = rt.run_for_turn(
                            user_id=user_id,
                            session_id=session_id,
                            message=effective_message,
                            trace_id=trace_id,
                            persist=phase04_db,
                            attachments=req.attachments if isinstance(req.attachments, list) else None,
                        )
                    except Exception:
                        meta["phase04"] = {"error": "phase04_failed"}

                    persona_runtime = _extract_persona_runtime_meta(req.gen)
                    if persona_runtime:
                        meta["persona_runtime"] = persona_runtime

                    # Web RAG observability (best-effort; safe to expose)
                    try:
                        sources_out: List[Dict[str, Any]] = []
                        try:
                            if isinstance(web_sources, list):
                                for idx, s in enumerate(web_sources, start=1):
                                    if not isinstance(s, dict):
                                        continue
                                    u = str(s.get("final_url") or s.get("url") or "").strip()
                                    if not u:
                                        continue
                                    sources_out.append(
                                        {
                                            "id": int(idx),
                                            "title": str(s.get("title") or "").strip(),
                                            "url": u,
                                            "confidence": float(s.get("confidence")) if isinstance(s.get("confidence"), (int, float)) else None,
                                        }
                                    )
                        except Exception:
                            sources_out = []

                        meta["web_rag"] = {
                            "enabled": bool(_web_rag_enabled()),
                            "injected": bool(isinstance(web_ctx, str) and web_ctx.strip()),
                            "sources_count": int(len(web_sources)) if isinstance(web_sources, list) else 0,
                            "meta": (web_meta if isinstance(web_meta, dict) else {}),
                            "sources": sources_out,
                        }
                    except Exception:
                        pass

                    meta["meta_v1"] = {
                        "trace_id": str(meta.get("trace_id") or trace_id),
                        "intent": meta.get("intent") or {},
                        "dialogue_state": str(meta.get("dialogue_state") or "UNKNOWN"),
                        "telemetry": meta.get("telemetry")
                        or {"C": 0.0, "N": 0.0, "M": 0.0, "S": 0.0, "R": 0.0},
                        "safety": {
                            "total_risk": float(((meta.get("safety") or {}).get("total_risk") or 0.0)),
                            "override": bool(((meta.get("safety") or {}).get("override") or False)),
                        },
                        "decision_candidates": meta.get("decision_candidates") or [],
                    }

                    yield _sse("done", {"reply": reply_text, "meta": meta})
        except Exception as e:
            log.exception("persona_chat_stream failed")
            yield _sse("error", {"error": str(e), "trace_id": trace_id})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/io/upload", response_model=UploadResponse)
async def io_upload(
    file: UploadFile = File(...),
    auth: Optional[AuthContext] = Depends(get_auth_context),
    x_sigmaris_trace_id: Optional[str] = Header(default=None, alias="x-sigmaris-trace-id"),
    x_sigmaris_session_id: Optional[str] = Header(default=None, alias="x-sigmaris-session-id"),
):
    """
    Phase04 MVP: upload raw bytes separately from chat.
    - If Supabase is configured, stores bytes in Supabase Storage and metadata in `common_attachments`.
    - Otherwise, stores to local disk (demo fallback).
    - Returns an attachment_id for subsequent /io/parse.
    """
    if auth is None and _auth_required:
        raise HTTPException(status_code=401, detail="Unauthorized")

    trace_id = str((x_sigmaris_trace_id or "").strip() or new_trace_id())
    session_id = str((x_sigmaris_session_id or "").strip() or "") or None

    max_bytes = int(os.getenv("SIGMARIS_UPLOAD_MAX_BYTES", "5242880") or "5242880")  # 5MB
    data = await file.read()
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail="File too large")

    attachment_id = uuid.uuid4().hex
    file_name = file.filename or ""
    mime_type = file.content_type or "application/octet-stream"

    sha256_hex = None
    try:
        sha256_hex = hashlib.sha256(data).hexdigest()
    except Exception:
        sha256_hex = None

    # Prefer Supabase Storage when available.
    if _supabase is not None and _storage is not None and auth is not None:
        persona_db = SupabasePersonaDB(_supabase)
        object_path = f"{auth.user_id}/{attachment_id}"
        try:
            _storage.upload(
                bucket_id=_storage_bucket,
                object_path=object_path,
                data=data,
                content_type=mime_type,
                upsert=True,
            )
            persona_db.insert_attachment(
                attachment_id=attachment_id,
                user_id=auth.user_id,
                bucket_id=_storage_bucket,
                object_path=object_path,
                file_name=file_name,
                mime_type=mime_type,
                size_bytes=int(len(data)),
                sha256=sha256_hex,
                meta={},
            )
            try:
                if _is_uuid(str(auth.user_id)):
                    persona_db.insert_io_event(
                        user_id=str(auth.user_id),
                        session_id=session_id,
                        trace_id=trace_id,
                        event_type="upload",
                        cache_key=None,
                        ok=True,
                        error=None,
                        request={"file_name": file_name, "mime_type": mime_type, "size_bytes": int(len(data)), "sha256": sha256_hex},
                        response={"attachment_id": attachment_id, "bucket_id": _storage_bucket, "object_path": object_path},
                        source_urls=[],
                        content_sha256=sha256_hex,
                        meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA, "storage": "supabase"},
                    )
            except Exception:
                pass
        except (SupabaseStorageError, Exception) as e:
            try:
                if _is_uuid(str(auth.user_id)):
                    persona_db.insert_io_event(
                        user_id=str(auth.user_id),
                        session_id=session_id,
                        trace_id=trace_id,
                        event_type="upload",
                        cache_key=None,
                        ok=False,
                        error=str(e),
                        request={"file_name": file_name, "mime_type": mime_type, "size_bytes": int(len(data)), "sha256": sha256_hex},
                        response={},
                        source_urls=[],
                        content_sha256=sha256_hex,
                        meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA, "storage": "supabase"},
                    )
            except Exception:
                pass
            raise HTTPException(status_code=502, detail=f"storage upload failed: {e}")

        return UploadResponse(
            attachment_id=attachment_id,
            file_name=file_name,
            mime_type=mime_type,
            size=int(len(data)),
        )

    # Demo fallback: local disk
    base_dir = os.getenv("SIGMARIS_UPLOAD_DIR") or os.path.join("sigmaris_core", "data", "uploads")
    os.makedirs(base_dir, exist_ok=True)
    path = os.path.join(base_dir, attachment_id)
    meta_path = path + ".json"

    try:
        with open(path, "wb") as f:
            f.write(data)
        meta = {
            "attachment_id": attachment_id,
            "user_id": (auth.user_id if auth is not None else None),
            "file_name": file_name,
            "mime_type": mime_type,
            "size": int(len(data)),
            "sha256": sha256_hex,
        }
        with open(meta_path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"upload failed: {e}")

    return UploadResponse(
        attachment_id=attachment_id,
        file_name=file_name,
        mime_type=mime_type,
        size=int(len(data)),
    )


@app.post("/io/parse", response_model=ParseResponse)
async def io_parse(
    req: ParseRequest,
    auth: Optional[AuthContext] = Depends(get_auth_context),
    x_sigmaris_trace_id: Optional[str] = Header(default=None, alias="x-sigmaris-trace-id"),
    x_sigmaris_session_id: Optional[str] = Header(default=None, alias="x-sigmaris-session-id"),
):
    """
    Phase04 MVP: parse uploaded content into bounded structured representations.
    """
    if auth is None and _auth_required:
        raise HTTPException(status_code=401, detail="Unauthorized")

    trace_id = str((x_sigmaris_trace_id or "").strip() or new_trace_id())
    session_id = str((x_sigmaris_session_id or "").strip() or "") or None

    from persona_core.phase04.parsing.file_parser import parse_file_bytes  # local import to keep startup light

    # Prefer Supabase Storage when available.
    if _supabase is not None and _storage is not None and auth is not None:
        persona_db = SupabasePersonaDB(_supabase)
        row = None
        try:
            row = persona_db.load_attachment(attachment_id=str(req.attachment_id))
        except Exception:
            row = None
        if not row:
            raise HTTPException(status_code=404, detail="attachment not found")
        owner = row.get("user_id")
        if owner and str(owner) != str(auth.user_id):
            raise HTTPException(status_code=403, detail="Forbidden")
        bucket_id = str(row.get("bucket_id") or _storage_bucket)
        object_path = str(row.get("object_path") or "")
        if not object_path:
            raise HTTPException(status_code=500, detail="attachment missing object_path")

        try:
            data = _storage.download(bucket_id=bucket_id, object_path=object_path)
        except (SupabaseStorageError, Exception) as e:
            try:
                if _is_uuid(str(auth.user_id)):
                    persona_db.insert_io_event(
                        user_id=str(auth.user_id),
                        session_id=session_id,
                        trace_id=trace_id,
                        event_type="parse",
                        cache_key=None,
                        ok=False,
                        error=str(e),
                        request={"attachment_id": str(req.attachment_id), "kind": req.kind},
                        response={},
                        source_urls=[],
                        content_sha256=None,
                        meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA, "storage": "supabase"},
                    )
            except Exception:
                pass
            raise HTTPException(status_code=502, detail=f"storage download failed: {e}")

        parsed_kind, parsed = parse_file_bytes(
            data=data,
            file_name=str(row.get("file_name") or ""),
            mime_type=str(row.get("mime_type") or ""),
            kind=req.kind,
        )
        try:
            if _is_uuid(str(auth.user_id)):
                parsed_excerpt = ""
                if isinstance(parsed, dict):
                    for k in ("raw_excerpt", "text", "summary"):
                        v = parsed.get(k)
                        if isinstance(v, str) and v.strip():
                            parsed_excerpt = v.strip()
                            break
                if parsed_excerpt and _io_audit_excerpt_chars() > 0:
                    parsed_excerpt = parsed_excerpt[: _io_audit_excerpt_chars()]
                else:
                    parsed_excerpt = ""
                persona_db.insert_io_event(
                    user_id=str(auth.user_id),
                    session_id=session_id,
                    trace_id=trace_id,
                    event_type="parse",
                    cache_key=None,
                    ok=True,
                    error=None,
                    request={"attachment_id": str(req.attachment_id), "kind": req.kind},
                    response={"kind": parsed_kind, "excerpt": parsed_excerpt, "sha256": _sha256_json(parsed) if isinstance(parsed, dict) else None},
                    source_urls=[],
                    content_sha256=_sha256_json(parsed) if isinstance(parsed, dict) else None,
                    meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA, "storage": "supabase"},
                )
        except Exception:
            pass

        return ParseResponse(ok=True, kind=parsed_kind, parsed=parsed)

    # Demo fallback: local disk
    base_dir = os.getenv("SIGMARIS_UPLOAD_DIR") or os.path.join("sigmaris_core", "data", "uploads")
    path = os.path.join(base_dir, str(req.attachment_id))
    meta_path = path + ".json"
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="attachment not found")

    file_name = str(req.attachment_id)
    mime_type = "application/octet-stream"
    try:
        if os.path.exists(meta_path):
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f) or {}
            file_name = str(meta.get("file_name") or file_name)
            mime_type = str(meta.get("mime_type") or mime_type)
    except Exception:
        pass

    try:
        with open(path, "rb") as f:
            data = f.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"parse failed: {e}")

    parsed_kind, parsed = parse_file_bytes(data=data, file_name=file_name, mime_type=mime_type, kind=req.kind)
    return ParseResponse(ok=True, kind=parsed_kind, parsed=parsed)


@app.get("/io/attachment/{attachment_id}")
async def io_attachment_get(
    attachment_id: str,
    auth: Optional[AuthContext] = Depends(get_auth_context),
    x_sigmaris_trace_id: Optional[str] = Header(default=None, alias="x-sigmaris-trace-id"),
    x_sigmaris_session_id: Optional[str] = Header(default=None, alias="x-sigmaris-session-id"),
):
    """
    Phase04 MVP: download an uploaded attachment.
    - When Supabase Storage is configured, downloads from the stored bucket/object_path.
    - Otherwise, reads from local disk (demo fallback).
    """
    if auth is None and _auth_required:
        raise HTTPException(status_code=401, detail="Unauthorized")

    trace_id = str((x_sigmaris_trace_id or "").strip() or new_trace_id())
    session_id = str((x_sigmaris_session_id or "").strip() or "") or None

    # Prefer Supabase Storage when available.
    if _supabase is not None and _storage is not None and auth is not None:
        persona_db = SupabasePersonaDB(_supabase)
        row = None
        try:
            row = persona_db.load_attachment(attachment_id=str(attachment_id))
        except Exception:
            row = None
        if not row:
            raise HTTPException(status_code=404, detail="attachment not found")
        owner = row.get("user_id")
        if owner and str(owner) != str(auth.user_id):
            raise HTTPException(status_code=403, detail="Forbidden")

        bucket_id = str(row.get("bucket_id") or _storage_bucket)
        object_path = str(row.get("object_path") or "")
        if not object_path:
            raise HTTPException(status_code=500, detail="attachment missing object_path")

        try:
            data = _storage.download(bucket_id=bucket_id, object_path=object_path)
        except (SupabaseStorageError, Exception) as e:
            raise HTTPException(status_code=502, detail=f"storage download failed: {e}")

        mime_type = str(row.get("mime_type") or "application/octet-stream")
        file_name = str(row.get("file_name") or f"{attachment_id}")

        try:
            if _is_uuid(str(auth.user_id)):
                persona_db.insert_io_event(
                    user_id=str(auth.user_id),
                    session_id=session_id,
                    trace_id=trace_id,
                    event_type="download",
                    cache_key=None,
                    ok=True,
                    error=None,
                    request={"attachment_id": str(attachment_id)},
                    response={"mime_type": mime_type, "file_name": file_name, "bucket_id": bucket_id, "object_path": object_path},
                    source_urls=[],
                    content_sha256=None,
                    meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA, "storage": "supabase"},
                )
        except Exception:
            pass

        return Response(
            content=data,
            media_type=mime_type,
            headers={
                "x-sigmaris-file-name": file_name,
                "Content-Disposition": f'inline; filename="{file_name}"',
            },
        )

    # Demo fallback: local disk
    base_dir = os.getenv("SIGMARIS_UPLOAD_DIR") or os.path.join("sigmaris_core", "data", "uploads")
    path = os.path.join(base_dir, str(attachment_id))
    meta_path = path + ".json"
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="attachment not found")

    file_name = str(attachment_id)
    mime_type = "application/octet-stream"
    try:
        if os.path.exists(meta_path):
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f) or {}
            file_name = str(meta.get("file_name") or file_name)
            mime_type = str(meta.get("mime_type") or mime_type)
    except Exception:
        pass

    try:
        with open(path, "rb") as f:
            data = f.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"download failed: {e}")

    return Response(
        content=data,
        media_type=mime_type,
        headers={
            "x-sigmaris-file-name": file_name,
            "Content-Disposition": f'inline; filename="{file_name}"',
        },
    )

@app.post("/io/web/search", response_model=WebSearchResponse)
async def io_web_search(
    req: WebSearchRequest,
    auth: Optional[AuthContext] = Depends(get_auth_context),
    x_sigmaris_trace_id: Optional[str] = Header(default=None, alias="x-sigmaris-trace-id"),
    x_sigmaris_session_id: Optional[str] = Header(default=None, alias="x-sigmaris-session-id"),
):
    """
    Phase04 MVP: web search via an explicit provider (no scraping).
    """
    if auth is None and _auth_required:
        raise HTTPException(status_code=401, detail="Unauthorized")

    from persona_core.phase04.io.web_search import get_web_search_provider, WebSearchError

    provider = get_web_search_provider()
    if provider is None:
        raise HTTPException(status_code=501, detail="web search provider not configured")

    trace_id = str((x_sigmaris_trace_id or "").strip() or new_trace_id())
    session_id = str((x_sigmaris_session_id or "").strip() or "") or None
    user_id = str(auth.user_id) if auth is not None else None

    request_payload = {
        "query": req.query,
        "max_results": int(req.max_results),
        "recency_days": int(req.recency_days) if req.recency_days is not None else None,
        "safe_search": str(req.safe_search or "active"),
        "domains": list(req.domains or []),
    }
    ck = _cache_key(event_type="web_search", request_payload=request_payload)

    persona_db = SupabasePersonaDB(_supabase) if (_supabase is not None and user_id and _is_uuid(user_id)) else None
    if persona_db is not None and _io_cache_enabled():
        ttl = _io_cache_ttl_sec()
        if ttl > 0:
            not_before = (datetime.now(timezone.utc) - timedelta(seconds=int(ttl))).isoformat()
            try:
                cached = persona_db.load_cached_io_event(
                    user_id=user_id,
                    event_type="web_search",
                    cache_key=ck,
                    not_before_iso=not_before,
                )
            except Exception:
                cached = None
            if isinstance(cached, dict):
                resp = cached.get("response") if isinstance(cached.get("response"), dict) else {}
                results = resp.get("results") if isinstance(resp.get("results"), list) else None
                if isinstance(results, list):
                    try:
                        persona_db.insert_io_event(
                            user_id=user_id,
                            session_id=session_id,
                            trace_id=trace_id,
                            event_type="web_search",
                            cache_key=ck,
                            ok=True,
                            error=None,
                            request=request_payload,
                            response={"results": results, "cache_hit": True},
                            source_urls=[str(r.get("url") or "") for r in results if isinstance(r, dict) and r.get("url")],
                            content_sha256=_sha256_json({"results": results}),
                            meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA, "cache_hit": True},
                        )
                    except Exception:
                        pass
                    return WebSearchResponse(ok=True, results=results)

    try:
        results = provider.search(
            query=req.query,
            max_results=req.max_results,
            recency_days=req.recency_days,
            safe_search=req.safe_search,
            domains=req.domains,
        )
        out = [r.to_dict() for r in results]
        if persona_db is not None:
            try:
                persona_db.insert_io_event(
                    user_id=user_id,
                    session_id=session_id,
                    trace_id=trace_id,
                    event_type="web_search",
                    cache_key=ck,
                    ok=True,
                    error=None,
                    request=request_payload,
                    response={"results": out},
                    source_urls=[str(r.get("url") or "") for r in out if isinstance(r, dict) and r.get("url")],
                    content_sha256=_sha256_json({"results": out}),
                    meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA, "provider": "serper"},
                )
            except Exception:
                pass
        return WebSearchResponse(ok=True, results=out)
    except WebSearchError as e:
        if persona_db is not None:
            try:
                persona_db.insert_io_event(
                    user_id=user_id,
                    session_id=session_id,
                    trace_id=trace_id,
                    event_type="web_search",
                    cache_key=ck,
                    ok=False,
                    error=str(e),
                    request=request_payload,
                    response={},
                    source_urls=[],
                    content_sha256=None,
                    meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA, "provider": "serper"},
                )
            except Exception:
                pass
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/io/web/fetch", response_model=WebFetchResponse)
async def io_web_fetch(
    req: WebFetchRequest,
    auth: Optional[AuthContext] = Depends(get_auth_context),
    x_sigmaris_trace_id: Optional[str] = Header(default=None, alias="x-sigmaris-trace-id"),
    x_sigmaris_session_id: Optional[str] = Header(default=None, alias="x-sigmaris-session-id"),
):
    """
    Phase04: fetch a web page (allowlist required) and optionally summarize.
    This endpoint is designed for public deployments: it includes SSRF guards.
    """
    if auth is None and _auth_required:
        raise HTTPException(status_code=401, detail="Unauthorized")

    from persona_core.phase04.io.web_fetch import fetch_url, WebFetchError

    trace_id = str((x_sigmaris_trace_id or "").strip() or new_trace_id())
    session_id = str((x_sigmaris_session_id or "").strip() or "") or None
    user_id = str(auth.user_id) if auth is not None else None

    request_payload = {
        "url": str(req.url or ""),
        "summarize": bool(req.summarize),
        "max_chars": int(req.max_chars or 12000),
    }
    ck = _cache_key(event_type="web_fetch", request_payload=request_payload)
    persona_db = SupabasePersonaDB(_supabase) if (_supabase is not None and user_id and _is_uuid(user_id)) else None

    if persona_db is not None and _io_cache_enabled():
        ttl = _io_cache_ttl_sec()
        if ttl > 0:
            not_before = (datetime.now(timezone.utc) - timedelta(seconds=int(ttl))).isoformat()
            try:
                cached = persona_db.load_cached_io_event(
                    user_id=user_id,
                    event_type="web_fetch",
                    cache_key=ck,
                    not_before_iso=not_before,
                )
            except Exception:
                cached = None
            if isinstance(cached, dict):
                resp = cached.get("response") if isinstance(cached.get("response"), dict) else {}
                if resp.get("url") and resp.get("text_excerpt") is not None:
                    try:
                        persona_db.insert_io_event(
                            user_id=user_id,
                            session_id=session_id,
                            trace_id=trace_id,
                            event_type="web_fetch",
                            cache_key=ck,
                            ok=True,
                            error=None,
                            request=request_payload,
                            response={**resp, "cache_hit": True},
                            source_urls=list(cached.get("source_urls") or []),
                            content_sha256=str(cached.get("content_sha256") or "") or None,
                            meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA, "cache_hit": True},
                        )
                    except Exception:
                        pass
                    return WebFetchResponse(
                        ok=True,
                        url=str(resp.get("url") or ""),
                        final_url=str(resp.get("final_url") or ""),
                        title=str(resp.get("title") or ""),
                        summary=(str(resp.get("summary")) if resp.get("summary") is not None else None),
                        key_points=(resp.get("key_points") if isinstance(resp.get("key_points"), list) else None),
                        entities=(resp.get("entities") if isinstance(resp.get("entities"), list) else None),
                        confidence=(float(resp.get("confidence")) if isinstance(resp.get("confidence"), (int, float)) else None),
                        text_excerpt=(str(resp.get("text_excerpt")) if resp.get("text_excerpt") is not None else None),
                        sources=(resp.get("sources") if isinstance(resp.get("sources"), list) else []),
                    )

    try:
        fr = fetch_url(
            url=req.url,
            timeout_sec=int(os.getenv("SIGMARIS_WEB_FETCH_TIMEOUT_SEC", "20") or "20"),
            max_bytes=int(os.getenv("SIGMARIS_WEB_FETCH_MAX_BYTES", "1500000") or "1500000"),
            user_agent=os.getenv("SIGMARIS_WEB_FETCH_USER_AGENT", "sigmaris-core-web-fetch/1.0"),
        )
    except WebFetchError as e:
        # Map errors to appropriate HTTP statuses for easier debugging:
        # - allowlist/SSRF guard -> 403
        # - invalid URL shape -> 422
        # - origin-side HTTP failure -> 502
        # - too large -> 413
        msg = str(e)
        try:
            log.warning("[io/web/fetch] blocked url=%s err=%s", str(req.url), msg)
        except Exception:
            pass

        if msg.startswith("origin_http:") or msg.startswith("request_failed:"):
            if persona_db is not None:
                try:
                    persona_db.insert_io_event(
                        user_id=user_id,
                        session_id=session_id,
                        trace_id=trace_id,
                        event_type="web_fetch",
                        cache_key=ck,
                        ok=False,
                        error=msg,
                        request=request_payload,
                        response={},
                        source_urls=[],
                        content_sha256=None,
                        meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA},
                    )
                except Exception:
                    pass
            raise HTTPException(status_code=502, detail=msg)
        if "response too large" in msg:
            if persona_db is not None:
                try:
                    persona_db.insert_io_event(
                        user_id=user_id,
                        session_id=session_id,
                        trace_id=trace_id,
                        event_type="web_fetch",
                        cache_key=ck,
                        ok=False,
                        error=msg,
                        request=request_payload,
                        response={},
                        source_urls=[],
                        content_sha256=None,
                        meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA},
                    )
                except Exception:
                    pass
            raise HTTPException(status_code=413, detail=msg)
        if msg in ("empty url", "only http/https supported", "missing host"):
            if persona_db is not None:
                try:
                    persona_db.insert_io_event(
                        user_id=user_id,
                        session_id=session_id,
                        trace_id=trace_id,
                        event_type="web_fetch",
                        cache_key=ck,
                        ok=False,
                        error=msg,
                        request=request_payload,
                        response={},
                        source_urls=[],
                        content_sha256=None,
                        meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA},
                    )
                except Exception:
                    pass
            raise HTTPException(status_code=422, detail=msg)
        if persona_db is not None:
            try:
                persona_db.insert_io_event(
                    user_id=user_id,
                    session_id=session_id,
                    trace_id=trace_id,
                    event_type="web_fetch",
                    cache_key=ck,
                    ok=False,
                    error=msg,
                    request=request_payload,
                    response={},
                    source_urls=[],
                    content_sha256=None,
                    meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA},
                )
            except Exception:
                pass
        raise HTTPException(status_code=403, detail=msg)

    text = (fr.text or "").strip()
    max_chars = int(req.max_chars or 12000)
    if max_chars < 1000:
        max_chars = 1000
    if max_chars > 40000:
        max_chars = 40000
    excerpt = text[:max_chars]

    summary = None
    key_points = None
    entities = None
    confidence = None

    if bool(req.summarize):
        try:
            from persona_core.phase04.io.web_summarize import summarize_text, WebSummarizeError

            sr = summarize_text(url=fr.final_url or fr.url, title=fr.title or "", text=excerpt)
            summary = sr.get("summary")
            key_points = sr.get("key_points")
            entities = sr.get("entities")
            confidence = sr.get("confidence")
        except WebSummarizeError:
            summary = None
        except Exception:
            summary = None

    sources = [
        {
            "url": fr.url,
            "final_url": fr.final_url,
            "title": fr.title,
            "content_type": (fr.meta or {}).get("content_type"),
        }
    ]

    if persona_db is not None:
        try:
            audit_chars = _io_audit_excerpt_chars()
            audit_excerpt = excerpt[:audit_chars] if (audit_chars > 0 and excerpt) else ""
            resp_payload: Dict[str, Any] = {
                "url": fr.url,
                "final_url": fr.final_url,
                "title": fr.title,
                "summary": summary,
                "key_points": key_points if isinstance(key_points, list) else None,
                "entities": entities if isinstance(entities, list) else None,
                "confidence": float(confidence) if isinstance(confidence, (int, float)) else None,
                "text_excerpt": audit_excerpt,
                "sources": sources,
            }
            persona_db.insert_io_event(
                user_id=user_id,
                session_id=session_id,
                trace_id=trace_id,
                event_type="web_fetch",
                cache_key=ck,
                ok=True,
                error=None,
                request=request_payload,
                response=resp_payload,
                source_urls=[str(fr.final_url or fr.url)],
                content_sha256=_sha256_json(resp_payload),
                meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA, "audit_excerpt_chars": audit_chars},
            )
        except Exception:
            pass

    return WebFetchResponse(
        ok=True,
        url=fr.url,
        final_url=fr.final_url,
        title=fr.title,
        summary=summary,
        key_points=key_points if isinstance(key_points, list) else None,
        entities=entities if isinstance(entities, list) else None,
        confidence=float(confidence) if isinstance(confidence, (int, float)) else None,
        text_excerpt=excerpt if excerpt else None,
        sources=sources,
    )


@app.post("/io/web/rag", response_model=WebRagResponse)
async def io_web_rag(
    req: WebRagRequest,
    auth: Optional[AuthContext] = Depends(get_auth_context),
    x_sigmaris_trace_id: Optional[str] = Header(default=None, alias="x-sigmaris-trace-id"),
    x_sigmaris_session_id: Optional[str] = Header(default=None, alias="x-sigmaris-session-id"),
):
    """
    Phase04 IO: high-quality Web RAG (search -> bounded crawl -> extract -> (optional) summarize -> ranked context).

    Notes:
    - Fetch is guarded by SIGMARIS_WEB_FETCH_ALLOW_DOMAINS (SSRF + allowlist).
    - Additional RAG-level allow/deny lists are available via SIGMARIS_WEB_RAG_ALLOW_DOMAINS / SIGMARIS_WEB_RAG_DENY_DOMAINS.
    """
    if auth is None and _auth_required:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if os.getenv("SIGMARIS_WEB_RAG_ENABLED", "").strip().lower() not in ("1", "true", "yes", "on"):
        raise HTTPException(status_code=501, detail="web rag disabled")

    trace_id = str((x_sigmaris_trace_id or "").strip() or new_trace_id())
    session_id = str((x_sigmaris_session_id or "").strip() or "") or None
    user_id = str(auth.user_id) if auth is not None else None
    persona_db = SupabasePersonaDB(_supabase) if (_supabase is not None and user_id and _is_uuid(user_id)) else None

    request_payload: Dict[str, Any] = {
        "query": req.query,
        "seed_urls": list(req.seed_urls or []),
        "max_search_results": int(req.max_search_results),
        "recency_days": int(req.recency_days) if req.recency_days is not None else None,
        "safe_search": str(req.safe_search or "active"),
        "domains": list(req.domains or []),
        "max_pages": int(req.max_pages),
        "max_depth": int(req.max_depth),
        "top_k": int(req.top_k),
        "per_host_limit": int(req.per_host_limit),
        "summarize": bool(req.summarize),
    }
    ck = _cache_key(event_type="web_rag", request_payload=request_payload)

    if persona_db is not None and _io_cache_enabled():
        ttl = _io_cache_ttl_sec()
        if ttl > 0:
            not_before = (datetime.now(timezone.utc) - timedelta(seconds=int(ttl))).isoformat()
            try:
                cached = persona_db.load_cached_io_event(
                    user_id=user_id,
                    event_type="web_rag",
                    cache_key=ck,
                    not_before_iso=not_before,
                )
            except Exception:
                cached = None
            if isinstance(cached, dict):
                resp = cached.get("response") if isinstance(cached.get("response"), dict) else {}
                ctx = resp.get("context_text") if isinstance(resp.get("context_text"), str) else None
                sources = resp.get("sources") if isinstance(resp.get("sources"), list) else None
                meta = resp.get("meta") if isinstance(resp.get("meta"), dict) else {}
                if isinstance(ctx, str) and isinstance(sources, list):
                    try:
                        persona_db.insert_io_event(
                            user_id=user_id,
                            session_id=session_id,
                            trace_id=trace_id,
                            event_type="web_rag",
                            cache_key=ck,
                            ok=True,
                            error=None,
                            request=request_payload,
                            response={"context_text": ctx, "sources": sources, "meta": {**meta, "cache_hit": True}},
                            source_urls=list(cached.get("source_urls") or []),
                            content_sha256=_sha256_json({"context_text": ctx, "sources": sources}),
                            meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA, "cache_hit": True},
                        )
                    except Exception:
                        pass
                    return WebRagResponse(ok=True, context_text=ctx, sources=sources, meta={**meta, "cache_hit": True})

    try:
        from persona_core.phase04.io.web_rag import WebRagError, build_web_rag

        out = build_web_rag(
            query=req.query,
            seed_urls=(req.seed_urls if isinstance(req.seed_urls, list) else None),
            max_search_results=req.max_search_results,
            recency_days=req.recency_days,
            safe_search=req.safe_search,
            domains=req.domains,
            max_pages=req.max_pages,
            max_depth=req.max_depth,
            top_k=req.top_k,
            per_host_limit=req.per_host_limit,
            summarize=bool(req.summarize),
            timeout_sec=int(os.getenv("SIGMARIS_WEB_FETCH_TIMEOUT_SEC", "20") or "20"),
            max_bytes=int(os.getenv("SIGMARIS_WEB_FETCH_MAX_BYTES", "1500000") or "1500000"),
        )
    except WebRagError as e:
        if persona_db is not None:
            try:
                persona_db.insert_io_event(
                    user_id=user_id,
                    session_id=session_id,
                    trace_id=trace_id,
                    event_type="web_rag",
                    cache_key=ck,
                    ok=False,
                    error=str(e),
                    request=request_payload,
                    response={},
                    source_urls=[],
                    content_sha256=None,
                    meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA},
                )
            except Exception:
                pass
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        if persona_db is not None:
            try:
                persona_db.insert_io_event(
                    user_id=user_id,
                    session_id=session_id,
                    trace_id=trace_id,
                    event_type="web_rag",
                    cache_key=ck,
                    ok=False,
                    error=f"web_rag_failed:{type(e).__name__}",
                    request=request_payload,
                    response={},
                    source_urls=[],
                    content_sha256=None,
                    meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA},
                )
            except Exception:
                pass
        raise HTTPException(status_code=502, detail="web_rag_failed")

    context_text = str(getattr(out, "context_text", "") or "")
    sources = [s.to_dict() for s in (getattr(out, "sources", None) or []) if hasattr(s, "to_dict")]
    meta = getattr(out, "meta", None) if isinstance(getattr(out, "meta", None), dict) else {}

    if persona_db is not None:
        try:
            audit_chars = _io_audit_excerpt_chars()
            audit_ctx = context_text[:audit_chars] if (audit_chars > 0 and context_text) else ""
            resp_payload: Dict[str, Any] = {"context_text": audit_ctx, "sources": sources, "meta": meta}
            source_urls = []
            for s in sources:
                if isinstance(s, dict) and (s.get("final_url") or s.get("url")):
                    source_urls.append(str(s.get("final_url") or s.get("url")))
            persona_db.insert_io_event(
                user_id=user_id,
                session_id=session_id,
                trace_id=trace_id,
                event_type="web_rag",
                cache_key=ck,
                ok=True,
                error=None,
                request=request_payload,
                response=resp_payload,
                source_urls=source_urls[:64],
                content_sha256=_sha256_json(resp_payload),
                meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA, "audit_excerpt_chars": audit_chars},
            )
        except Exception:
            pass

    return WebRagResponse(ok=True, context_text=context_text, sources=sources, meta=meta if isinstance(meta, dict) else {})


@app.post("/io/github/repos", response_model=GitHubSearchResponse)
async def io_github_repo_search(
    req: GitHubRepoSearchRequest,
    auth: Optional[AuthContext] = Depends(get_auth_context),
    x_sigmaris_trace_id: Optional[str] = Header(default=None, alias="x-sigmaris-trace-id"),
    x_sigmaris_session_id: Optional[str] = Header(default=None, alias="x-sigmaris-session-id"),
):
    if auth is None and _auth_required:
        raise HTTPException(status_code=401, detail="Unauthorized")

    from persona_core.phase04.io.github_search import get_github_provider, GitHubSearchError

    trace_id = str((x_sigmaris_trace_id or "").strip() or new_trace_id())
    session_id = str((x_sigmaris_session_id or "").strip() or "") or None
    user_id = str(auth.user_id) if auth is not None else None
    persona_db = SupabasePersonaDB(_supabase) if (_supabase is not None and user_id and _is_uuid(user_id)) else None
    request_payload = {"query": req.query, "max_results": int(req.max_results)}
    ck = _cache_key(event_type="github_repo_search", request_payload=request_payload)

    try:
        gh = get_github_provider()
        results = gh.search_repositories(query=req.query, max_results=req.max_results)
        out = [r.to_dict() for r in results]
        if persona_db is not None:
            try:
                persona_db.insert_io_event(
                    user_id=user_id,
                    session_id=session_id,
                    trace_id=trace_id,
                    event_type="github_repo_search",
                    cache_key=ck,
                    ok=True,
                    error=None,
                    request=request_payload,
                    response={"results": out},
                    source_urls=[str(r.get("repository_url") or "") for r in out if isinstance(r, dict) and r.get("repository_url")],
                    content_sha256=_sha256_json({"results": out}),
                    meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA},
                )
            except Exception:
                pass
        return GitHubSearchResponse(ok=True, results=out)
    except GitHubSearchError as e:
        if persona_db is not None:
            try:
                persona_db.insert_io_event(
                    user_id=user_id,
                    session_id=session_id,
                    trace_id=trace_id,
                    event_type="github_repo_search",
                    cache_key=ck,
                    ok=False,
                    error=str(e),
                    request=request_payload,
                    response={},
                    source_urls=[],
                    content_sha256=None,
                    meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA},
                )
            except Exception:
                pass
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/io/github/code", response_model=GitHubSearchResponse)
async def io_github_code_search(
    req: GitHubCodeSearchRequest,
    auth: Optional[AuthContext] = Depends(get_auth_context),
    x_sigmaris_trace_id: Optional[str] = Header(default=None, alias="x-sigmaris-trace-id"),
    x_sigmaris_session_id: Optional[str] = Header(default=None, alias="x-sigmaris-session-id"),
):
    if auth is None and _auth_required:
        raise HTTPException(status_code=401, detail="Unauthorized")

    from persona_core.phase04.io.github_search import get_github_provider, GitHubSearchError

    trace_id = str((x_sigmaris_trace_id or "").strip() or new_trace_id())
    session_id = str((x_sigmaris_session_id or "").strip() or "") or None
    user_id = str(auth.user_id) if auth is not None else None
    persona_db = SupabasePersonaDB(_supabase) if (_supabase is not None and user_id and _is_uuid(user_id)) else None
    request_payload = {"query": req.query, "max_results": int(req.max_results)}
    ck = _cache_key(event_type="github_code_search", request_payload=request_payload)

    try:
        gh = get_github_provider()
        results = gh.search_code(query=req.query, max_results=req.max_results)
        out = [r.to_dict() for r in results]
        if persona_db is not None:
            try:
                persona_db.insert_io_event(
                    user_id=user_id,
                    session_id=session_id,
                    trace_id=trace_id,
                    event_type="github_code_search",
                    cache_key=ck,
                    ok=True,
                    error=None,
                    request=request_payload,
                    response={"results": out},
                    source_urls=[str(r.get("repository_url") or "") for r in out if isinstance(r, dict) and r.get("repository_url")],
                    content_sha256=_sha256_json({"results": out}),
                    meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA},
                )
            except Exception:
                pass
        return GitHubSearchResponse(ok=True, results=out)
    except GitHubSearchError as e:
        if persona_db is not None:
            try:
                persona_db.insert_io_event(
                    user_id=user_id,
                    session_id=session_id,
                    trace_id=trace_id,
                    event_type="github_code_search",
                    cache_key=ck,
                    ok=False,
                    error=str(e),
                    request=request_payload,
                    response={},
                    source_urls=[],
                    content_sha256=None,
                    meta={"config_hash": CONFIG_HASH, "build_sha": BUILD_SHA},
                )
            except Exception:
                pass
        raise HTTPException(status_code=502, detail=str(e))
