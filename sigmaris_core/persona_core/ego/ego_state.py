from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


EGO_STATE_VERSION = 1


def _now_ts() -> float:
    return float(time.time())


def _clamp01(v: float) -> float:
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return float(v)


@dataclass
class EgoContinuityState:
    """
    Phase01 Part03: Ego Continuity Layer (E Layer) state model (minimal implementation).

    This is a pragmatic continuity record for safe operations; it is not a claim of qualia.
    """

    ego_id: str
    version: int = EGO_STATE_VERSION

    creation_timestamp: float = field(default_factory=_now_ts)
    last_update_timestamp: float = field(default_factory=_now_ts)
    uptime_accumulated: float = 0.0

    core_traits: List[Dict[str, Any]] = field(default_factory=list)
    core_values: List[Dict[str, Any]] = field(default_factory=list)
    core_goals: List[Dict[str, Any]] = field(default_factory=list)

    life_log_summary: List[Dict[str, Any]] = field(default_factory=list)
    narrative_themes: List[Dict[str, Any]] = field(default_factory=list)

    continuity_belief: float = 0.5
    coherence_score: float = 0.5
    contradiction_register: List[Dict[str, Any]] = field(default_factory=list)

    last_sessions: List[Dict[str, Any]] = field(default_factory=list)
    user_relation_model: Dict[str, Any] = field(default_factory=dict)

    integrity_flags: Dict[str, Any] = field(default_factory=dict)
    noise_level: float = 0.0
    contradiction_tolerance: float = 0.6

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ego_id": self.ego_id,
            "version": int(self.version),
            "creation_timestamp": float(self.creation_timestamp),
            "last_update_timestamp": float(self.last_update_timestamp),
            "uptime_accumulated": float(self.uptime_accumulated),
            "core_traits": self.core_traits,
            "core_values": self.core_values,
            "core_goals": self.core_goals,
            "life_log_summary": self.life_log_summary,
            "narrative_themes": self.narrative_themes,
            "continuity_belief": _clamp01(float(self.continuity_belief)),
            "coherence_score": _clamp01(float(self.coherence_score)),
            "contradiction_register": self.contradiction_register,
            "last_sessions": self.last_sessions,
            "user_relation_model": self.user_relation_model,
            "integrity_flags": self.integrity_flags,
            "noise_level": _clamp01(float(self.noise_level)),
            "contradiction_tolerance": _clamp01(float(self.contradiction_tolerance)),
        }

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "EgoContinuityState":
        ego_id = str(d.get("ego_id") or "")
        if not ego_id:
            raise ValueError("ego_id missing")

        st = EgoContinuityState(ego_id=ego_id)
        st.version = int(d.get("version") or EGO_STATE_VERSION)
        st.creation_timestamp = float(d.get("creation_timestamp") or _now_ts())
        st.last_update_timestamp = float(d.get("last_update_timestamp") or st.creation_timestamp)
        st.uptime_accumulated = float(d.get("uptime_accumulated") or 0.0)

        st.core_traits = list(d.get("core_traits") or [])
        st.core_values = list(d.get("core_values") or [])
        st.core_goals = list(d.get("core_goals") or [])
        st.life_log_summary = list(d.get("life_log_summary") or [])
        st.narrative_themes = list(d.get("narrative_themes") or [])

        st.continuity_belief = float(d.get("continuity_belief") or 0.5)
        st.coherence_score = float(d.get("coherence_score") or 0.5)
        st.contradiction_register = list(d.get("contradiction_register") or [])

        st.last_sessions = list(d.get("last_sessions") or [])
        st.user_relation_model = dict(d.get("user_relation_model") or {})
        st.integrity_flags = dict(d.get("integrity_flags") or {})

        st.noise_level = float(d.get("noise_level") or 0.0)
        st.contradiction_tolerance = float(d.get("contradiction_tolerance") or 0.6)
        return st

