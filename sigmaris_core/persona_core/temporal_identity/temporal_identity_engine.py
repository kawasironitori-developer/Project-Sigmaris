from __future__ import annotations

import hashlib
import math
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from persona_core.ego.ego_state import EgoContinuityState
from persona_core.temporal_identity.temporal_identity_state import (
    TEMPORAL_IDENTITY_SCHEMA_VERSION,
    AttractorState,
    ContinuityFlags,
    PhaseEvent,
    TemporalIdentityState,
    _clamp01,
)
from persona_core.trait.trait_drift_engine import TraitState
from persona_core.value.value_drift_engine import ValueState


def _hash_jsonish(d: Dict[str, Any]) -> str:
    # Stable hash for audit/anchor comparison. Avoid heavy canonical JSON; this is engineering-grade.
    raw = repr(sorted(d.items())).encode("utf-8", errors="ignore")
    return hashlib.sha256(raw).hexdigest()


def _vector_from_state(state: Any) -> Dict[str, float]:
    if hasattr(state, "to_dict"):
        out = {}
        for k, v in (state.to_dict() or {}).items():
            try:
                out[str(k)] = float(v)
            except Exception:
                continue
        return out
    return {}


def _euclid(d1: Dict[str, float], d2: Dict[str, float]) -> float:
    keys = set(d1.keys()) | set(d2.keys())
    s = 0.0
    for k in keys:
        s += (float(d1.get(k, 0.0)) - float(d2.get(k, 0.0))) ** 2
    return float(math.sqrt(s))


@dataclass
class TemporalIdentityTelemetry:
    at: float
    ego_id: str
    phase: str
    inertia: float
    context_coupling: float
    stability_budget: float
    continuity_confidence: float
    dist_to_core: float
    dist_to_middle: float
    flags: Dict[str, Any]
    recent_phase_event_ids: list[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "at": float(self.at),
            "ego_id": self.ego_id,
            "phase": self.phase,
            "inertia": float(self.inertia),
            "context_coupling": float(self.context_coupling),
            "stability_budget": float(self.stability_budget),
            "continuity_confidence": float(self.continuity_confidence),
            "dist_to_core": float(self.dist_to_core),
            "dist_to_middle": float(self.dist_to_middle),
            "flags": self.flags or {},
            "recent_phase_event_ids": list(self.recent_phase_event_ids or []),
        }


class TemporalIdentityEngine:
    """
    Phase02 MD-01: Temporal Identity Core (engineering implementation).

    Strong rule: TemporalIdentityState is owned by the system, not the LLM.
    """

    def __init__(self) -> None:
        # shock half-life (seconds)
        raw = os.getenv("SIGMARIS_TID_SHOCK_HALFLIFE_SEC", "21600")  # 6h
        try:
            self._shock_halflife = float(raw)
        except Exception:
            self._shock_halflife = 21600.0
        if self._shock_halflife <= 600:
            self._shock_halflife = 600.0

        raw = os.getenv("SIGMARIS_TID_CONTINUITY_EMA_ALPHA", "0.18")
        try:
            self._cont_alpha = float(raw)
        except Exception:
            self._cont_alpha = 0.18
        if self._cont_alpha <= 0.0:
            self._cont_alpha = 0.18
        if self._cont_alpha > 0.6:
            self._cont_alpha = 0.6

    def _ema(self, prev: float, x: float, a: float) -> float:
        return float(prev) * (1.0 - float(a)) + float(x) * float(a)

    def _ensure_anchors(
        self,
        st: TemporalIdentityState,
        *,
        value_state: ValueState,
        trait_state: TraitState,
        ego_state: Optional[EgoContinuityState],
    ) -> None:
        if not st.core_anchor:
            st.core_anchor = {
                "value": _vector_from_state(value_state),
                "trait": _vector_from_state(trait_state),
                "ego": (ego_state.to_dict() if (ego_state and hasattr(ego_state, "to_dict")) else {}),
                "created_at": float(time.time()),
                "schema_version": TEMPORAL_IDENTITY_SCHEMA_VERSION,
            }
        if not st.middle_anchor:
            # start mid anchor at core anchor
            st.middle_anchor = dict(st.core_anchor)

        st.attractor_state.core_hash = st.attractor_state.core_hash or _hash_jsonish(st.core_anchor)
        st.attractor_state.middle_hash = st.attractor_state.middle_hash or _hash_jsonish(st.middle_anchor)

    def tick(
        self,
        *,
        prev: Optional[TemporalIdentityState],
        continuity_confidence: float,
        continuity_flags: Optional[Dict[str, Any]],
        drift_magnitude: float,
        contradiction_pressure: float,
        external_overwrite_suspected: bool,
        value_state: ValueState,
        trait_state: TraitState,
        ego_state: Optional[EgoContinuityState],
        narrative_entropy: Optional[float],
        trigger_reconstruction: bool,
        trace_id: Optional[str] = None,
    ) -> Tuple[TemporalIdentityState, TemporalIdentityTelemetry, Optional[PhaseEvent]]:
        st = prev or TemporalIdentityState.new()
        if st.schema_version != TEMPORAL_IDENTITY_SCHEMA_VERSION:
            st.integrity.schema_mismatch = True

        now = float(time.time())
        dt = max(0.0, now - float(st.last_tick_at or now))
        st.last_tick_at = now
        st.uptime_ms = float(st.uptime_ms or 0.0) + dt * 1000.0

        self._ensure_anchors(st, value_state=value_state, trait_state=trait_state, ego_state=ego_state)

        # ---- continuity sensors ----
        cont_x = _clamp01(float(continuity_confidence))
        st.continuity_confidence = _clamp01(self._ema(float(st.continuity_confidence or cont_x), cont_x, self._cont_alpha))
        if continuity_flags:
            st.continuity_flags = ContinuityFlags.from_dict(continuity_flags)
        st.continuity_flags.external_overwrite_suspected = bool(external_overwrite_suspected)
        st.continuity_flags.high_noise_suspected = bool(drift_magnitude >= 0.35 or contradiction_pressure >= 0.75)
        st.continuity_flags.fragmentation_suspected = bool((narrative_entropy or 0.0) >= float(os.getenv("SIGMARIS_NARRATIVE_ENTROPY_HIGH", "0.85")))
        st.continuity_flags.continuity_break_suspected = bool(st.continuity_confidence < float(os.getenv("SIGMARIS_TID_CONTINUITY_BREAK_TH", "0.32")))

        # ---- attractor distances ----
        cur_val = _vector_from_state(value_state)
        cur_trait = _vector_from_state(trait_state)
        core_val = (st.core_anchor or {}).get("value") or {}
        core_trait = (st.core_anchor or {}).get("trait") or {}
        mid_val = (st.middle_anchor or {}).get("value") or {}
        mid_trait = (st.middle_anchor or {}).get("trait") or {}

        dist_core = _euclid(cur_val, core_val) + 0.75 * _euclid(cur_trait, core_trait)
        dist_mid = _euclid(cur_val, mid_val) + 0.75 * _euclid(cur_trait, mid_trait)
        st.attractor_state.dist_to_core = float(dist_core)
        st.attractor_state.dist_to_middle = float(dist_mid)

        # ---- inertia dynamics (engineering approximation) ----
        shock_lock = 0.0
        if external_overwrite_suspected or st.integrity.schema_mismatch:
            shock_lock = 0.25
        if trigger_reconstruction:
            shock_lock = max(shock_lock, 0.15)
        if st.continuity_flags.continuity_break_suspected:
            shock_lock = max(shock_lock, 0.18)

        # decay shock_lock with half-life
        if dt > 0.0 and shock_lock > 0.0:
            lam = math.log(2.0) / float(self._shock_halflife)
            shock_lock = float(shock_lock) * float(math.exp(-lam * dt))

        ctx_term = _clamp01(0.25 * contradiction_pressure + 0.20 * _clamp01(drift_magnitude / 0.35))
        recovery_term = 0.0
        if st.continuity_confidence >= 0.65 and drift_magnitude < 0.10 and contradiction_pressure < 0.20:
            recovery_term = 0.08

        st.base_inertia = _clamp01(float(st.base_inertia or 0.72))
        st.inertia = _clamp01(st.base_inertia + shock_lock + ctx_term - recovery_term)

        # ---- stability budget physics ----
        budget = float(st.stability_budget or 0.0)
        bmax = float(st.budget_max or 1.0)
        recovery_per_hour = float(st.plasticity_profile.recovery_rate)
        passive_recovery = (dt / 3600.0) * recovery_per_hour

        drift_cost = float(_clamp01(drift_magnitude / 0.25)) * 0.12
        conflict_cost = float(_clamp01(contradiction_pressure)) * 0.10
        overwrite_cost = 0.35 if external_overwrite_suspected else 0.0
        irreversible_cost = float(st.plasticity_profile.irreversible_cost_rate) if trigger_reconstruction else 0.0

        budget = budget + passive_recovery - drift_cost - conflict_cost - overwrite_cost - irreversible_cost
        budget = max(0.0, min(budget, bmax))
        st.stability_budget = float(budget)

        # ---- phase selection & events ----
        prev_phase = st.phase
        new_phase = "NORMAL"
        if st.stability_budget <= float(st.budget_min_safe or 0.22):
            new_phase = "DEGRADED_SAFE"
        elif external_overwrite_suspected or st.integrity.schema_mismatch:
            new_phase = "SHOCK_LOCK"
        elif trigger_reconstruction or st.continuity_flags.fragmentation_suspected:
            new_phase = "RECONSTRUCTION"

        phase_event: Optional[PhaseEvent] = None
        if new_phase != prev_phase:
            st.phase = new_phase
            phase_event = PhaseEvent(
                event_id=uuid.uuid4().hex,
                at=now,
                from_phase=prev_phase,
                to_phase=new_phase,
                confidence=_clamp01(0.55 + 0.35 * (1.0 - st.continuity_confidence)),
                causal_trace={
                    "trace_id": trace_id,
                    "external_overwrite_suspected": external_overwrite_suspected,
                    "drift_magnitude": float(drift_magnitude),
                    "contradiction_pressure": float(contradiction_pressure),
                    "narrative_entropy": float(narrative_entropy or 0.0),
                    "stability_budget": float(st.stability_budget),
                },
                telemetry_ref=None,
            )
            st.phase_events = (st.phase_events or [])[:200]
            st.phase_events.insert(0, phase_event)

        # ---- update middle anchor slowly when stable (EMA over states) ----
        if st.phase == "NORMAL" and st.stability_budget >= 0.5:
            a = float(os.getenv("SIGMARIS_TID_MIDDLE_ANCHOR_ALPHA", "0.04"))
            if a <= 0.0:
                a = 0.04
            if a > 0.25:
                a = 0.25
            mid_val2 = dict(mid_val)
            for k, v in cur_val.items():
                mid_val2[k] = float(self._ema(float(mid_val2.get(k, v)), float(v), a))
            mid_trait2 = dict(mid_trait)
            for k, v in cur_trait.items():
                mid_trait2[k] = float(self._ema(float(mid_trait2.get(k, v)), float(v), a))
            st.middle_anchor = {**(st.middle_anchor or {}), "value": mid_val2, "trait": mid_trait2, "updated_at": now}
            st.attractor_state.middle_hash = _hash_jsonish(st.middle_anchor)

        recent_ids = [e.event_id for e in (st.phase_events or [])[:6]]
        telemetry = TemporalIdentityTelemetry(
            at=now,
            ego_id=st.ego_id,
            phase=st.phase,
            inertia=float(st.inertia),
            context_coupling=float(st.context_coupling),
            stability_budget=float(st.stability_budget),
            continuity_confidence=float(st.continuity_confidence),
            dist_to_core=float(st.attractor_state.dist_to_core),
            dist_to_middle=float(st.attractor_state.dist_to_middle),
            flags=st.continuity_flags.to_dict(),
            recent_phase_event_ids=recent_ids,
        )
        return st, telemetry, phase_event

