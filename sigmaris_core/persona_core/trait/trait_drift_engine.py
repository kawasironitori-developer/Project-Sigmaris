# sigmaris-core/persona_core/trait/trait_drift_engine.py
# -------------------------------------------------------------
# Persona OS: Trait Drift Engine
#
# calm / empathy / curiosity の 3軸を「内面状態（state）」として更新する。
# ここでは以下を設計上の前提とする:
# - state は 0..1
# - 0.5 をニュートラル（基準）とする
# - baseline（ユーザー固有の体質）へ戻る力（mean reversion）を入れる
# -------------------------------------------------------------

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from persona_core.identity.identity_continuity import IdentityContinuityResult
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.types.core_types import PersonaRequest
from persona_core.value.value_drift_engine import ValueState


# ======================================================
# Trait State (0..1)
# ======================================================


@dataclass
class TraitState:
    """
    calm      : 落ち着き（高いほど平静/安定）
    empathy   : 共感（高いほど相手への配慮が強い）
    curiosity : 好奇心（高いほど探索/質問/広げる傾向）
    """

    # state は 0..1 を想定。0.5 を「ニュートラル（基準）」として扱う。
    calm: float = 0.5
    empathy: float = 0.5
    curiosity: float = 0.5

    def to_dict(self) -> Dict[str, float]:
        return {
            "calm": float(self.calm),
            "empathy": float(self.empathy),
            "curiosity": float(self.curiosity),
        }


# ======================================================
# Drift Result
# ======================================================


@dataclass
class TraitDriftResult:
    new_state: TraitState
    delta: Dict[str, float] = field(default_factory=dict)
    notes: Dict[str, Any] = field(default_factory=dict)


# ======================================================
# Trait Drift Engine
# ======================================================


class TraitDriftEngine:
    """
    Trait Drift Engine

    - baseline への戻り（mean reversion）で state を安定化
    - Identity / Memory / Value / Affect の影響で微小に揺らす
    - PersonaDB が対応していればスナップショットを保存
    """

    def __init__(
        self,
        *,
        learning_rate: float = 0.01,
        max_abs_value: float = 1.0,
        # 0..1 の baseline へ戻す rate（大きいほど早く戻る）
        reversion_rate: float = 0.01,
    ) -> None:
        self._lr = float(learning_rate)
        self._limit = float(max_abs_value)
        self._rev = float(reversion_rate)

    # ======================================================
    # Public API
    # ======================================================

    def apply(
        self,
        *,
        current: TraitState,
        baseline: Optional[TraitState] = None,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        affect_signal: Optional[Dict[str, float]] = None,
        db: Optional[Any] = None,
        user_id: Optional[str] = None,
    ) -> TraitDriftResult:

        # Guardrail: freeze major updates (Phase01 Part06 safe modes)
        try:
            if isinstance(getattr(req, "metadata", None), dict) and req.metadata.get("_freeze_updates"):
                return TraitDriftResult(
                    new_state=TraitState(
                        calm=float(current.calm),
                        empathy=float(current.empathy),
                        curiosity=float(current.curiosity),
                    ),
                    delta={k: 0.0 for k in current.to_dict().keys()},
                    notes={"frozen": True, "reason": "guardrail_freeze"},
                )
        except Exception:
            pass

        new_state = TraitState(
            calm=float(current.calm),
            empathy=float(current.empathy),
            curiosity=float(current.curiosity),
        )

        deltas: Dict[str, float] = {k: 0.0 for k in new_state.to_dict().keys()}

        # ---- 1) baseline への戻り ----
        self._apply_reversion(new_state, deltas, baseline)

        # ---- 2) Identity influence ----
        self._apply_identity_influence(new_state, deltas, identity)

        # ---- 3) Memory influence ----
        self._apply_memory_influence(new_state, deltas, memory)

        # ---- 4) Value influence ----
        self._apply_value_influence(new_state, deltas, value_state)

        # ---- 5) Affect influence ----
        self._apply_affect_influence(new_state, deltas, affect_signal)

        # ---- 6) clip ----
        self._clip_state(new_state)

        # ---- 7) DB Snapshot ----
        self._store_snapshot_if_supported(
            db=db,
            user_id=user_id,
            state=new_state,
            deltas=deltas,
            req=req,
            memory=memory,
            identity=identity,
            baseline=baseline,
        )

        notes = {
            "baseline": (baseline.to_dict() if baseline is not None else None),
            "value_state": value_state.to_dict(),
            "affect_signal": affect_signal,
            "memory_pointer_count": len(memory.pointers),
            "identity_topic_label": (identity.identity_context or {}).get("topic_label"),
        }

        return TraitDriftResult(new_state=new_state, delta=deltas, notes=notes)

    # ======================================================
    # Influence functions
    # ======================================================

    def _apply_reversion(
        self, state: TraitState, deltas: Dict[str, float], baseline: Optional[TraitState]
    ) -> None:
        target = baseline or TraitState()
        for k in deltas.keys():
            v = float(getattr(state, k))
            b = float(getattr(target, k))
            dv = (b - v) * self._rev
            setattr(state, k, v + dv)
            deltas[k] += dv

    # ------------------------------------------------------

    def _apply_identity_influence(
        self,
        state: TraitState,
        deltas: Dict[str, float],
        identity: IdentityContinuityResult,
    ) -> None:
        ctx = identity.identity_context or {}
        has_past = bool(ctx.get("has_past_context"))
        topic = (ctx.get("topic_label") or "").lower()
        base = self._lr

        # 既視感/継続性があるほど calm を少し上げる
        if has_past:
            dv = base * 0.3
            state.calm += dv
            deltas["calm"] += dv

        # ネガティブ/衝突っぽいラベルがあるなら calm を少し下げる
        negative_terms = ["不安", "トラブル", "衝突", "conflict", "fight", "problem"]
        if any(term in topic for term in negative_terms):
            dv = -base * 0.4
            state.calm += dv
            deltas["calm"] += dv

    # ------------------------------------------------------

    def _apply_memory_influence(
        self,
        state: TraitState,
        deltas: Dict[str, float],
        memory: MemorySelectionResult,
    ) -> None:
        count = len(memory.pointers)
        base = self._lr

        # memory pointer が多いほど「相手の文脈を保持できる」= empathy を少し上げる
        if count >= 3:
            dv = base * 0.4
            state.empathy += dv
            deltas["empathy"] += dv
        elif 1 <= count <= 2:
            dv = base * 0.2
            state.empathy += dv
            deltas["empathy"] += dv

    # ------------------------------------------------------

    def _apply_value_influence(
        self,
        state: TraitState,
        deltas: Dict[str, float],
        value_state: ValueState,
    ) -> None:
        base = self._lr

        # openness -> curiosity
        if value_state.openness > 0:
            dv = base * 0.5 * float(value_state.openness)
            state.curiosity += dv
            deltas["curiosity"] += dv

        # safety_bias -> calm up, curiosity down
        if value_state.safety_bias > 0:
            dc = base * 0.4 * float(value_state.safety_bias)
            dcu = -base * 0.3 * float(value_state.safety_bias)
            state.calm += dc
            state.curiosity += dcu
            deltas["calm"] += dc
            deltas["curiosity"] += dcu

    # ------------------------------------------------------

    def _apply_affect_influence(
        self,
        state: TraitState,
        deltas: Dict[str, float],
        affect_signal: Optional[Dict[str, float]],
    ) -> None:
        if not affect_signal:
            return

        base = self._lr

        tension = float(affect_signal.get("tension", 0.0) or 0.0)
        warmth = float(affect_signal.get("warmth", 0.0) or 0.0)
        curious = float(affect_signal.get("curiosity", 0.0) or 0.0)

        # tension -> calm down
        if tension != 0.0:
            dv = -base * 0.5 * tension
            state.calm += dv
            deltas["calm"] += dv

        # warmth -> empathy up
        if warmth != 0.0:
            dv = base * 0.6 * warmth
            state.empathy += dv
            deltas["empathy"] += dv

        # curiosity signal -> curiosity up
        if curious != 0.0:
            dv = base * 0.7 * curious
            state.curiosity += dv
            deltas["curiosity"] += dv

    # ------------------------------------------------------

    def _clip_state(self, state: TraitState) -> None:
        """Trait state は 0..1 にクリップする。"""
        hi = float(self._limit)
        lo = 0.0
        for k, v in state.to_dict().items():
            if v > hi:
                setattr(state, k, hi)
            elif v < lo:
                setattr(state, k, lo)

    # ------------------------------------------------------

    def _store_snapshot_if_supported(
        self,
        *,
        db: Any,
        user_id: Optional[str],
        state: TraitState,
        deltas: Dict[str, float],
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        baseline: Optional[TraitState],
    ) -> None:
        if db is None or not hasattr(db, "store_trait_snapshot"):
            return

        meta = {
            "trace_id": (getattr(req, "metadata", None) or {}).get("_trace_id"),
            "request_preview": (req.message or "")[:80],
            "memory_pointer_count": len(memory.pointers),
            "identity_topic_label": (identity.identity_context or {}).get("topic_label"),
            "baseline": (baseline.to_dict() if baseline is not None else None),
        }

        payload = {
            "user_id": user_id,
            "state": state.to_dict(),
            "delta": deltas,
            "meta": meta,
        }

        try:
            db.store_trait_snapshot(**payload)
        except Exception:
            # OS 側を落とさない
            pass
