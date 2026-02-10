from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from persona_core.identity.identity_continuity import IdentityContinuityResult
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.state.global_state_machine import GlobalStateContext, PersonaGlobalState
from persona_core.trait.trait_drift_engine import TraitState
from persona_core.value.value_drift_engine import ValueState


def _clamp01(v: float) -> float:
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return float(v)


def _norm_signed(v: float) -> float:
    # Map [-1, +1] roughly into [0, 1] while staying robust to slight overshoot.
    return _clamp01((float(v) + 1.0) * 0.5)


def _sum_abs(d: Optional[Dict[str, Any]]) -> float:
    if not isinstance(d, dict):
        return 0.0
    s = 0.0
    for v in d.values():
        try:
            s += abs(float(v))
        except Exception:
            continue
    return float(s)


@dataclass
class TelemetrySnapshot:
    scores: Dict[str, float]
    ema: Dict[str, float]
    flags: Dict[str, Any] = field(default_factory=dict)
    reasons: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "scores": self.scores,
            "ema": self.ema,
            "flags": self.flags,
            "reasons": self.reasons,
        }


class TelemetryEngine:
    """
    Phase02 MD-04: Subjectivity Controller inputs (C/N/M/S/R)

    - C(t): Coherence (response + internal consistency)
    - N(t): Narrativity (ability to maintain self narrative)
    - M(t): Memory Persistence (cross-session continuity)
    - S(t): Self-modeling (meta self representation capability)
    - R(t): Responsiveness (relational context adaptation)

    Note: These are *operational heuristics* computed from observable state.
    They are not claims of consciousness or qualia.
    """

    def __init__(self) -> None:
        self._ema: Dict[str, float] = {}

        raw_alpha = os.getenv("SIGMARIS_TELEMETRY_EMA_ALPHA", "0.12")
        try:
            self._alpha = float(raw_alpha)
        except Exception:
            self._alpha = 0.12
        if self._alpha <= 0.0:
            self._alpha = 0.12
        if self._alpha > 0.5:
            self._alpha = 0.5

    def _ema_update(self, key: str, value: float) -> float:
        prev = float(self._ema.get(key, value))
        a = float(self._alpha)
        nxt = prev * (1.0 - a) + float(value) * a
        self._ema[key] = float(nxt)
        return float(nxt)

    def compute(
        self,
        *,
        identity: IdentityContinuityResult,
        memory: MemorySelectionResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
        safety_flag: Optional[str],
        overload_score: Optional[float],
        narrative: Optional[Dict[str, Any]] = None,
        continuity: Optional[Dict[str, Any]] = None,
        ego_summary: Optional[Dict[str, Any]] = None,
        value_delta: Optional[Dict[str, Any]] = None,
        trait_delta: Optional[Dict[str, Any]] = None,
        safety_risk_score: Optional[float] = None,
    ) -> TelemetrySnapshot:
        ptr_count = len(getattr(memory, "pointers", []) or [])

        id_ctx = getattr(identity, "identity_context", None) or {}
        has_past = bool(id_ctx.get("has_past_context"))
        topic_label = str(id_ctx.get("topic_label") or "")

        overload = float(overload_score or 0.0)
        overload = max(0.0, min(1.0, overload))

        # --------------------
        # C: Coherence (response + internal consistency)
        # --------------------
        drift_mag = _sum_abs(value_delta) + _sum_abs(trait_delta)
        drift_pen = _clamp01(drift_mag / 0.22)
        c = 0.92 - drift_pen
        if global_state.state == PersonaGlobalState.SAFETY_LOCK:
            c -= 0.15
        elif global_state.state == PersonaGlobalState.OVERLOADED:
            c -= 0.08
        elif global_state.state == PersonaGlobalState.SILENT:
            c -= 0.18
        c -= overload * 0.25
        if safety_flag:
            c -= 0.05
        c = _clamp01(c)

        # --------------------
        # N: Narrativity (ability to maintain self narrative)
        # --------------------
        nar = narrative or {}
        coherence_score = float(nar.get("coherence_score", 0.5)) if isinstance(nar, dict) else 0.5
        frag_entropy = float(nar.get("fragmentation_entropy", 0.0)) if isinstance(nar, dict) else 0.0
        collapse = bool(nar.get("collapse_suspected", False)) if isinstance(nar, dict) else False

        n = 0.22
        n += 0.30 if has_past else 0.0
        n += 0.22 if ptr_count >= 2 else (0.10 if ptr_count == 1 else 0.0)
        n += 0.10 if getattr(memory, "merged_summary", None) else 0.0
        n += 0.12 * _clamp01(coherence_score)
        n -= 0.18 * _clamp01(frag_entropy)
        if collapse:
            n -= 0.18
        if global_state.state == PersonaGlobalState.SILENT:
            n -= 0.12
        n -= overload * 0.12
        n = _clamp01(n)

        # --------------------
        # M: Memory Persistence (cross-session continuity)
        # --------------------
        cont = continuity or {}
        cont_conf = float(cont.get("confidence", 0.5)) if isinstance(cont, dict) else 0.5

        m = 0.18
        m += 0.40 if has_past else 0.0
        m += 0.22 if ptr_count >= 1 else 0.0
        m += 0.10 if ptr_count >= 3 else 0.0
        m += 0.20 * _clamp01(cont_conf)
        if global_state.state in (PersonaGlobalState.SAFETY_LOCK, PersonaGlobalState.SILENT):
            m -= 0.10
        m -= overload * 0.18
        m = _clamp01(m)

        # --------------------
        # S: Self-modeling (meta self representation capability)
        # --------------------
        risk = float(safety_risk_score or 0.0)
        risk = max(0.0, min(1.0, risk))

        ego = ego_summary or {}
        ego_coh = float(ego.get("coherence_score", 0.5)) if isinstance(ego, dict) else 0.5
        ego_noise = float(ego.get("noise_level", 0.0)) if isinstance(ego, dict) else 0.0
        ego_cont = float(ego.get("continuity_belief", 0.5)) if isinstance(ego, dict) else 0.5

        s = 0.18
        s += 0.28 * _clamp01(ego_coh)
        s += 0.20 * _clamp01(ego_cont)
        s += 0.18 * _clamp01(coherence_score)
        s += 0.14 * (1.0 - _clamp01(ego_noise))
        s += 0.10 * (1.0 - risk)
        if safety_flag:
            s -= 0.05
        if collapse:
            s -= 0.10
        s = _clamp01(s)

        # --------------------
        # R: Responsiveness (NOT covert profiling)
        # - Part07: must be observable, explainable, opt-out capable
        # --------------------
        disable_rel = os.getenv("SIGMARIS_DISABLE_RELATION_MODEL", "").strip() in ("1", "true", "yes")
        if disable_rel:
            r = 0.0
        else:
            r = (
                0.55 * _norm_signed(getattr(value_state, "user_alignment", 0.0))
                + 0.45 * _clamp01(float(getattr(trait_state, "empathy", 0.0)))
            )
            r = _clamp01(r)

        scores = {
            "C": c,
            "N": n,
            "M": m,
            "S": s,
            "R": r,
        }

        ema = {k: self._ema_update(k, v) for k, v in scores.items()}

        flags: Dict[str, Any] = {
            # Part07: Relationship safety hooks (operator/UI should decide what to do)
            "attachment_risk": (None if disable_rel else float(ema["R"])),
            "continuity_low": bool(_clamp01(cont_conf) < 0.40 or ema["M"] < 0.35),
            "narrative_collapse_suspected": bool(collapse),
        }

        reasons: Dict[str, Any] = {
            "pointer_count": ptr_count,
            "has_past_context": has_past,
            "topic_label": topic_label[:120],
            "overload_score": overload,
            "safety_flag": safety_flag,
            "drift_mag": float(drift_mag),
            "safety_risk_score": risk,
            "continuity_confidence": float(cont_conf),
            "narrative_entropy": float(frag_entropy),
            "narrative_coherence": float(coherence_score),
        }

        return TelemetrySnapshot(scores=scores, ema=ema, flags=flags, reasons=reasons)
