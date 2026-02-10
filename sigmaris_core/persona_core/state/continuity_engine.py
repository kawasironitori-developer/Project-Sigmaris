from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from persona_core.identity.identity_continuity import IdentityContinuityResult
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.state.global_state_machine import GlobalStateContext, PersonaGlobalState


def _clamp01(v: float) -> float:
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return float(v)


@dataclass
class ContinuityAssessment:
    """
    Phase01 Part03 (E Layer) operational continuity signal.

    This is *not* a claim about consciousness; it's a pragmatic measure for
    continuity degradation (context loss, overload, safety lock, etc.).
    """

    confidence: float
    degraded: bool
    reasons: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "confidence": float(self.confidence),
            "degraded": bool(self.degraded),
            "reasons": self.reasons,
        }


class ContinuityEngine:
    def compute(
        self,
        *,
        identity: IdentityContinuityResult,
        memory: MemorySelectionResult,
        global_state: GlobalStateContext,
        telemetry_ema: Optional[Dict[str, float]] = None,
        overload_score: Optional[float] = None,
        safety_flag: Optional[str] = None,
    ) -> ContinuityAssessment:
        id_ctx = getattr(identity, "identity_context", None) or {}
        has_past = bool(id_ctx.get("has_past_context"))
        ptr_count = len(getattr(memory, "pointers", []) or [])

        overload = float(overload_score or 0.0)
        overload = max(0.0, min(1.0, overload))

        # Start neutral and refine with operational signals.
        conf = 0.45
        conf += 0.18 if has_past else 0.0
        conf += 0.10 if ptr_count >= 1 else 0.0
        conf += 0.10 if ptr_count >= 3 else 0.0

        if telemetry_ema and isinstance(telemetry_ema, dict):
            c = telemetry_ema.get("C")
            n = telemetry_ema.get("N")
            try:
                if c is not None and n is not None:
                    conf += 0.25 * ((_clamp01(float(c)) + _clamp01(float(n))) * 0.5)
            except Exception:
                pass

        if safety_flag:
            conf -= 0.08
        if global_state.state == PersonaGlobalState.SAFETY_LOCK:
            conf -= 0.18
        elif global_state.state == PersonaGlobalState.OVERLOADED:
            conf -= 0.12
        elif global_state.state == PersonaGlobalState.SILENT:
            conf -= 0.20

        conf -= 0.25 * overload
        conf = _clamp01(conf)

        degraded = bool(conf < 0.40)
        reasons = {
            "has_past_context": has_past,
            "pointer_count": ptr_count,
            "overload_score": overload,
            "safety_flag": safety_flag,
            "global_state": getattr(global_state.state, "name", str(global_state.state)),
        }
        return ContinuityAssessment(confidence=conf, degraded=degraded, reasons=reasons)

