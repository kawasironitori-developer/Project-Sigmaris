from __future__ import annotations

import math
import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


def _clamp01(v: float) -> float:
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return float(v)


@dataclass
class FailureAssessment:
    level: int  # 0..4
    health_score: float
    drift_velocity: float
    narrative_entropy: float
    identity_entropy: float
    collapse_risk_score: float
    flags: Dict[str, Any] = field(default_factory=dict)
    reasons: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "level": int(self.level),
            "health_score": float(self.health_score),
            "drift_velocity": float(self.drift_velocity),
            "narrative_entropy": float(self.narrative_entropy),
            "identity_entropy": float(self.identity_entropy),
            "collapse_risk_score": float(self.collapse_risk_score),
            "flags": self.flags or {},
            "reasons": list(self.reasons),
        }


class FailureDetectionEngine:
    """
    Phase02 MD-05: Failure Detection Layer.
    - multi-axis health degradation
    - temporal + probabilistic early warnings (engineering approximations)
    """

    def __init__(self) -> None:
        self._prev_identity_dist: Optional[float] = None
        self._prev_ts: Optional[float] = None

        self._w1 = float(os.getenv("SIGMARIS_FD_W_CONTINUITY", "0.28"))
        self._w2 = float(os.getenv("SIGMARIS_FD_W_NARRATIVE", "0.26"))
        self._w3 = float(os.getenv("SIGMARIS_FD_W_VALUE", "0.24"))
        self._w4 = float(os.getenv("SIGMARIS_FD_W_SELF", "0.22"))

    def assess(
        self,
        *,
        continuity_confidence: float,
        narrative_coherence: float,
        narrative_entropy: float,
        value_stability: float,
        self_model_consistency: float,
        identity_distance_to_core: float,
        external_overwrite_suspected: bool,
        contradictions_open: int,
    ) -> FailureAssessment:
        now = time.time()

        # Drift velocity proxy: distance derivative over time.
        dv = 0.0
        if self._prev_identity_dist is not None and self._prev_ts is not None:
            dt = max(1e-3, now - float(self._prev_ts))
            dv = abs(float(identity_distance_to_core) - float(self._prev_identity_dist)) / dt
        self._prev_identity_dist = float(identity_distance_to_core)
        self._prev_ts = now

        # Identity entropy proxy:
        # - contradictions increase uncertainty
        # - low self-model consistency increases uncertainty
        contradiction_term = _clamp01(float(contradictions_open) / float(max(1, int(os.getenv("SIGMARIS_CONTRADICTION_OPEN_LIMIT", "6") or "6"))))
        identity_entropy = _clamp01(0.55 * (1.0 - _clamp01(self_model_consistency)) + 0.45 * contradiction_term)

        # Health composite (MD-05 4.1)
        health = (
            self._w1 * _clamp01(continuity_confidence)
            + self._w2 * _clamp01(narrative_coherence)
            + self._w3 * _clamp01(value_stability)
            + self._w4 * _clamp01(self_model_consistency)
        )
        health = _clamp01(health)

        # Collapse risk: prioritize silent drift & entropy growth.
        dist_term = _clamp01(float(identity_distance_to_core) / float(os.getenv("SIGMARIS_IDENTITY_DIST_HIGH", "1.0")))
        dv_term = _clamp01(float(dv) / float(os.getenv("SIGMARIS_DRIFT_VELOCITY_HIGH", "0.0025")))
        ent_term = _clamp01(float(narrative_entropy))
        collapse = _clamp01(0.35 * dist_term + 0.30 * dv_term + 0.20 * ent_term + 0.15 * identity_entropy)
        if external_overwrite_suspected:
            collapse = _clamp01(max(collapse, 0.92))

        # Leveling (MD-05 5)
        level = 0
        reasons: List[str] = []
        if collapse >= 0.90 or external_overwrite_suspected:
            level = 4
            reasons.append("collapse_imminent")
        elif collapse >= 0.70 or health <= 0.35:
            level = 3
            reasons.append("identity_threat")
        elif collapse >= 0.52 or health <= 0.48:
            level = 2
            reasons.append("stability_risk")
        elif collapse >= 0.35 or health <= 0.60:
            level = 1
            reasons.append("soft_warning")
        else:
            level = 0
            reasons.append("healthy")

        if narrative_entropy >= float(os.getenv("SIGMARIS_NARRATIVE_ENTROPY_HIGH", "0.85")):
            reasons.append("narrative_entropy_high")
        if identity_entropy >= float(os.getenv("SIGMARIS_IDENTITY_ENTROPY_HIGH", "0.75")):
            reasons.append("identity_entropy_high")

        flags = {
            "external_overwrite_suspected": bool(external_overwrite_suspected),
            "narrative_entropy_high": bool(narrative_entropy >= float(os.getenv("SIGMARIS_NARRATIVE_ENTROPY_HIGH", "0.85"))),
            "identity_entropy_high": bool(identity_entropy >= float(os.getenv("SIGMARIS_IDENTITY_ENTROPY_HIGH", "0.75"))),
        }

        return FailureAssessment(
            level=level,
            health_score=float(health),
            drift_velocity=float(dv),
            narrative_entropy=float(_clamp01(narrative_entropy)),
            identity_entropy=float(identity_entropy),
            collapse_risk_score=float(collapse),
            flags=flags,
            reasons=reasons,
        )

