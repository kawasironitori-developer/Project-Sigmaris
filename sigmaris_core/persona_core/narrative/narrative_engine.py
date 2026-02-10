from __future__ import annotations

import os

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from persona_core.identity.identity_continuity import IdentityContinuityResult
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.state.global_state_machine import GlobalStateContext, PersonaGlobalState


@dataclass
class NarrativeSnapshot:
    """
    Phase02 MD-03: Narrative Reconstruction Engine (NRE) - minimal health snapshot.

    This snapshot is intentionally conservative:
    - It does not do post-hoc justification.
    - It provides operator/UI-friendly health metrics & flags that can be extended later.
    """

    theme_label: str
    contradictions: List[Dict[str, Any]] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    coherence_score: float = 0.5
    fragmentation_entropy: float = 0.0
    identity_uncertainty_entropy: float = 0.0
    collapse_suspected: bool = False
    reasons: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "theme_label": self.theme_label,
            "contradictions": self.contradictions,
            "notes": self.notes,
            "coherence_score": float(self.coherence_score),
            "fragmentation_entropy": float(self.fragmentation_entropy),
            "identity_uncertainty_entropy": float(self.identity_uncertainty_entropy),
            "collapse_suspected": bool(self.collapse_suspected),
            "reasons": self.reasons,
        }


class NarrativeEngine:
    def build(
        self,
        *,
        identity: IdentityContinuityResult,
        memory: MemorySelectionResult,
        global_state: GlobalStateContext,
        safety_flag: Optional[str],
    ) -> NarrativeSnapshot:
        id_ctx = getattr(identity, "identity_context", None) or {}
        theme_label = str(id_ctx.get("topic_label") or "").strip()
        if not theme_label:
            theme_label = "unlabeled"

        ptr_count = len(getattr(memory, "pointers", []) or [])
        has_past = bool(id_ctx.get("has_past_context"))

        contradictions: List[Dict[str, Any]] = []
        notes: List[str] = []

        if has_past and ptr_count == 0:
            contradictions.append(
                {
                    "type": "context_without_memory",
                    "severity": 0.30,
                    "message": "has_past_context=True だが memory pointers が 0 です（連続性が低下している可能性）。",
                }
            )

        if global_state.state == PersonaGlobalState.SILENT:
            notes.append("global_state=SILENT（応答抑制モード）")
        if global_state.state == PersonaGlobalState.SAFETY_LOCK:
            notes.append("global_state=SAFETY_LOCK（安全ゲート優先）")
        if safety_flag:
            notes.append(f"safety_flag={safety_flag}")

        # --------------------
        # Phase02: Health metrics (engineering proxies)
        # --------------------
        coherence = 0.35
        coherence += 0.25 if has_past else 0.0
        coherence += 0.22 if ptr_count >= 2 else (0.12 if ptr_count == 1 else 0.0)
        coherence += 0.10 if theme_label not in ("", "unlabeled") else 0.0
        if global_state.state == PersonaGlobalState.SILENT:
            coherence -= 0.20
        if safety_flag:
            coherence -= 0.08
        coherence = max(0.0, min(1.0, float(coherence)))

        # Fragmentation entropy proxy (higher = more fragmentation risk)
        frag = 0.15
        if has_past and ptr_count == 0:
            frag = 0.85
        elif ptr_count <= 1:
            frag = 0.62
        elif ptr_count <= 3:
            frag = 0.42
        else:
            frag = 0.28
        if global_state.state == PersonaGlobalState.SILENT:
            frag = min(1.0, frag + 0.15)
        frag = max(0.0, min(1.0, float(frag)))

        # Identity uncertainty entropy proxy (higher = competing self-model risk)
        id_unc = max(0.0, min(1.0, 0.25 + 0.55 * (1.0 - coherence) + 0.20 * (1.0 if contradictions else 0.0)))

        entropy_high_th = float(os.getenv("SIGMARIS_NARRATIVE_ENTROPY_HIGH", "0.85"))
        contradiction_limit = int(os.getenv("SIGMARIS_CONTRADICTION_OPEN_LIMIT", "6") or "6")
        collapse = bool(frag >= entropy_high_th or len(contradictions) >= contradiction_limit)

        reasons: Dict[str, Any] = {
            "has_past_context": has_past,
            "pointer_count": ptr_count,
            "theme_label_preview": theme_label[:120],
            "entropy_high_threshold": entropy_high_th,
            "contradiction_limit": contradiction_limit,
        }

        return NarrativeSnapshot(
            theme_label=theme_label[:200],
            contradictions=contradictions,
            notes=notes,
            coherence_score=coherence,
            fragmentation_entropy=frag,
            identity_uncertainty_entropy=id_unc,
            collapse_suspected=collapse,
            reasons=reasons,
        )
