from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from persona_core.phase04.signal_types import CandidateDelta, ExternalSignal, ScoredSignal, TrustProfile


def _clamp01(v: float) -> float:
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return float(v)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class PerceptionOutput:
    scored: List[ScoredSignal] = field(default_factory=list)
    candidate_deltas: List[CandidateDelta] = field(default_factory=list)
    notes: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "scored": [s.to_dict() for s in self.scored],
            "candidate_deltas": [d.to_dict() for d in self.candidate_deltas],
            "notes": self.notes,
        }


class PerceptionLayer:
    """
    Phase04 Layer 3 (MVP):
    - Normalize + score ExternalSignals (trust/relevance/novelty/recency).
    - Produce candidate deltas (informational by default).

    This implementation intentionally avoids semantic truth claims.
    """

    def __init__(self) -> None:
        self._recency_half_life_sec = float(os.getenv("SIGMARIS_PERCEPTION_RECENCY_HALF_LIFE_SEC", "1800") or "1800")
        if self._recency_half_life_sec <= 0:
            self._recency_half_life_sec = 1800.0

    def _trust_profile(self, sig: ExternalSignal) -> TrustProfile:
        st = sig.source_type
        if st == "developer_override":
            return TrustProfile(base_trust=0.95, max_impact=0.95)
        if st == "system_generated":
            return TrustProfile(base_trust=0.75, max_impact=0.55)
        if st == "user_input":
            return TrustProfile(base_trust=0.55, max_impact=0.35)
        if st in ("file_upload_text", "file_upload_code", "file_upload_image"):
            return TrustProfile(base_trust=0.60, max_impact=0.45)
        if st == "github_search":
            return TrustProfile(base_trust=0.50, max_impact=0.30)
        if st == "web_search":
            return TrustProfile(base_trust=0.35, max_impact=0.20)
        return TrustProfile(base_trust=0.30, max_impact=0.15)

    def _recency(self, ts: datetime) -> float:
        try:
            dt = max(0.0, (_now_utc() - ts).total_seconds())
        except Exception:
            dt = 0.0
        # exponential decay; score=1 at dt=0, halves every half-life
        half = self._recency_half_life_sec
        return float(_clamp01(2.0 ** (-dt / half)))

    def _relevance(self, sig: ExternalSignal, *, current_text: str) -> float:
        # MVP heuristic: lexical overlap ratio of words
        a = set((current_text or "").lower().split())
        b = set(str(sig.raw_payload or "").lower().split())
        if not a or not b:
            return 0.0
        inter = len(a.intersection(b))
        union = len(a.union(b))
        return float(_clamp01(inter / float(max(1, union))))

    def _novelty(self, sig: ExternalSignal) -> float:
        # MVP: treat developer/system as low novelty; others moderate
        if sig.source_type in ("developer_override", "system_generated"):
            return 0.15
        return 0.45

    def process(self, *, signals: List[ExternalSignal], current_text: str) -> PerceptionOutput:
        scored: List[ScoredSignal] = []
        for sig in signals:
            tp = self._trust_profile(sig)
            trust = _clamp01(tp.base_trust + tp.consistency_bonus + tp.redundancy_bonus)
            rel = _clamp01(self._relevance(sig, current_text=current_text))
            nov = _clamp01(self._novelty(sig))
            rec = _clamp01(self._recency(sig.timestamp))
            scored.append(
                ScoredSignal(
                    signal=sig,
                    trust_profile=tp,
                    trust_score=trust,
                    relevance_score=rel,
                    novelty_score=nov,
                    recency_score=rec,
                    flags={},
                )
            )

        # MVP candidate delta generation:
        # only propose a bounded "contextual_beliefs" note; Kernel integration is optional/future.
        candidates: List[CandidateDelta] = []
        try:
            max_candidates = int(os.getenv("SIGMARIS_PERCEPTION_MAX_DELTAS", "2") or "2")
        except Exception:
            max_candidates = 2
        ranked = sorted(scored, key=lambda s: float(s.trust_score * 0.6 + s.relevance_score * 0.4), reverse=True)
        for s in ranked[: max(0, max_candidates)]:
            if s.signal.source_type not in ("user_input", "file_upload_text", "file_upload_code", "file_upload_image"):
                continue
            # a non-reconstructive summary stub
            key = f"note:{s.signal.id}"
            candidates.append(
                CandidateDelta(
                    target_category="contextual_beliefs",
                    key=key,
                    operation_type="add_entry",
                    delta_value={"summary": str(s.signal.raw_payload)[:240]},
                    source_reference=s.signal.id,
                    confidence=float(_clamp01(0.5 * s.trust_score + 0.5 * s.relevance_score)),
                    reasons=["mvp_delta:context_note"],
                )
            )

        return PerceptionOutput(
            scored=scored,
            candidate_deltas=candidates,
            notes={"ts_ms": int(time.time() * 1000)},
        )

