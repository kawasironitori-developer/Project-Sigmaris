# sigmaris-core/persona_core/controller/persona_controller.py
#
# Persona OS 完全版 — 1ターン統合制御
# Memory / Identity / Drift / FSM / LLM / PersonaDB との完全整合版

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, List
from datetime import datetime, timezone

from persona_core.memory.episode_store import Episode
from persona_core.types.core_types import PersonaRequest
from persona_core.memory.memory_orchestrator import (
    MemoryOrchestrator,
    MemorySelectionResult,
)
from persona_core.identity.identity_continuity import (
    IdentityContinuityEngineV3,
    IdentityContinuityResult,
)
from persona_core.value.value_drift_engine import (
    ValueDriftEngine,
    ValueDriftResult,
    ValueState,
)
from persona_core.trait.trait_drift_engine import (
    TraitDriftEngine,
    TraitDriftResult,
    TraitState,
)
from persona_core.state.global_state_machine import (
    GlobalStateMachine,
    GlobalStateContext,
    PersonaGlobalState,
)


# --------------------------------------------------------------
# LLM client interface
# --------------------------------------------------------------


class LLMClientLike:
    """
    PersonaController から呼ばれる LLM クライアントの I/F。

    必須メソッド:
        generate(
            *,
            req: PersonaRequest,
            memory: MemorySelectionResult,
            identity: IdentityContinuityResult,
            value_state: ValueState,
            trait_state: TraitState,
            global_state: GlobalStateContext,
        ) -> str

    任意（あれば Episode.embedding 生成に利用する）:
        encode(text: str) -> List[float]
        embed(text: str) -> List[float]
    """

    def generate(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> str:
        raise NotImplementedError


# --------------------------------------------------------------
# 設定型 / 結果型
# --------------------------------------------------------------


@dataclass
class PersonaControllerConfig:
    enable_reflection: bool = False
    default_user_id: Optional[str] = None


@dataclass
class PersonaTurnResult:
    reply_text: str
    memory: MemorySelectionResult
    identity: IdentityContinuityResult
    value: ValueDriftResult
    trait: TraitDriftResult
    global_state: GlobalStateContext
    meta: Dict[str, Any] = field(default_factory=dict)


# --------------------------------------------------------------
# PersonaController（本体）
# --------------------------------------------------------------


class PersonaController:
    """
    Persona OS 完全版の 1ターン統合制御クラス。

    フロー:
      1) 記憶選択 (MemoryOrchestrator)
      2) Identity Continuity 推定
      3) Value Drift 更新
      4) Trait Drift 更新
      5) Global State 決定
      6) LLM 応答生成
      7) EpisodeStore / PersonaDB への保存
    """

    def __init__(
        self,
        *,
        config: Optional[PersonaControllerConfig] = None,
        memory_orchestrator: MemoryOrchestrator,
        identity_engine: IdentityContinuityEngineV3,
        value_engine: ValueDriftEngine,
        trait_engine: TraitDriftEngine,
        global_fsm: GlobalStateMachine,
        episode_store: Any,
        persona_db: Any,
        llm_client: LLMClientLike,
        initial_value_state: Optional[ValueState] = None,
        initial_trait_state: Optional[TraitState] = None,
    ) -> None:

        self._config = config or PersonaControllerConfig()

        self._memory = memory_orchestrator
        self._identity = identity_engine
        self._value = value_engine
        self._trait = trait_engine
        self._fsm = global_fsm

        # バックエンド類
        self._episode_store = episode_store  # EpisodeStore(JSON / SQLite など)
        self._db = persona_db  # PersonaDB / MemoryDB
        self._llm = llm_client  # LLM client

        # 内部状態
        self._value_state = initial_value_state or ValueState()
        self._trait_state = initial_trait_state or TraitState()
        self._prev_global_state: Optional[PersonaGlobalState] = None

    # ----------------------------------------------------------
    # Main turn
    # ----------------------------------------------------------

    def handle_turn(
        self,
        req: PersonaRequest,
        *,
        user_id: Optional[str] = None,
        safety_flag: Optional[str] = None,
        overload_score: Optional[float] = None,
        reward_signal: float = 0.0,
        affect_signal: Optional[Dict[str, float]] = None,
    ) -> PersonaTurnResult:
        """
        1 回分の対話を処理し、完全版 Persona OS としての結果を返す。
        """

        uid = user_id or self._config.default_user_id
        meta: Dict[str, Any] = {}

        # 1) Memory selection
        memory_result = self._select_memory(req=req, user_id=uid)
        meta["memory"] = {
            "pointer_count": len(memory_result.pointers),
            "has_merged_summary": memory_result.merged_summary is not None,
        }

        # 2) Identity continuity
        identity_result = self._identity.build_identity_context(
            req=req,
            memory=memory_result,
        )

        # 3) Value drift
        value_result = self._value.apply(
            current=self._value_state,
            req=req,
            memory=memory_result,
            identity=identity_result,
            reward_signal=reward_signal,
            safety_flag=safety_flag,
            db=self._db,
            user_id=uid,
        )
        self._value_state = value_result.new_state

        # 4) Trait drift
        trait_result = self._trait.apply(
            current=self._trait_state,
            req=req,
            memory=memory_result,
            identity=identity_result,
            value_state=self._value_state,
            affect_signal=affect_signal,
            db=self._db,
            user_id=uid,
        )
        self._trait_state = trait_result.new_state

        # 5) Global state (FSM)
        global_state_ctx = self._fsm.decide(
            req=req,
            memory=memory_result,
            identity=identity_result,
            value_state=self._value_state,
            trait_state=self._trait_state,
            safety_flag=safety_flag,
            overload_score=overload_score,
            prev_state=self._prev_global_state,
        )
        self._prev_global_state = global_state_ctx.state

        # 6) LLM 応答生成
        reply_text = self._call_llm(
            req=req,
            memory_result=memory_result,
            identity_result=identity_result,
            value_state=self._value_state,
            trait_state=self._trait_state,
            global_state=global_state_ctx,
        )

        # 7) Episode / PersonaDB 保存
        self._store_episode(
            user_id=uid,
            req=req,
            reply_text=reply_text,
            memory_result=memory_result,
            identity_result=identity_result,
            global_state=global_state_ctx,
        )

        meta.update(
            {
                "value_delta": value_result.delta,
                "trait_delta": trait_result.delta,
                "global_state": global_state_ctx.to_dict(),
                "reward_signal": reward_signal,
                "safety_flag": safety_flag,
                "overload_score": overload_score,
            }
        )

        return PersonaTurnResult(
            reply_text=reply_text,
            memory=memory_result,
            identity=identity_result,
            value=value_result,
            trait=trait_result,
            global_state=global_state_ctx,
            meta=meta,
        )

    # ----------------------------------------------------------
    # Memory orchestrator
    # ----------------------------------------------------------

    def _select_memory(
        self,
        *,
        req: PersonaRequest,
        user_id: Optional[str],
    ) -> MemorySelectionResult:
        """
        MemoryOrchestrator への委譲。
        select(...) は旧 API 互換のため余分な kwarg を受け取ってもよい。
        """
        return self._memory.select(
            req=req,
            user_id=user_id,
            episode_store=self._episode_store,
            persona_db=self._db,
        )

    # ----------------------------------------------------------
    # LLM 呼び出し
    # ----------------------------------------------------------

    def _call_llm(
        self,
        *,
        req: PersonaRequest,
        memory_result: MemorySelectionResult,
        identity_result: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> str:
        """
        LLM クライアントへの委譲。
        プロンプト構成の詳細は llm_client 側に任せる。
        """
        return self._llm.generate(
            req=req,
            memory=memory_result,
            identity=identity_result,
            value_state=value_state,
            trait_state=trait_state,
            global_state=global_state,
        )

    # ----------------------------------------------------------
    # Episode / PersonaDB 保存
    # ----------------------------------------------------------

    def _store_episode(
        self,
        *,
        user_id: Optional[str],
        req: PersonaRequest,
        reply_text: str,
        memory_result: MemorySelectionResult,
        identity_result: IdentityContinuityResult,
        global_state: GlobalStateContext,
    ) -> None:
        """
        応答を EpisodeStore / PersonaDB に保存する。
        - EpisodeStore: Episode モデル（embedding は可能なら付与）
        - PersonaDB: 実装に応じて store_episode_record(...) または store_episode(...)
        """

        req_text = req.message or ""

        # EpisodeStore 用 Episode 構築（アシスタント側のみ格納）
        ep = Episode(
            episode_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            summary=reply_text[:120],  # 短い summary として格納
            emotion_hint="",
            traits_hint={},
            raw_context=req_text,
            embedding=None,
        )

        # embedding（可能なら生成）
        try:
            if hasattr(self._llm, "encode"):
                ep.embedding = self._llm.encode(ep.summary)  # type: ignore[attr-defined]
            elif hasattr(self._llm, "embed"):
                ep.embedding = self._llm.embed(ep.summary)  # type: ignore[attr-defined]
        except Exception:
            ep.embedding = None

        # EpisodeStore 保存
        try:
            if self._episode_store is not None and hasattr(self._episode_store, "add"):
                self._episode_store.add(ep)
        except Exception:
            # Episode 保存失敗は OS 全体に波及させない
            pass

        # PersonaDB / MemoryDB 側への保存
        if self._db is None:
            return

        meta = {
            "identity_context": identity_result.identity_context,
            "global_state": global_state.to_dict(),
            "memory_pointers": [p.__dict__ for p in memory_result.pointers],
        }

        # 旧 API 互換: store_episode_record(user_id, request, response, meta)
        if hasattr(self._db, "store_episode_record"):
            try:
                self._db.store_episode_record(  # type: ignore[call-arg]
                    user_id=user_id,
                    request=req_text,
                    response=reply_text,
                    meta=meta,
                )
            except Exception:
                # DB エラーも OS 全体には波及させない
                return
            return

        # 新 API（MemoryDB 完全版）：store_episode(...) を使う
        if hasattr(self._db, "store_episode"):
            try:
                # セッションIDは req から取れれば使う。無ければ新規 UUID。
                session_id = getattr(req, "session_id", None) or str(uuid.uuid4())

                # ユーザー発話
                self._db.store_episode(
                    session_id=session_id,
                    role="user",
                    content=req_text,
                    topic_hint=None,
                    emotion_hint=None,
                    importance=0.0,
                    meta={
                        "direction": "input",
                        "identity_context": identity_result.identity_context,
                        "global_state": global_state.to_dict(),
                    },
                )

                # モデル応答
                self._db.store_episode(
                    session_id=session_id,
                    role="assistant",
                    content=reply_text,
                    topic_hint=None,
                    emotion_hint=None,
                    importance=0.0,
                    meta={
                        "direction": "output",
                        "identity_context": identity_result.identity_context,
                        "global_state": global_state.to_dict(),
                        "memory_pointers": [
                            p.__dict__ for p in memory_result.pointers
                        ],
                    },
                )

            except Exception:
                # ここでも OS 全体には波及させない
                return