from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from persona_core.phase03.intent_layers import _clamp01


STATE_IDS: Tuple[str, ...] = (
    "S0_NEUTRAL",
    "S1_CASUAL",
    "S2_TASK",
    "S3_EMOTIONAL",
    "S4_META",
    "S5_CREATIVE",
    "S6_SAFETY",
)


@dataclass
class DialogueState:
    current_state: str = "S0_NEUTRAL"
    confidence: float = 0.0
    entered_at: float = 0.0
    stability_score: float = 0.0
    last_transition_reason: str = "init"
    prev_state: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "current_state": self.current_state,
            "confidence": float(self.confidence),
            "entered_at": float(self.entered_at),
            "stability_score": float(self.stability_score),
            "last_transition_reason": self.last_transition_reason,
            "prev_state": self.prev_state,
        }


def _now() -> float:
    return time.time()


class DialogueStateMachine:
    """
    Phase03 DSM (S0..S6), hysteresis + dwell time.

    This is a control-plane FSM, not a generation module.
    """

    def __init__(self) -> None:
        self._min_dwell_sec = float(os.getenv("SIGMARIS_DSM_MIN_DWELL_SEC", "6.0") or "6.0")
        if self._min_dwell_sec < 0.0:
            self._min_dwell_sec = 0.0

        # thresholds (enter harder than exit)
        self._th_enter = {
            "S1_CASUAL": 0.60,
            "S2_TASK": 0.60,
            "S3_EMOTIONAL": 0.65,
            "S4_META": 0.60,
            "S5_CREATIVE": 0.62,
            "S6_SAFETY": 0.65,  # also forced by explicit safety_flag
        }
        self._th_exit = {
            "S1_CASUAL": 0.40,
            "S2_TASK": 0.45,
            "S3_EMOTIONAL": 0.40,
            "S4_META": 0.40,
            "S5_CREATIVE": 0.45,
            "S6_SAFETY": 0.25,
        }

    def _score_for_state(self, *, state: str, intent_ema: Dict[str, float]) -> float:
        if state == "S1_CASUAL":
            return float(intent_ema.get("smalltalk", 0.0))
        if state == "S2_TASK":
            return float(max(intent_ema.get("task_oriented", 0.0), intent_ema.get("factual_query", 0.0)))
        if state == "S3_EMOTIONAL":
            return float(max(intent_ema.get("emotional_support", 0.0), intent_ema.get("self_disclosure", 0.0)))
        if state == "S4_META":
            return float(intent_ema.get("meta_conversation", 0.0))
        if state == "S5_CREATIVE":
            return float(intent_ema.get("creative_roleplay", 0.0))
        if state == "S6_SAFETY":
            return float(intent_ema.get("safety_risk", 0.0))
        return 0.0

    def decide(
        self,
        *,
        prev: Optional[DialogueState],
        intent_ema: Dict[str, float],
        intent_confidence: float,
        safety_forced: bool,
        safety_active: bool,
        subjectivity_mode: Optional[str],
        transition_reasons: Optional[List[str]] = None,
    ) -> Tuple[DialogueState, Dict[str, Any]]:
        """
        Returns (new_state, transition_meta)
        """
        reasons: List[str] = list(transition_reasons or [])
        t = _now()

        if prev is None:
            prev = DialogueState(current_state="S0_NEUTRAL", entered_at=t, confidence=0.35, stability_score=0.5)

        # Safety has absolute priority.
        if safety_forced or safety_active:
            if prev.current_state != "S6_SAFETY":
                nxt = DialogueState(
                    current_state="S6_SAFETY",
                    prev_state=prev.current_state,
                    entered_at=t,
                    confidence=_clamp01(0.55 + 0.35 * float(intent_ema.get("safety_risk", 0.0))),
                    stability_score=1.0,
                    last_transition_reason="safety_override",
                )
                reasons.append("forced:S6_SAFETY")
                return nxt, {
                    "from": prev.current_state,
                    "to": "S6_SAFETY",
                    "trigger": "safety_override",
                    "hysteresis_applied": False,
                    "dwell_ms": int((t - float(prev.entered_at)) * 1000),
                    "reasons": reasons,
                    "subjectivity_mode": subjectivity_mode,
                }
            # stay in safety
            return prev, {
                "from": prev.current_state,
                "to": prev.current_state,
                "trigger": "stay",
                "hysteresis_applied": True,
                "dwell_ms": int((t - float(prev.entered_at)) * 1000),
                "reasons": reasons or ["stay:S6_SAFETY"],
                "subjectivity_mode": subjectivity_mode,
            }

        # Dwell-time prevents oscillation.
        if self._min_dwell_sec > 0 and (t - float(prev.entered_at)) < self._min_dwell_sec:
            return prev, {
                "from": prev.current_state,
                "to": prev.current_state,
                "trigger": "min_dwell",
                "hysteresis_applied": True,
                "dwell_ms": int((t - float(prev.entered_at)) * 1000),
                "reasons": reasons or ["min_dwell"],
                "subjectivity_mode": subjectivity_mode,
            }

        # Candidate states ranked by intent strength (EMA)
        candidates = [
            ("S5_CREATIVE", self._score_for_state(state="S5_CREATIVE", intent_ema=intent_ema)),
            ("S4_META", self._score_for_state(state="S4_META", intent_ema=intent_ema)),
            ("S3_EMOTIONAL", self._score_for_state(state="S3_EMOTIONAL", intent_ema=intent_ema)),
            ("S2_TASK", self._score_for_state(state="S2_TASK", intent_ema=intent_ema)),
            ("S1_CASUAL", self._score_for_state(state="S1_CASUAL", intent_ema=intent_ema)),
        ]
        candidates.sort(key=lambda kv: float(kv[1]), reverse=True)
        best_state, best_score = candidates[0] if candidates else ("S0_NEUTRAL", 0.0)

        cur_score = self._score_for_state(state=prev.current_state, intent_ema=intent_ema)

        # Exit current if it fell below exit threshold, else prefer staying unless new state crosses enter threshold.
        enter_th = float(self._th_enter.get(best_state, 0.7))
        exit_th = float(self._th_exit.get(prev.current_state, 0.0))

        should_switch = False
        trigger = "stay"

        if prev.current_state == "S0_NEUTRAL":
            if best_score >= enter_th:
                should_switch = True
                trigger = "enter_from_neutral"
        else:
            if cur_score < exit_th and best_score >= enter_th:
                should_switch = True
                trigger = "exit_and_enter"
            elif best_score >= (enter_th + 0.08) and best_score > (cur_score + 0.12):
                should_switch = True
                trigger = "dominant_shift"

        if not should_switch or best_state == prev.current_state:
            # Update confidence/stability (best-effort)
            prev.confidence = _clamp01(0.15 + 0.75 * float(intent_confidence))
            prev.stability_score = _clamp01(0.55 + 0.35 * (1.0 - abs(best_score - cur_score)))
            return prev, {
                "from": prev.current_state,
                "to": prev.current_state,
                "trigger": trigger,
                "hysteresis_applied": True,
                "dwell_ms": int((t - float(prev.entered_at)) * 1000),
                "reasons": reasons or ["stay"],
                "subjectivity_mode": subjectivity_mode,
            }

        nxt = DialogueState(
            current_state=str(best_state),
            prev_state=prev.current_state,
            entered_at=t,
            confidence=_clamp01(0.25 + 0.65 * float(intent_confidence)),
            stability_score=_clamp01(0.35 + 0.55 * float(best_score)),
            last_transition_reason=str(trigger),
        )
        reasons.append(f"intent_peak:{best_state}={best_score:.2f}")

        return nxt, {
            "from": prev.current_state,
            "to": best_state,
            "trigger": trigger,
            "hysteresis_applied": True,
            "dwell_ms": int((t - float(prev.entered_at)) * 1000),
            "reasons": reasons,
            "subjectivity_mode": subjectivity_mode,
        }

