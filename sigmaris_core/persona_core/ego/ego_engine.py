from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from persona_core.ego.ego_state import EGO_STATE_VERSION, EgoContinuityState, _clamp01
from persona_core.identity.identity_continuity import IdentityContinuityResult
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.state.global_state_machine import GlobalStateContext
from persona_core.trait.trait_drift_engine import TraitState
from persona_core.value.value_drift_engine import ValueState


@dataclass
class EgoUpdateResult:
    state: EgoContinuityState
    integrity_flags: Dict[str, Any]
    summary: Dict[str, Any]


class EgoEngine:
    """
    Phase01 Part03: E Layer minimal update engine.
    - version check & integrity flags
    - continuity_belief / coherence_score update
    - contradiction register bookkeeping
    - narrative themes reinforcement
    """

    def __init__(self) -> None:
        raw = os.getenv("SIGMARIS_EGO_CONTINUITY_EMA_ALPHA", "0.2")
        try:
            self._alpha = float(raw)
        except Exception:
            self._alpha = 0.2
        if self._alpha <= 0.0:
            self._alpha = 0.2
        if self._alpha > 0.6:
            self._alpha = 0.6

    def _ema(self, prev: float, x: float) -> float:
        a = float(self._alpha)
        return float(prev) * (1.0 - a) + float(x) * a

    def _new_state(self) -> EgoContinuityState:
        return EgoContinuityState(ego_id=uuid.uuid4().hex)

    def update(
        self,
        *,
        prev: Optional[EgoContinuityState],
        user_id: str,
        session_id: Optional[str],
        identity: IdentityContinuityResult,
        memory: MemorySelectionResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
        telemetry: Optional[Dict[str, Any]],
        continuity: Optional[Dict[str, Any]],
        narrative: Optional[Dict[str, Any]],
        overload_score: Optional[float],
        drift_mag: Optional[float],
    ) -> EgoUpdateResult:
        integrity_flags: Dict[str, Any] = {}

        st = prev or self._new_state()
        if int(getattr(st, "version", 0) or 0) != int(EGO_STATE_VERSION):
            integrity_flags["schema_mismatch"] = True
            st.integrity_flags = {**(st.integrity_flags or {}), **integrity_flags}
            return EgoUpdateResult(
                state=st,
                integrity_flags=st.integrity_flags,
                summary={"note": "schema_mismatch"},
            )

        now = float(time.time())
        dt = max(0.0, now - float(st.last_update_timestamp or now))
        st.last_update_timestamp = now
        st.uptime_accumulated = float(st.uptime_accumulated or 0.0) + dt

        # core snapshots (minimal)
        st.core_traits = [
            {"name": k, "strength": float(v), "last_confirmed": now}
            for k, v in (trait_state.to_dict() if hasattr(trait_state, "to_dict") else {}).items()
        ]
        st.core_values = [
            {"name": k, "priority": float(v), "last_confirmed": now}
            for k, v in (value_state.to_dict() if hasattr(value_state, "to_dict") else {}).items()
        ]

        # narrative theme reinforcement
        theme = ""
        try:
            theme = str((identity.identity_context or {}).get("topic_label") or "").strip()
        except Exception:
            theme = ""
        if theme:
            st.narrative_themes = (st.narrative_themes or [])[:50]
            st.narrative_themes.insert(
                0,
                {
                    "label": theme[:200],
                    "confidence": 0.5,
                    "last_reinforced": now,
                },
            )

        # contradiction register: keep small & append new
        contradictions = []
        if isinstance(narrative, dict) and isinstance(narrative.get("contradictions"), list):
            contradictions = narrative.get("contradictions") or []
        reg = list(st.contradiction_register or [])
        for c in contradictions[:10]:
            try:
                key = f"{c.get('type')}|{c.get('message')}"
                if any(r.get("key") == key for r in reg):
                    continue
                reg.insert(
                    0,
                    {
                        "id": uuid.uuid4().hex,
                        "key": key,
                        "type": c.get("type"),
                        "message": c.get("message"),
                        "severity": float(c.get("severity") or 0.2),
                        "status": "open",
                        "opened_at": now,
                        "updated_at": now,
                    },
                )
            except Exception:
                continue
        st.contradiction_register = reg[:80]

        # continuity/coherence
        cont_conf = None
        if isinstance(continuity, dict):
            cont_conf = continuity.get("confidence")
        cont_conf_f = float(cont_conf) if isinstance(cont_conf, (int, float)) else 0.5
        st.continuity_belief = _clamp01(self._ema(float(st.continuity_belief or 0.5), cont_conf_f))

        # Phase02: self-model coherence should be computable even if telemetry is absent.
        # Prefer narrative coherence + continuity over telemetry EMA.
        narrative_coh = 0.5
        if isinstance(narrative, dict) and isinstance(narrative.get("coherence_score"), (int, float)):
            narrative_coh = float(narrative.get("coherence_score"))

        c_ema = None
        n_ema = None
        if isinstance(telemetry, dict) and isinstance(telemetry.get("ema"), dict):
            ema = telemetry.get("ema") or {}
            try:
                c_ema = float(ema.get("C")) if ema.get("C") is not None else None
                n_ema = float(ema.get("N")) if ema.get("N") is not None else None
            except Exception:
                c_ema = None
                n_ema = None

        telemetry_hint = 0.5
        if isinstance(c_ema, (int, float)) and isinstance(n_ema, (int, float)):
            telemetry_hint = _clamp01((float(c_ema) + float(n_ema)) * 0.5)

        st.coherence_score = _clamp01(
            0.55 * float(st.continuity_belief)
            + 0.30 * _clamp01(float(narrative_coh))
            + 0.15 * _clamp01(float(telemetry_hint))
        )

        # noise level heuristic
        overload = float(overload_score or 0.0)
        overload = max(0.0, min(1.0, overload))
        drift = float(drift_mag or 0.0)
        drift_scaled = _clamp01(drift / 0.35)
        contradiction_scaled = _clamp01(len(contradictions) / max(1.0, float(os.getenv("SIGMARIS_CONTRADICTION_OPEN_LIMIT", "6") or "6")))
        st.noise_level = _clamp01(0.55 * overload + 0.30 * drift_scaled + 0.15 * contradiction_scaled)

        # user relation model (observable)
        try:
            attach = telemetry.get("flags", {}).get("attachment_risk") if isinstance(telemetry, dict) else None
            st.user_relation_model = {
                "attachment_risk": float(attach) if isinstance(attach, (int, float)) else None,
                "updated_at": now,
            }
        except Exception:
            pass

        # integrity flags (minimal)
        st.integrity_flags = {**(st.integrity_flags or {}), **integrity_flags}

        summary = {
            "ego_id": st.ego_id,
            "version": st.version,
            "continuity_belief": float(st.continuity_belief),
            "coherence_score": float(st.coherence_score),
            "noise_level": float(st.noise_level),
            "open_contradictions": sum(1 for r in st.contradiction_register if r.get("status") == "open"),
        }
        return EgoUpdateResult(state=st, integrity_flags=st.integrity_flags, summary=summary)
