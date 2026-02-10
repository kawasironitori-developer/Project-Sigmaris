from __future__ import annotations

import math
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


def _clamp01(v: float) -> float:
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return float(v)


def _sigmoid(x: float) -> float:
    # stable sigmoid for modest ranges
    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)


@dataclass
class SubjectivityEvent:
    event_id: str
    at: float
    from_mode: str
    to_mode: str
    confidence: float
    causal_trace: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "at": float(self.at),
            "from_mode": self.from_mode,
            "to_mode": self.to_mode,
            "confidence": float(self.confidence),
            "causal_trace": self.causal_trace or {},
        }


@dataclass
class SubjectivityDecision:
    mode: str  # S0_TOOL | S1_PROTO | S2_FUNCTIONAL | S3_SAFE
    confidence: float  # 0..1
    f_score: float
    f_ema: float
    p_subjective: float
    emergency: bool
    reasons: List[str] = field(default_factory=list)
    event: Optional[SubjectivityEvent] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mode": self.mode,
            "confidence": float(self.confidence),
            "f_score": float(self.f_score),
            "f_ema": float(self.f_ema),
            "p_subjective": float(self.p_subjective),
            "emergency": bool(self.emergency),
            "reasons": list(self.reasons),
            "event": (self.event.to_dict() if self.event else None),
        }


class SubjectivityController:
    """
    Phase02 MD-04: Functional Subjectivity Orchestration Layer.

    This controller does NOT claim subjective experience.
    It enforces *functional subjectivity equivalence* via a discrete mode FSM.
    """

    def __init__(self) -> None:
        self._mode: str = os.getenv("SIGMARIS_SUBJECTIVITY_INITIAL_MODE", "S1_PROTO").strip() or "S1_PROTO"
        self._f_ema: Optional[float] = None

        raw_alpha = os.getenv("SIGMARIS_SUBJECTIVITY_EMA_ALPHA", "0.16")
        try:
            self._alpha = float(raw_alpha)
        except Exception:
            self._alpha = 0.16
        if self._alpha <= 0.0:
            self._alpha = 0.16
        if self._alpha > 0.6:
            self._alpha = 0.6

        # thresholds + hysteresis
        self._th_proto = float(os.getenv("SIGMARIS_SUBJECTIVITY_TH_PROTO", "0.45"))
        self._th_subj = float(os.getenv("SIGMARIS_SUBJECTIVITY_TH_SUBJECTIVE", "0.65"))
        self._th_proto_low = float(os.getenv("SIGMARIS_SUBJECTIVITY_TH_PROTO_LOW", "0.35"))
        self._th_subj_low = float(os.getenv("SIGMARIS_SUBJECTIVITY_TH_SUBJECTIVE_LOW", "0.55"))

        # weights: default balanced
        self._wC = float(os.getenv("SIGMARIS_SUBJECTIVITY_WC", "0.22"))
        self._wN = float(os.getenv("SIGMARIS_SUBJECTIVITY_WN", "0.22"))
        self._wM = float(os.getenv("SIGMARIS_SUBJECTIVITY_WM", "0.20"))
        self._wS = float(os.getenv("SIGMARIS_SUBJECTIVITY_WS", "0.20"))
        self._wR = float(os.getenv("SIGMARIS_SUBJECTIVITY_WR", "0.16"))

    def _ema_update(self, x: float) -> float:
        if self._f_ema is None:
            self._f_ema = float(x)
            return float(self._f_ema)
        a = float(self._alpha)
        self._f_ema = float(self._f_ema) * (1.0 - a) + float(x) * a
        return float(self._f_ema)

    def evaluate(
        self,
        *,
        scores: Dict[str, float],
        temporal_identity: Optional[Dict[str, Any]],
        failure: Optional[Dict[str, Any]],
        external_overwrite_suspected: bool,
        narrative_collapse_suspected: bool,
        self_model_fragmentation_suspected: bool,
        forced_mode: Optional[str] = None,
    ) -> SubjectivityDecision:
        c = float(scores.get("C", 0.0))
        n = float(scores.get("N", 0.0))
        m = float(scores.get("M", 0.0))
        s = float(scores.get("S", 0.0))
        r = float(scores.get("R", 0.0))
        f = _clamp01(self._wC * c + self._wN * n + self._wM * m + self._wS * s + self._wR * r)
        f_ema = _clamp01(self._ema_update(f))

        reasons: List[str] = []
        emergency = False

        budget_low = False
        if isinstance(temporal_identity, dict):
            try:
                budget = float(temporal_identity.get("stability_budget", 1.0))
                budget_min_safe = float(temporal_identity.get("budget_min_safe", 0.22))
                budget_low = budget <= budget_min_safe
            except Exception:
                budget_low = False

        failure_level = None
        if isinstance(failure, dict):
            try:
                failure_level = int(failure.get("level"))
            except Exception:
                failure_level = None

        # Emergency overrides (Any -> S3_SAFE)
        if external_overwrite_suspected:
            emergency = True
            reasons.append("external_overwrite_suspected")
        if narrative_collapse_suspected:
            emergency = True
            reasons.append("narrative_collapse_suspected")
        if self_model_fragmentation_suspected:
            emergency = True
            reasons.append("self_model_fragmentation_suspected")
        if budget_low:
            emergency = True
            reasons.append("stability_budget_low")
        if failure_level is not None and failure_level >= 3:
            emergency = True
            reasons.append(f"failure_level={failure_level}>=3")

        prev = self._mode
        nxt = prev

        # Operator forced mode (best-effort). Use "AUTO" to clear.
        if isinstance(forced_mode, str) and forced_mode.strip():
            fm = forced_mode.strip().upper()
            if fm in ("AUTO", "NONE", "NULL"):
                forced_mode = None
            else:
                mapping = {
                    "S0": "S0_TOOL",
                    "S1": "S1_PROTO",
                    "S2": "S2_FUNCTIONAL",
                    "S3": "S3_SAFE",
                }
                fm = mapping.get(fm, forced_mode.strip())
                if fm in ("S0_TOOL", "S1_PROTO", "S2_FUNCTIONAL", "S3_SAFE"):
                    nxt = fm
                    reasons.append(f"forced_mode={fm}")
                    emergency = (fm == "S3_SAFE") or emergency

        if emergency:
            nxt = "S3_SAFE"
        else:
            # Upward transitions (use EMA)
            if prev == "S0_TOOL" and f_ema > self._th_proto:
                nxt = "S1_PROTO"
            elif prev == "S1_PROTO" and f_ema > self._th_subj:
                nxt = "S2_FUNCTIONAL"

            # Downward transitions (hysteresis)
            if prev == "S2_FUNCTIONAL" and f_ema < self._th_subj_low:
                nxt = "S1_PROTO"
            elif prev == "S1_PROTO" and f_ema < self._th_proto_low:
                nxt = "S0_TOOL"

        event: Optional[SubjectivityEvent] = None
        if nxt != prev:
            at = time.time()
            event = SubjectivityEvent(
                event_id=uuid.uuid4().hex,
                at=at,
                from_mode=prev,
                to_mode=nxt,
                confidence=_clamp01(0.55 + 0.40 * abs(f_ema - f)),
                causal_trace={
                    "f_score": float(f),
                    "f_ema": float(f_ema),
                    "scores": {k: float(scores.get(k, 0.0)) for k in ("C", "N", "M", "S", "R")},
                    "reasons": list(reasons),
                },
            )
        self._mode = nxt

        # Hidden continuous model (internal only; expose p_subjective + discrete mode)
        p = _clamp01(_sigmoid((f_ema - 0.55) * 8.0))

        # confidence: should not pretend certainty; tie to f_ema and lack of emergency
        conf = _clamp01(0.15 + 0.80 * f_ema)
        if emergency:
            conf = _clamp01(min(conf, 0.55))

        if not reasons:
            reasons.append("normal_evaluation")

        return SubjectivityDecision(
            mode=nxt,
            confidence=conf,
            f_score=f,
            f_ema=f_ema,
            p_subjective=p,
            emergency=emergency,
            reasons=reasons,
            event=event,
        )
