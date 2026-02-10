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
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi import Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

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
from persona_core.ego.ego_state import EgoContinuityState
from persona_core.temporal_identity.temporal_identity_state import TemporalIdentityState


log = get_logger(__name__)

# `.env` から Supabase/モデル設定を読み込めるようにする（環境変数が優先）
load_dotenv(override=False)

DEFAULT_MODEL = os.getenv("SIGMARIS_PERSONA_MODEL", "gpt-4.1")
DEFAULT_EMBEDDING_MODEL = os.getenv("SIGMARIS_EMBEDDING_MODEL", "text-embedding-3-small")
DEFAULT_USER_ID = os.getenv("SIGMARIS_DEFAULT_USER_ID", "default-user")

# =============================================================
# FastAPI App
# - ルートデコレータ評価時に `app` が未定義にならないよう、早めに定義しておく
# =============================================================

app = FastAPI(title="Sigmaris Persona OS API", version="1.0.0")

_supabase_cfg = SupabaseConfig.from_env()
_supabase: Optional[SupabaseRESTClient]
if _supabase_cfg is not None:
    _supabase = SupabaseRESTClient(_supabase_cfg)
else:
    _supabase = None


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
    message: str

    # Optional character/persona injection (safe, ignored unless provided)
    character_id: Optional[str] = None
    persona_system: Optional[str] = None
    # Optional per-request generation params (e.g., {"temperature":0.8,"max_tokens":600})
    gen: Optional[Dict[str, Any]] = None

    reward_signal: float = 0.0
    affect_signal: Optional[Dict[str, float]] = None
    # Trait baseline (0..1). If provided, controller uses it and returns updated baseline in meta.
    trait_baseline: Optional[Dict[str, float]] = None


class ChatResponse(BaseModel):
    reply: str
    meta: Dict[str, Any]


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
async def persona_chat(req: ChatRequest) -> ChatResponse:
    """
    1ターン分のチャット処理。
    - 入力を PersonaRequest に変換
    - SafetyLayer で safety_flag を判定（簡易）
    - PersonaController.handle_turn(...) に渡して reply を生成
    - meta に内部状態（記憶/同一性/ドリフト/状態）を付けて返す
    """

    trace_id = new_trace_id()
    t0 = time.time()

    user_id = req.user_id or DEFAULT_USER_ID
    session_id = req.session_id or f"{user_id}:{uuid.uuid4().hex}"

    overload_score = _estimate_overload_score(req.message)

    preq = PersonaRequest(
        user_id=user_id,
        session_id=session_id,
        message=req.message,
        context={
            "_trace_id": trace_id,
            **({"character_id": req.character_id} if req.character_id else {}),
            **({"persona_system": req.persona_system} if req.persona_system else {}),
            **({"gen": req.gen} if isinstance(req.gen, dict) and req.gen else {}),
        },
    )

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

        # Phase02: operator overrides (best-effort). These affect *behavior*, not stored identity directly.
        # - subjectivity_mode: force mode (S0..S3) or "AUTO"
        # - freeze_updates: force drift freeze on this request
        try:
            op = persona_db.load_last_operator_override(user_id=user_id, kind="ops_mode_set")
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
        init_value = persona_db.load_last_value_state(user_id=user_id) or ValueState()
        init_trait = persona_db.load_last_trait_state(user_id=user_id) or TraitState()
        init_ego: Optional[EgoContinuityState] = None
        try:
            st = persona_db.load_last_ego_state(user_id=user_id)
            if isinstance(st, dict):
                init_ego = EgoContinuityState.from_dict(st)
        except Exception:
            init_ego = None

        init_tid: Optional[TemporalIdentityState] = None
        try:
            st = persona_db.load_last_temporal_identity_state(user_id=user_id)
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
                "sigmaris_safety_assessments",
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
            "message_len": len(req.message or ""),
            "message_preview": preview_text(req.message) if TRACE_INCLUDE_TEXT else "",
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

    meta: Dict[str, Any] = {
        "trace_id": trace_id,
        "timing_ms": int((time.time() - t0) * 1000),
        "safety": {
            "flag": safety.safety_flag,
            "risk_score": safety.risk_score,
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
        "controller_meta": result.meta,
        "io": {
            "message_preview": preview_text(req.message) if TRACE_INCLUDE_TEXT else "",
            "reply_preview": preview_text(result.reply_text) if TRACE_INCLUDE_TEXT else "",
        },
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
async def persona_chat_stream(req: ChatRequest):
    """
    SSE streaming version of /persona/chat.
    - event: delta -> data: {"text": "..."}
    - event: done  -> data: {"reply": "...", "meta": {...}}
    """

    trace_id = new_trace_id()
    t0 = time.time()

    user_id = req.user_id or DEFAULT_USER_ID
    session_id = req.session_id or f"{user_id}:{uuid.uuid4().hex}"
    overload_score = _estimate_overload_score(req.message)

    preq = PersonaRequest(
        user_id=user_id,
        session_id=session_id,
        message=req.message,
        context={
            "_trace_id": trace_id,
            **({"character_id": req.character_id} if req.character_id else {}),
            **({"persona_system": req.persona_system} if req.persona_system else {}),
            **({"gen": req.gen} if isinstance(req.gen, dict) and req.gen else {}),
        },
    )

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

        # Phase02: operator overrides (best-effort)
        try:
            op = persona_db.load_last_operator_override(user_id=user_id, kind="ops_mode_set")
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

        init_value = persona_db.load_last_value_state(user_id=user_id) or ValueState()
        init_trait = persona_db.load_last_trait_state(user_id=user_id) or TraitState()
        init_ego: Optional[EgoContinuityState] = None
        try:
            st = persona_db.load_last_ego_state(user_id=user_id)
            if isinstance(st, dict):
                init_ego = EgoContinuityState.from_dict(st)
        except Exception:
            init_ego = None
        init_tid: Optional[TemporalIdentityState] = None
        try:
            st = persona_db.load_last_temporal_identity_state(user_id=user_id)
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

                    meta: Dict[str, Any] = {
                        "trace_id": trace_id,
                        "timing_ms": int((time.time() - t0) * 1000),
                        "safety": {
                            "flag": safety.safety_flag,
                            "risk_score": safety.risk_score,
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
                        "controller_meta": result.meta,
                        "io": {
                            "message_preview": preview_text(req.message) if TRACE_INCLUDE_TEXT else "",
                            "reply_preview": preview_text(reply_text) if TRACE_INCLUDE_TEXT else "",
                        },
                    }

                    yield _sse("done", {"reply": reply_text, "meta": meta})
        except Exception as e:
            log.exception("persona_chat_stream failed")
            yield _sse("error", {"error": str(e), "trace_id": trace_id})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
