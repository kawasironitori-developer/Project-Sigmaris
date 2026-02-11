from __future__ import annotations

import os
from typing import Any, Dict, List

from persona_core.phase04.signal_types import CandidateDelta, GovernanceDecision


def _clamp01(v: float) -> float:
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return float(v)


class GovernanceLayer:
    """
    Phase04 Layer 2 (MVP):
    - Evaluates candidate deltas and returns a decision.
    - Does not apply deltas (Kernel is separate).

    This is intentionally conservative by default.
    """

    def __init__(self) -> None:
        self._trust_th = float(os.getenv("SIGMARIS_GOV_TRUST_THRESHOLD", "0.65") or "0.65")
        self._conf_th = float(os.getenv("SIGMARIS_GOV_CONF_THRESHOLD", "0.55") or "0.55")
        # In MVP, we only approve contextual_beliefs notes.
        self._allowed_categories = set(
            (os.getenv("SIGMARIS_GOV_ALLOWED_CATEGORIES", "contextual_beliefs") or "contextual_beliefs")
            .split(",")
        )

    def decide_growth(
        self,
        *,
        candidate_deltas: List[CandidateDelta],
        signal_summaries: List[Dict[str, Any]],
    ) -> GovernanceDecision:
        approved: List[CandidateDelta] = []
        rejected: List[Dict[str, Any]] = []

        for d in candidate_deltas:
            if d.target_category not in self._allowed_categories:
                rejected.append({"delta": d.to_dict(), "reason": "category_not_allowed"})
                continue

            conf = _clamp01(float(d.confidence))
            if conf < self._conf_th:
                rejected.append({"delta": d.to_dict(), "reason": f"confidence<{self._conf_th:.2f}"})
                continue

            # Use any trust_score from summaries if we can find it
            trust = None
            for s in signal_summaries:
                if s.get("signal_id") == d.source_reference and isinstance(s.get("trust_score"), (int, float)):
                    trust = float(s.get("trust_score"))
                    break
            if trust is not None and trust < self._trust_th:
                rejected.append({"delta": d.to_dict(), "reason": f"trust<{self._trust_th:.2f}"})
                continue

            approved.append(d)

        outcome: str
        if approved:
            outcome = "APPROVE"
        else:
            outcome = "DEFER" if candidate_deltas else "REJECT"

        return GovernanceDecision(
            outcome=outcome,  # type: ignore[arg-type]
            approved=approved,
            rejected=rejected,
            notes={
                "trust_threshold": float(self._trust_th),
                "confidence_threshold": float(self._conf_th),
                "allowed_categories": sorted(list(self._allowed_categories)),
            },
        )

