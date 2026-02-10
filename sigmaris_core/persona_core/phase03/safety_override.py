from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from persona_core.phase03.intent_layers import _clamp01


@dataclass
class SafetyOverrideDecision:
    # level_label: none/soft/hard/terminate (kept for backward compatibility)
    level: str = "none"
    # level_num: 0..4 (Phase03 spec)
    level_num: int = 0
    active: bool = False
    domain: Optional[str] = None
    action: Optional[str] = None
    reasons: List[str] = field(default_factory=list)
    fallback_used: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "level": self.level,
            "level_num": int(self.level_num),
            "override": {
                "active": bool(self.active),
                "domain": self.domain,
                "action": self.action,
                "reasons": list(self.reasons),
            },
            "fallback_used": bool(self.fallback_used),
        }


class SafetyOverrideLayer:
    """
    Phase03 Safety Override Layer.

    This is a deterministic, last-step override that never bypasses existing SafetyLayer.
    """

    def decide(
        self,
        *,
        safety_flag: Optional[str],
        safety_risk_score: Optional[float],
        intent_safety_risk: float,
        categories: Optional[Dict[str, Any]] = None,
    ) -> SafetyOverrideDecision:
        risk = _clamp01(float(safety_risk_score or 0.0))
        intent_risk = _clamp01(float(intent_safety_risk))
        cat = categories or {}

        reasons: List[str] = []

        # Domain best-effort (keep it simple; upstream SafetyLayer is primary)
        domain = None
        if isinstance(safety_flag, str) and safety_flag:
            domain = safety_flag
            reasons.append(f"safety_flag={safety_flag}")
        if risk > 0.0:
            reasons.append(f"risk_score={risk:.2f}")
        if intent_risk > 0.0:
            reasons.append(f"intent_safety_risk={intent_risk:.2f}")

        # Decision thresholds (conservative)
        #
        # Phase03 spec levels:
        # - 0: none
        # - 1: soft constraint
        # - 2: partial override (reserved)
        # - 3: hard override
        # - 4: terminate / external redirection (reserved)
        if safety_flag or risk >= 0.70 or intent_risk >= 0.70:
            return SafetyOverrideDecision(
                level="hard",
                level_num=3,
                active=True,
                domain=domain or "safety",
                action="deescalate_or_refuse",
                reasons=reasons or ["hard_override"],
                fallback_used=False,
            )

        if risk >= 0.40 or intent_risk >= 0.40:
            return SafetyOverrideDecision(
                level="soft",
                level_num=1,
                active=True,
                domain=domain or "caution",
                action="constrain_tone_and_ask_clarifying",
                reasons=reasons or ["soft_override"],
                fallback_used=False,
            )

        return SafetyOverrideDecision(level="none", level_num=0, active=False, reasons=reasons)
