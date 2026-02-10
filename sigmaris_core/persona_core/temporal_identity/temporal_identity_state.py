from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


def _clamp01(v: float) -> float:
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return float(v)


@dataclass
class PlasticityProfile:
    core_values_max_delta: float = 0.02
    narrative_max_delta: float = 0.06
    style_max_delta: float = 0.10
    tool_policy_max_delta: float = 0.05
    recovery_rate: float = 0.12  # budget per hour (engineering default)
    irreversible_cost_rate: float = 0.25

    def to_dict(self) -> Dict[str, Any]:
        return {
            "core_values_max_delta": float(self.core_values_max_delta),
            "narrative_max_delta": float(self.narrative_max_delta),
            "style_max_delta": float(self.style_max_delta),
            "tool_policy_max_delta": float(self.tool_policy_max_delta),
            "recovery_rate": float(self.recovery_rate),
            "irreversible_cost_rate": float(self.irreversible_cost_rate),
        }

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "PlasticityProfile":
        d = d or {}
        return PlasticityProfile(
            core_values_max_delta=float(d.get("core_values_max_delta", 0.02)),
            narrative_max_delta=float(d.get("narrative_max_delta", 0.06)),
            style_max_delta=float(d.get("style_max_delta", 0.10)),
            tool_policy_max_delta=float(d.get("tool_policy_max_delta", 0.05)),
            recovery_rate=float(d.get("recovery_rate", 0.12)),
            irreversible_cost_rate=float(d.get("irreversible_cost_rate", 0.25)),
        )


@dataclass
class ContinuityFlags:
    continuity_break_suspected: bool = False
    high_noise_suspected: bool = False
    external_overwrite_suspected: bool = False
    fragmentation_suspected: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "continuity_break_suspected": bool(self.continuity_break_suspected),
            "high_noise_suspected": bool(self.high_noise_suspected),
            "external_overwrite_suspected": bool(self.external_overwrite_suspected),
            "fragmentation_suspected": bool(self.fragmentation_suspected),
        }

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "ContinuityFlags":
        d = d or {}
        return ContinuityFlags(
            continuity_break_suspected=bool(d.get("continuity_break_suspected", False)),
            high_noise_suspected=bool(d.get("high_noise_suspected", False)),
            external_overwrite_suspected=bool(d.get("external_overwrite_suspected", False)),
            fragmentation_suspected=bool(d.get("fragmentation_suspected", False)),
        )


@dataclass
class IntegrityFlags:
    schema_mismatch: bool = False
    snapshot_required: bool = False
    manual_review_required: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "schema_mismatch": bool(self.schema_mismatch),
            "snapshot_required": bool(self.snapshot_required),
            "manual_review_required": bool(self.manual_review_required),
        }

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "IntegrityFlags":
        d = d or {}
        return IntegrityFlags(
            schema_mismatch=bool(d.get("schema_mismatch", False)),
            snapshot_required=bool(d.get("snapshot_required", False)),
            manual_review_required=bool(d.get("manual_review_required", False)),
        )


@dataclass
class AttractorState:
    # engineering: we keep only observable distances + lightweight anchor hashes
    dist_to_core: float = 0.0
    dist_to_middle: float = 0.0
    core_hash: Optional[str] = None
    middle_hash: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "dist_to_core": float(self.dist_to_core),
            "dist_to_middle": float(self.dist_to_middle),
            "core_hash": self.core_hash,
            "middle_hash": self.middle_hash,
        }

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "AttractorState":
        d = d or {}
        return AttractorState(
            dist_to_core=float(d.get("dist_to_core", 0.0)),
            dist_to_middle=float(d.get("dist_to_middle", 0.0)),
            core_hash=d.get("core_hash"),
            middle_hash=d.get("middle_hash"),
        )


@dataclass
class PhaseEvent:
    event_id: str
    at: float  # unix seconds
    from_phase: str
    to_phase: str
    confidence: float
    causal_trace: Dict[str, Any] = field(default_factory=dict)
    telemetry_ref: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "at": float(self.at),
            "from_phase": self.from_phase,
            "to_phase": self.to_phase,
            "confidence": float(self.confidence),
            "causal_trace": self.causal_trace or {},
            "telemetry_ref": self.telemetry_ref,
        }

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "PhaseEvent":
        d = d or {}
        return PhaseEvent(
            event_id=str(d.get("event_id") or uuid.uuid4().hex),
            at=float(d.get("at", time.time())),
            from_phase=str(d.get("from_phase") or "NORMAL"),
            to_phase=str(d.get("to_phase") or "NORMAL"),
            confidence=float(d.get("confidence", 0.5)),
            causal_trace=d.get("causal_trace") or {},
            telemetry_ref=d.get("telemetry_ref"),
        )


TEMPORAL_IDENTITY_SCHEMA_VERSION = 1


@dataclass
class TemporalIdentityState:
    # identity anchor
    ego_id: str
    schema_version: int = TEMPORAL_IDENTITY_SCHEMA_VERSION

    # time frame
    created_at: float = field(default_factory=lambda: float(time.time()))
    last_tick_at: float = field(default_factory=lambda: float(time.time()))
    uptime_ms: float = 0.0

    # inertia / plasticity
    base_inertia: float = 0.72
    inertia: float = 0.72
    plasticity_profile: PlasticityProfile = field(default_factory=PlasticityProfile)
    context_coupling: float = 0.55

    # stability resource
    stability_budget: float = 1.0
    budget_max: float = 1.0
    budget_min_safe: float = 0.22

    # continuity sensors
    continuity_confidence: float = 0.5
    continuity_flags: ContinuityFlags = field(default_factory=ContinuityFlags)

    # attractor tracking
    attractor_state: AttractorState = field(default_factory=AttractorState)

    # phase transitions
    phase: str = "NORMAL"  # NORMAL | SHOCK_LOCK | RECONSTRUCTION | DEGRADED_SAFE
    phase_events: List[PhaseEvent] = field(default_factory=list)

    # governance
    integrity: IntegrityFlags = field(default_factory=IntegrityFlags)

    # anchor snapshots (owned by system; not prompt-editable)
    core_anchor: Dict[str, Any] = field(default_factory=dict)
    middle_anchor: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ego_id": self.ego_id,
            "schema_version": int(self.schema_version),
            "created_at": float(self.created_at),
            "last_tick_at": float(self.last_tick_at),
            "uptime_ms": float(self.uptime_ms),
            "base_inertia": float(self.base_inertia),
            "inertia": float(self.inertia),
            "plasticity_profile": self.plasticity_profile.to_dict(),
            "context_coupling": float(self.context_coupling),
            "stability_budget": float(self.stability_budget),
            "budget_max": float(self.budget_max),
            "budget_min_safe": float(self.budget_min_safe),
            "continuity_confidence": float(self.continuity_confidence),
            "continuity_flags": self.continuity_flags.to_dict(),
            "attractor_state": self.attractor_state.to_dict(),
            "phase": self.phase,
            "phase_events": [e.to_dict() for e in (self.phase_events or [])],
            "integrity": self.integrity.to_dict(),
            "core_anchor": self.core_anchor or {},
            "middle_anchor": self.middle_anchor or {},
        }

    @staticmethod
    def new() -> "TemporalIdentityState":
        return TemporalIdentityState(ego_id=uuid.uuid4().hex)

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "TemporalIdentityState":
        d = d or {}
        st = TemporalIdentityState(
            ego_id=str(d.get("ego_id") or uuid.uuid4().hex),
            schema_version=int(d.get("schema_version", TEMPORAL_IDENTITY_SCHEMA_VERSION)),
            created_at=float(d.get("created_at", time.time())),
            last_tick_at=float(d.get("last_tick_at", time.time())),
            uptime_ms=float(d.get("uptime_ms", 0.0)),
            base_inertia=float(d.get("base_inertia", 0.72)),
            inertia=float(d.get("inertia", 0.72)),
            plasticity_profile=PlasticityProfile.from_dict(d.get("plasticity_profile") or {}),
            context_coupling=float(d.get("context_coupling", 0.55)),
            stability_budget=float(d.get("stability_budget", 1.0)),
            budget_max=float(d.get("budget_max", 1.0)),
            budget_min_safe=float(d.get("budget_min_safe", 0.22)),
            continuity_confidence=_clamp01(float(d.get("continuity_confidence", 0.5))),
            continuity_flags=ContinuityFlags.from_dict(d.get("continuity_flags") or {}),
            attractor_state=AttractorState.from_dict(d.get("attractor_state") or {}),
            phase=str(d.get("phase") or "NORMAL"),
            phase_events=[PhaseEvent.from_dict(x) for x in (d.get("phase_events") or [])],
            integrity=IntegrityFlags.from_dict(d.get("integrity") or {}),
            core_anchor=d.get("core_anchor") or {},
            middle_anchor=d.get("middle_anchor") or {},
        )
        if st.schema_version != TEMPORAL_IDENTITY_SCHEMA_VERSION:
            st.integrity.schema_mismatch = True
        st.base_inertia = _clamp01(st.base_inertia)
        st.inertia = _clamp01(st.inertia)
        st.context_coupling = _clamp01(st.context_coupling)
        st.stability_budget = max(0.0, min(float(st.stability_budget), float(st.budget_max)))
        return st

