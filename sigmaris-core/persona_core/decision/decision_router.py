# sigmaris-core/persona_core/decision/decision_router.py
# ----------------------------------------------------------
# Persona OS 完全版 — Decision Router
#
# 役割：
#   - Memory / Identity / Value / Trait / GlobalState を束ねて
#     「LLM に渡すための最終決定ペイロード」を構成する。
#   - PersonaController と LLMClient の間に入る“意思決定レイヤ”。
#
# 実装方針：
#   - ここでは DB や EpisodeStore には触らない（純粋ロジック）。
#   - GlobalState / Value / Trait から、LLM 向けの mode_hint・safety_mode を導出。
#   - 生成結果は DecisionPayload として返し、LLM クライアント側で
#     to_dict() や個別属性を使って自由にプロンプト構成できる。
# ----------------------------------------------------------

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Dict, Optional

from persona_core.types.core_types import PersonaRequest
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.identity.identity_continuity import IdentityContinuityResult
from persona_core.value.value_drift_engine import ValueState
from persona_core.trait.trait_drift_engine import TraitState
from persona_core.state.global_state_machine import (
    GlobalStateContext,
    PersonaGlobalState,
)


# ==========================================================
# DecisionPayload — LLM へ渡すための最終ペイロード
# ==========================================================

@dataclass
class DecisionPayload:
    """
    Persona OS 完全版における「LLM 呼び出し前の最終決定状態」。

    PersonaController → DecisionRouter → LLMClient(generate)
    の流れで利用されることを想定している。

    LLM 側では：
      - payload.req.message
      - payload.memory.merged_summary
      - payload.identity.identity_context
      - payload.value_state / trait_state の to_dict()
      - payload.global_state.to_dict()
      - payload.mode_hint / safety_mode
    などを参照してプロンプトを構成すればよい。
    """

    # 入力そのもの
    req: PersonaRequest
    memory: MemorySelectionResult
    identity: IdentityContinuityResult
    value_state: ValueState
    trait_state: TraitState
    global_state: GlobalStateContext

    # Router による解釈結果
    mode_hint: str  # "normal" / "reflective" / "overloaded" / "safety_lock" / "silent"
    safety_mode: str  # "normal" / "soft" / "hard"
    notes: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """
        ログ・デバッグ・LLM プロンプト参照用にシリアライズ可能な dict を返す。
        Episode / DB オブジェクトそのものは含めない。
        """
        return {
            "req": {
                "message": self.req.message,
                "meta": getattr(self.req, "meta", None),
            },
            "memory": {
                "pointer_count": len(self.memory.pointers),
                "merged_summary": self.memory.merged_summary,
                "raw": self.memory.raw,
            },
            "identity": {
                "identity_context": self.identity.identity_context,
                "used_anchors": self.identity.used_anchors,
                "notes": self.identity.notes,
            },
            "value_state": self.value_state.to_dict(),
            "trait_state": self.trait_state.to_dict(),
            "global_state": self.global_state.to_dict(),
            "mode_hint": self.mode_hint,
            "safety_mode": self.safety_mode,
            "notes": self.notes,
        }


# ==========================================================
# DecisionRouter 本体
# ==========================================================

class DecisionRouter:
    """
    Persona OS 完全版：Decision Router

    - PersonaController から各状態を受け取り
    - GlobalState / ValueState / TraitState / Identity などを踏まえて
      LLM に渡すための「mode_hint」「safety_mode」などを決定する。
    """

    def __init__(
        self,
        *,
        high_safety_bias_threshold: float = 0.6,
        low_calm_threshold: float = -0.4,
        high_calm_threshold: float = 0.4,
        high_curiosity_threshold: float = 0.5,
    ) -> None:
        """
        :param high_safety_bias_threshold:
            ValueState.safety_bias がこの値を超えると safety_mode が "hard" 寄り。
        :param low_calm_threshold:
            calm がこの値を下回ると「不安定気味」と判断。
        :param high_calm_threshold:
            calm がこの値を超えると「落ち着いている」と判断。
        :param high_curiosity_threshold:
            curiosity がこの値を超えると「探索的モード」と判断。
        """
        self._high_safety_bias_threshold = high_safety_bias_threshold
        self._low_calm_threshold = low_calm_threshold
        self._high_calm_threshold = high_calm_threshold
        self._high_curiosity_threshold = high_curiosity_threshold

    # ------------------------------------------------------
    # メイン API
    # ------------------------------------------------------

    def build_payload(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> DecisionPayload:
        """
        PersonaController から呼び出されるエントリポイント。

        ここで LL M向けの mode_hint / safety_mode を決定し、
        すべてをひとまとめにした DecisionPayload を返す。
        """

        mode_hint = self._decide_mode_hint(global_state)
        safety_mode = self._decide_safety_mode(global_state, value_state)

        notes: Dict[str, Any] = {
            "identity_topic_label": identity.identity_context.get("topic_label"),
            "has_past_context": identity.identity_context.get("has_past_context"),
            "memory_pointer_count": len(memory.pointers),
            "has_merged_summary": memory.merged_summary is not None,
            "value_state": value_state.to_dict(),
            "trait_state": trait_state.to_dict(),
            "global_state": global_state.to_dict(),
        }

        # Trait からの補足ラベル
        self._annotate_trait_notes(trait_state, notes)

        return DecisionPayload(
            req=req,
            memory=memory,
            identity=identity,
            value_state=value_state,
            trait_state=trait_state,
            global_state=global_state,
            mode_hint=mode_hint,
            safety_mode=safety_mode,
            notes=notes,
        )

    # ------------------------------------------------------
    # 内部ロジック：mode_hint / safety_mode など
    # ------------------------------------------------------

    def _decide_mode_hint(self, global_state: GlobalStateContext) -> str:
        """
        GlobalState の Enum から LLM 用 mode_hint を決定。
        """
        s = global_state.state

        if s == PersonaGlobalState.SAFETY_LOCK:
            return "safety_lock"
        if s == PersonaGlobalState.OVERLOADED:
            return "overloaded"
        if s == PersonaGlobalState.REFLECTIVE:
            return "reflective"
        if s == PersonaGlobalState.SILENT:
            return "silent"
        return "normal"

    def _decide_safety_mode(
        self,
        global_state: GlobalStateContext,
        value_state: ValueState,
    ) -> str:
        """
        safety_mode を粗く 3 段階に分ける：
          - "hard" : SAFETY_LOCK 状態、あるいは safety_bias が高い
          - "soft" : safety_bias > 0 だが閾値未満
          - "normal" : それ以外
        """
        if global_state.state == PersonaGlobalState.SAFETY_LOCK:
            return "hard"

        if value_state.safety_bias >= self._high_safety_bias_threshold:
            return "hard"

        if value_state.safety_bias > 0:
            return "soft"

        return "normal"

    def _annotate_trait_notes(
        self,
        trait_state: TraitState,
        notes: Dict[str, Any],
    ) -> None:
        """
        TraitState から追加の注釈ラベルを生成し、notes に書き込む。
        ここでは説明用のタグだけを扱い、DecisionPayload の挙動は変えない。
        """
        tags = []

        if trait_state.calm >= self._high_calm_threshold:
            tags.append("calm_high")
        elif trait_state.calm <= self._low_calm_threshold:
            tags.append("calm_low")

        if trait_state.curiosity >= self._high_curiosity_threshold:
            tags.append("curiosity_high")

        if trait_state.empathy > 0.4:
            tags.append("empathy_high")
        elif trait_state.empathy < -0.2:
            tags.append("empathy_low")

        notes["trait_tags"] = tags