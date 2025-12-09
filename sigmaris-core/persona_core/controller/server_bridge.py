# sigmaris-core/persona_core/controller/server_bridge.py
# ============================================================
# Persona OS 完全版 — Server Bridge
#
# 役割:
#   - 外部 I/O（FastAPI / Flask / Next.js API など）と PersonaController の橋渡し
#   - dict / JSON 入力 → PersonaRequest へ正規化
#   - PersonaController.handle_turn(...) の結果を JSON 向け dict に変換
#
# この層を経由することで、サーバ実装は Persona OS 内部構造を知らなくてもよい。
# ============================================================

from __future__ import annotations

import uuid
from dataclasses import dataclass, asdict
from typing import Any, Dict, Optional

from persona_core.types.core_types import PersonaRequest
from persona_core.persona_db import PersonaDB
from persona_core.memory.episode_store import EpisodeStore
from persona_core.memory.memory_orchestrator import MemoryOrchestrator
from persona_core.memory.selective_recall import SelectiveRecall
from persona_core.memory.episode_merger import EpisodeMerger
from persona_core.memory.ambiguity_resolver import AmbiguityResolver
from persona_core.identity.identity_continuity import IdentityContinuityEngineV3
from persona_core.value.value_drift_engine import (
    ValueDriftEngine,
    ValueState,
)
from persona_core.trait.trait_drift_engine import (
    TraitDriftEngine,
    TraitState,
)
from persona_core.state.global_state_machine import GlobalStateMachine
from persona_core.controller.persona_controller import (
    PersonaController,
    PersonaControllerConfig,
)
from persona_core.llm.openai_llm_client import OpenAILLMClient


# ============================================================
# Server Bridge Config
# ============================================================

@dataclass
class ServerBridgeConfig:
    """
    ServerBridge 全体の設定。

    - model: OpenAI の会話モデル名（例: "gpt-4.1" / "gpt-4.1-mini"）
    - temperature: LLM の温度
    - max_tokens: 返信の最大トークン
    - embedding_model: 埋め込みモデル名
    - base_data_dir: sigmaris-data のルートディレクトリ
    - default_user_id: user_id 未指定時に使う ID
    """
    model: str = "gpt-4.1"
    temperature: float = 0.7
    max_tokens: int = 1200
    embedding_model: str = "text-embedding-3-small"
    base_data_dir: str = "./sigmaris-data"
    default_user_id: Optional[str] = "default-user"


# ============================================================
# PersonaServerBridge 本体
# ============================================================

class PersonaServerBridge:
    """
    server.py などから利用するための Persona OS 入口。

    想定フロー:
        bridge = PersonaServerBridge()
        response_dict = bridge.handle(json_payload)

    ここで json_payload は FastAPI / Flask などで受け取った
    request.json() 相当の dict を想定する。
    """

    def __init__(self, config: Optional[ServerBridgeConfig] = None) -> None:
        self._config = config or ServerBridgeConfig()

        # ----------------------------------------------------
        # 1) DB / EpisodeStore 初期化
        # ----------------------------------------------------
        persona_db_dir = f"{self._config.base_data_dir}/persona_db"
        episodes_path = f"{self._config.base_data_dir}/episodes.json"

        self._persona_db = PersonaDB(base_dir=persona_db_dir)
        self._episode_store = EpisodeStore(path=episodes_path)

        # ----------------------------------------------------
        # 2) LLM / Embedding クライアント
        # ----------------------------------------------------
        self._llm_client = OpenAILLMClient(
            model=self._config.model,
            temperature=self._config.temperature,
            max_tokens=self._config.max_tokens,
            embedding_model=self._config.embedding_model,
        )

        # embedding_model としても OpenAILLMClient をそのまま使う。
        embedding_model = self._llm_client

        # ----------------------------------------------------
        # 3) Memory Layer（SelectiveRecall / Ambiguity / Merger）
        # ----------------------------------------------------
        selective_recall = SelectiveRecall(
            memory_backend=self._episode_store,
            embedding_model=embedding_model,
            similarity_top_k=5,
            min_score_threshold=0.12,
            use_recency_bias=True,
            recency_weight=0.03,
        )

        ambiguity_resolver = AmbiguityResolver(
            embedding_model=embedding_model,
            min_similarity=0.15,
            max_resolve=3,
        )

        episode_merger = EpisodeMerger(
            memory_backend=self._episode_store,
            max_segments=5,
            max_chars_per_segment=200,
        )

        memory_orchestrator = MemoryOrchestrator(
            selective_recall=selective_recall,
            episode_merger=episode_merger,
            ambiguity_resolver=ambiguity_resolver,
        )

        # ----------------------------------------------------
        # 4) Identity / Drift / FSM
        # ----------------------------------------------------
        identity_engine = IdentityContinuityEngineV3(
            anchor_engine=None,
            max_memory_preview_chars=240,
        )

        value_engine = ValueDriftEngine()
        trait_engine = TraitDriftEngine()
        global_fsm = GlobalStateMachine()

        # ----------------------------------------------------
        # 5) Value / Trait の初期状態（PersonaDB から復元）
        # ----------------------------------------------------
        initial_value_state = self._persona_db.load_last_value_state(
            user_id=self._config.default_user_id
        )
        if initial_value_state is None:
            initial_value_state = ValueState()

        initial_trait_state = self._persona_db.load_last_trait_state(
            user_id=self._config.default_user_id
        )
        if initial_trait_state is None:
            initial_trait_state = TraitState()

        # ----------------------------------------------------
        # 6) PersonaController 構築
        # ----------------------------------------------------
        controller_config = PersonaControllerConfig(
            enable_reflection=False,
            default_user_id=self._config.default_user_id,
        )

        self._controller = PersonaController(
            config=controller_config,
            memory_orchestrator=memory_orchestrator,
            identity_engine=identity_engine,
            value_engine=value_engine,
            trait_engine=trait_engine,
            global_fsm=global_fsm,
            episode_store=self._episode_store,
            persona_db=self._persona_db,
            llm_client=self._llm_client,
            initial_value_state=initial_value_state,
            initial_trait_state=initial_trait_state,
        )

    # ========================================================
    # 外部 I/F — dict 入力 → dict 出力
    # ========================================================

    def handle(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        外部サーバ（FastAPI / Flask / etc）から呼ばれる入口。

        入力 payload 例:
            {
                "user_id": "u123",
                "session_id": "s456",
                "message": "こんにちは",
                "locale": "ja-JP",
                "metadata": {...},
                "safety_flag": null,
                "overload_score": 0.1,
                "reward_signal": 0.0,
                "affect_signal": {"tension": 0.1, "warmth": 0.2},
            }

        戻り値:
            {
                "reply": "...",
                "user_id": "...",
                "session_id": "...",
                "global_state": {...},
                "value_state": {...},
                "trait_state": {...},
                "meta": {...},
            }
        """
        req = self._build_persona_request(payload)

        safety_flag = payload.get("safety_flag")
        overload_score = payload.get("overload_score")
        reward_signal = float(payload.get("reward_signal", 0.0) or 0.0)
        affect_signal = payload.get("affect_signal") or None

        turn_result = self._controller.handle_turn(
            req,
            user_id=req.user_id,
            safety_flag=safety_flag,
            overload_score=overload_score,
            reward_signal=reward_signal,
            affect_signal=affect_signal,
        )

        # ValueState / TraitState は result.value.new_state / result.trait.new_state
        value_state_dict = turn_result.value.new_state.to_dict()
        trait_state_dict = turn_result.trait.new_state.to_dict()

        response: Dict[str, Any] = {
            "reply": turn_result.reply_text,
            "user_id": req.user_id,
            "session_id": req.session_id,
            "global_state": turn_result.global_state.to_dict(),
            "value_state": value_state_dict,
            "trait_state": trait_state_dict,
            "meta": turn_result.meta,
        }

        # Memory / Identity などを必要に応じて付与
        response["meta"]["memory"] = {
            "pointer_count": len(turn_result.memory.pointers),
            "has_merged_summary": turn_result.memory.merged_summary is not None,
        }
        response["meta"]["identity_context"] = turn_result.identity.identity_context

        return response

    # --------------------------------------------------------
    # PersonaRequest の組み立て
    # --------------------------------------------------------

    def _build_persona_request(self, payload: Dict[str, Any]) -> PersonaRequest:
        """
        外部 payload(dict) から PersonaRequest への正規化。
        """
        user_id = str(payload.get("user_id") or self._config.default_user_id or "anonymous")
        session_id = str(payload.get("session_id") or uuid.uuid4())
        message = str(payload.get("message") or payload.get("input") or "").strip()
        locale = str(payload.get("locale") or "ja-JP")

        metadata = payload.get("metadata") or {}
        context = payload.get("context") or {}

        # context 情報を metadata にマージ（後勝ち）
        merged_meta: Dict[str, Any] = {}
        if isinstance(metadata, dict):
            merged_meta.update(metadata)
        if isinstance(context, dict):
            merged_meta.update(context)

        return PersonaRequest(
            user_id=user_id,
            session_id=session_id,
            message=message,
            locale=locale,
            metadata=merged_meta,
        )

    # --------------------------------------------------------
    # デバッグ / 状態確認用ユーティリティ
    # --------------------------------------------------------

    def export_config(self) -> Dict[str, Any]:
        """ServerBridgeConfig を dict で返す（デバッグ用）。"""
        return asdict(self._config)