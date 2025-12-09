# sigmaris-core/persona_core/state/global_state_machine.py
#
# Persona OS 完全版 — Global State Machine（FSM）
# 記憶完全版・Value/Trait Drift と完全整合

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, Dict, List, Optional

from persona_core.types.core_types import PersonaRequest
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.identity.identity_continuity import IdentityContinuityResult
from persona_core.value.value_drift_engine import ValueState
from persona_core.trait.trait_drift_engine import TraitState


# ============================================================
# Global State 定義
# ============================================================

class PersonaGlobalState(Enum):
    NORMAL = auto()
    REFLECTIVE = auto()
    OVERLOADED = auto()
    SAFETY_LOCK = auto()
    SILENT = auto()   # 明示命令でのみ遷移（FSM からは遷移させない）


# ============================================================
# StateContext
# ============================================================

@dataclass
class GlobalStateContext:
    state: PersonaGlobalState
    prev_state: Optional[PersonaGlobalState] = None
    reasons: List[str] = field(default_factory=list)
    meta: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "state": self.state.name,
            "prev_state": self.prev_state.name if self.prev_state else None,
            "reasons": self.reasons,
            "meta": self.meta,
        }


# ============================================================
# GlobalStateMachine
# ============================================================

class GlobalStateMachine:
    """
    Persona OS 完全版のグローバル状態遷移を管理する FSM。

    入力:
      - PersonaRequest
      - MemorySelectionResult
      - IdentityContinuityResult
      - ValueState / TraitState
      - safety_flag / overload_score
      - prev_state

    出力:
      - GlobalStateContext（現在 state・前回 state・理由・meta）
    """

    def __init__(
        self,
        *,
        overload_threshold: float = 0.75,
        high_safety_bias_threshold: float = 0.6,
        low_calm_threshold: float = -0.4,
        high_calm_threshold: float = 0.4,
        high_curiosity_threshold: float = 0.5,
    ) -> None:

        self._overload_threshold = float(overload_threshold)
        self._high_safety_bias_threshold = float(high_safety_bias_threshold)
        self._low_calm_threshold = float(low_calm_threshold)
        self._high_calm_threshold = float(high_calm_threshold)
        self._high_curiosity_threshold = float(high_curiosity_threshold)

    # ============================================================
    # FSM のメイン処理
    # ============================================================

    def decide(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        safety_flag: Optional[str] = None,
        overload_score: Optional[float] = None,
        prev_state: Optional[PersonaGlobalState] = None,
    ) -> GlobalStateContext:
        """
        現在の GlobalState を決定するメインエントリ。
        優先順位:
          1) SAFETY_LOCK
          2) OVERLOADED
          3) REFLECTIVE
          4) NORMAL
        """

        reasons: List[str] = []
        meta: Dict[str, Any] = {}

        # デフォルトは NORMAL
        chosen = PersonaGlobalState.NORMAL

        # ----------------------------------------------------------
        # 0) reflective_score の算定（後段で参照）
        # ----------------------------------------------------------
        reflective_score = self._estimate_reflective_need(
            req=req,
            memory=memory,
            identity=identity,
            value_state=value_state,
            trait_state=trait_state,
        )
        meta["reflective_score"] = float(reflective_score)

        # ----------------------------------------------------------
        # 1) Safety 系 → 最優先
        # ----------------------------------------------------------
        if safety_flag in ("escalated", "blocked", "intervened"):
            chosen = PersonaGlobalState.SAFETY_LOCK
            reasons.append(f"safety_flag={safety_flag} → SAFETY_LOCK")

        elif value_state.safety_bias >= self._high_safety_bias_threshold:
            chosen = PersonaGlobalState.SAFETY_LOCK
            reasons.append(
                f"value_state.safety_bias={value_state.safety_bias:.2f} >= "
                f"{self._high_safety_bias_threshold:.2f}"
            )

        # ----------------------------------------------------------
        # 2) Overload 系（Safety 未発動時にのみチェック）
        # ----------------------------------------------------------
        if chosen != PersonaGlobalState.SAFETY_LOCK:
            if overload_score is not None and overload_score >= self._overload_threshold:
                chosen = PersonaGlobalState.OVERLOADED
                reasons.append(
                    f"overload_score={overload_score:.2f} >= "
                    f"{self._overload_threshold:.2f}"
                )

        # ----------------------------------------------------------
        # 3) Reflective 系（Safety / Overload の次）
        # ----------------------------------------------------------
        if chosen not in (PersonaGlobalState.SAFETY_LOCK, PersonaGlobalState.OVERLOADED):
            if reflective_score >= 1.0:
                chosen = PersonaGlobalState.REFLECTIVE
                reasons.append("reflective_score >= 1.0 → REFLECTIVE")

        # ----------------------------------------------------------
        # SILENT は FSM からは遷移させない
        # PersonaController 側で明示的に指定されることを想定
        # ----------------------------------------------------------

        # IdentityContinuityResult の補助フィールド（あれば使う）
        topic_label = getattr(identity, "topic_label", None)
        has_past_context = getattr(identity, "has_past_context", None)

        # ----------------------------------------------------------
        # meta 情報の構築
        # ----------------------------------------------------------
        meta.update(
            {
                "safety_flag": safety_flag,
                "overload_score": overload_score,
                "value_state": value_state.to_dict(),
                "trait_state": trait_state.to_dict(),
                "memory_pointer_count": len(memory.pointers),
                "identity_topic_label": topic_label,
                "has_past_context": has_past_context,
                "identity_context": getattr(identity, "identity_context", None),
                "request_preview": (req.message or "")[:120],
            }
        )

        return GlobalStateContext(
            state=chosen,
            prev_state=prev_state,
            reasons=reasons,
            meta=meta,
        )

    # ============================================================
    # reflective_score（内部ロジック）
    # ============================================================

    def _estimate_reflective_need(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
    ) -> float:
        """
        「今回のターンは reflective（内省モード）で応答すべきか」のスコア。

        指標:
          - 過去文脈の多さ
          - topic_label の性質（構造・分析系ワード）
          - calm / curiosity の高さ
          - safety_bias / stability のポジティブさ
          - メッセージ長
        """

        score = 0.0

        # ----------------------------------------------------------
        # 1) 過去文脈（Memory pointers）
        # ----------------------------------------------------------
        n = len(memory.pointers)
        if n >= 5:
            score += 0.7
        elif 3 <= n <= 4:
            score += 0.5
        elif 1 <= n <= 2:
            score += 0.2

        # ----------------------------------------------------------
        # 2) Identity topic_label
        # ----------------------------------------------------------
        topic_label = getattr(identity, "topic_label", None) or ""
        topic = str(topic_label).lower()

        markers = [
            "構造", "整理", "まとめ", "振り返り", "考察",
            "分析", "analysis", "structure", "reason", "理由", "why",
        ]
        if any(m in topic for m in markers):
            score += 0.6

        # ----------------------------------------------------------
        # 3) TraitState
        # ----------------------------------------------------------
        if trait_state.calm >= self._high_calm_threshold:
            score += 0.3
        elif trait_state.calm <= self._low_calm_threshold:
            score -= 0.2

        if trait_state.curiosity >= self._high_curiosity_threshold:
            score += 0.3

        # ----------------------------------------------------------
        # 4) ValueState
        # ----------------------------------------------------------
        score += max(0.0, value_state.safety_bias) * 0.4
        score += max(0.0, value_state.stability) * 0.2

        # ----------------------------------------------------------
        # 5) メッセージ長
        # ----------------------------------------------------------
        L = len(req.message or "")
        if L >= 400:
            score += 0.2
        elif L >= 200:
            score += 0.1

        return float(score)