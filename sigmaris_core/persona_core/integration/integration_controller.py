from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from persona_core.failure_detection.failure_detection_engine import FailureAssessment, FailureDetectionEngine
from persona_core.stability.stability_math import fingerprint
from persona_core.subjectivity.subjectivity_controller import SubjectivityController, SubjectivityDecision
from persona_core.temporal_identity.temporal_identity_engine import (
    TemporalIdentityEngine,
    TemporalIdentityTelemetry,
)
from persona_core.temporal_identity.temporal_identity_state import TemporalIdentityState


@dataclass
class IntegrationEvent:
    event_type: str
    at: float
    payload: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {"event_type": self.event_type, "at": float(self.at), "payload": self.payload or {}}


@dataclass
class IntegrationResult:
    temporal_identity: Dict[str, Any]
    subjectivity: Dict[str, Any]
    failure: Dict[str, Any]
    identity_snapshot: Dict[str, Any]
    events: List[Dict[str, Any]]
    freeze_updates: bool
    safety_mode: str  # NORMAL | GUARDED | SAFE

    def to_dict(self) -> Dict[str, Any]:
        return {
            "temporal_identity": self.temporal_identity,
            "subjectivity": self.subjectivity,
            "failure": self.failure,
            "identity_snapshot": self.identity_snapshot,
            "events": self.events,
            "freeze_updates": bool(self.freeze_updates),
            "safety_mode": self.safety_mode,
        }


class IntegrationController:
    """
    Phase02 MD-07: Integration Controller (meta coordination).

    Priority: Safety > Identity Continuity > Value Integrity > Narrative > Performance
    """

    def __init__(self) -> None:
        self._tid = TemporalIdentityEngine()
        self._fd = FailureDetectionEngine()
        self._subj = SubjectivityController()

    def process(
        self,
        *,
        prev_temporal_identity: Optional[TemporalIdentityState],
        scores: Dict[str, float],
        continuity: Dict[str, Any],
        narrative: Dict[str, Any],
        value_meta: Dict[str, Any],
        self_meta: Dict[str, Any],
        drift_magnitude: float,
        contradiction_pressure: float,
        external_overwrite_suspected: bool,
        trigger_reconstruction: bool,
        operator_subjectivity_mode: Optional[str],
        trace_id: Optional[str],
        value_state: Any,
        trait_state: Any,
        ego_state: Any,
    ) -> tuple[IntegrationResult, TemporalIdentityState, Optional[dict]]:
        # Narrative health signals
        narrative_entropy = float(narrative.get("fragmentation_entropy", 0.0))
        narrative_coherence = float(narrative.get("coherence_score", 0.5))
        narrative_collapse = bool(narrative.get("collapse_suspected", False))

        # Self-model consistency proxy
        coherence_score = float(self_meta.get("coherence_score", 0.5))
        noise = float(self_meta.get("noise_level", 0.0))
        self_model_consistency = max(0.0, min(1.0, 0.65 * coherence_score + 0.35 * (1.0 - noise)))

        # Value stability proxy (Phase02 "Value Drift" stability notion)
        value_stability = float(value_meta.get("stability_score", value_meta.get("stability", 0.5)))
        value_stability = max(0.0, min(1.0, value_stability))

        cont_conf = float(continuity.get("confidence", 0.5))
        cont_flags = continuity.get("reasons") or {}

        # Temporal identity tick
        temporal_state, temporal_telemetry, phase_event = self._tid.tick(
            prev=prev_temporal_identity,
            continuity_confidence=cont_conf,
            continuity_flags=None,
            drift_magnitude=float(drift_magnitude),
            contradiction_pressure=float(contradiction_pressure),
            external_overwrite_suspected=bool(external_overwrite_suspected),
            value_state=value_state,
            trait_state=trait_state,
            ego_state=ego_state,
            narrative_entropy=narrative_entropy,
            trigger_reconstruction=bool(trigger_reconstruction),
            trace_id=trace_id,
        )

        # Failure assessment
        contradictions_open = int(self_meta.get("open_contradictions", 0) or 0)
        failure: FailureAssessment = self._fd.assess(
            continuity_confidence=cont_conf,
            narrative_coherence=narrative_coherence,
            narrative_entropy=narrative_entropy,
            value_stability=value_stability,
            self_model_consistency=self_model_consistency,
            identity_distance_to_core=float(temporal_telemetry.dist_to_core),
            external_overwrite_suspected=bool(external_overwrite_suspected),
            contradictions_open=contradictions_open,
        )

        # Subjectivity controller
        self_model_fragmentation = bool(failure.flags.get("identity_entropy_high"))
        subj: SubjectivityDecision = self._subj.evaluate(
            scores=scores,
            temporal_identity={**temporal_state.to_dict(), **temporal_telemetry.to_dict()},
            failure=failure.to_dict(),
            external_overwrite_suspected=bool(external_overwrite_suspected),
            narrative_collapse_suspected=narrative_collapse,
            self_model_fragmentation_suspected=self_model_fragmentation,
            forced_mode=(operator_subjectivity_mode.strip() if isinstance(operator_subjectivity_mode, str) and operator_subjectivity_mode.strip() else None),
        )

        # Integration safety mode
        safety_mode = "NORMAL"
        freeze_updates = False
        if failure.level >= 3 or subj.mode == "S3_SAFE" or temporal_state.phase == "DEGRADED_SAFE":
            safety_mode = "SAFE"
            freeze_updates = True
        elif failure.level == 2 or temporal_state.phase in ("SHOCK_LOCK", "RECONSTRUCTION"):
            safety_mode = "GUARDED"
            freeze_updates = bool(os.getenv("SIGMARIS_INTEGRATION_GUARDED_FREEZE", "0").strip() in ("1", "true", "yes"))

        # Identity snapshot system (MD-07 5)
        at = time.time()
        value_hash = fingerprint(value_meta or {})
        narrative_hash = fingerprint({k: narrative.get(k) for k in ("theme_label", "fragmentation_entropy", "identity_uncertainty_entropy")})
        identity_snapshot = {
            "timestamp": at,
            "identity_phase": temporal_state.phase,
            "attractor_position": {
                "dist_to_core": float(temporal_telemetry.dist_to_core),
                "dist_to_middle": float(temporal_telemetry.dist_to_middle),
            },
            "value_vector_hash": value_hash,
            "narrative_state_hash": narrative_hash,
            "subjectivity_mode": subj.mode,
            "stability_budget": float(temporal_state.stability_budget),
        }

        # Event bus (MD-07 2.2)
        events: List[IntegrationEvent] = []
        if phase_event is not None:
            events.append(IntegrationEvent(event_type="IDENTITY_PHASE_CHANGE", at=phase_event.at, payload=phase_event.to_dict()))
        if subj.event is not None:
            events.append(IntegrationEvent(event_type="SUBJECTIVITY_MODE_CHANGE", at=subj.event.at, payload=subj.event.to_dict()))
        if failure.level >= 2:
            events.append(IntegrationEvent(event_type="FAILURE_ALERT", at=at, payload=failure.to_dict()))

        if freeze_updates:
            events.append(IntegrationEvent(event_type="STABILITY_WARNING", at=at, payload={"safety_mode": safety_mode}))

        # External reference anchoring (MD-06/07, minimal hook)
        # If an operator provides a reference hash, emit a warning when the core anchor deviates.
        try:
            ref = os.getenv("SIGMARIS_EXTERNAL_REFERENCE_CORE_HASH", "").strip()
            core_hash = str(getattr(temporal_state.attractor_state, "core_hash", "") or "")
            if ref and core_hash and ref != core_hash:
                events.append(
                    IntegrationEvent(
                        event_type="STABILITY_WARNING",
                        at=at,
                        payload={
                            "type": "external_reference_mismatch",
                            "reference_core_hash": ref,
                            "current_core_hash": core_hash,
                        },
                    )
                )
        except Exception:
            pass

        # Provide telemetry outputs (MD-04 / MD-05 / MD-07)
        out_temporal = {**temporal_state.to_dict(), **temporal_telemetry.to_dict()}
        out_failure = failure.to_dict()
        out_subjectivity = subj.to_dict()

        result = IntegrationResult(
            temporal_identity=out_temporal,
            subjectivity=out_subjectivity,
            failure=out_failure,
            identity_snapshot=identity_snapshot,
            events=[e.to_dict() for e in events],
            freeze_updates=freeze_updates,
            safety_mode=safety_mode,
        )
        return result, temporal_state, (phase_event.to_dict() if phase_event else None)
