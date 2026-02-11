# sigmaris-core/persona_core/controller/persona_controller.py
#
# Persona OS 完全版 — 1ターン統合制御
# Memory / Identity / Drift / FSM / LLM / PersonaDB との完全整合版
#
# 修正方針（既存構造は削らない）：
# - user_id が None になりうる経路を潰す
# - identity_result / global_state の属性差異を安全に吸収
# - memory_result.raw を meta・DB 保存の双方に確実に載せる

from __future__ import annotations

import os
import threading
import uuid
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Optional
from datetime import datetime, timezone

from persona_core.memory.episode_store import Episode
from persona_core.types.core_types import PersonaRequest
from persona_core.trace import TRACE_INCLUDE_TEXT, get_logger, preview_text, trace_event

from persona_core.memory.memory_orchestrator import (
    MemoryOrchestrator,
    MemorySelectionResult,
)

from persona_core.identity.identity_continuity import (
    IdentityContinuityEngineV3,
    IdentityContinuityResult,
)

from persona_core.value.value_drift_engine import (
    ValueDriftEngine,
    ValueDriftResult,
    ValueState,
)

from persona_core.trait.trait_drift_engine import (
    TraitDriftEngine,
    TraitDriftResult,
    TraitState,
)

from persona_core.state.global_state_machine import (
    GlobalStateMachine,
    GlobalStateContext,
    PersonaGlobalState,
)
from persona_core.state.continuity_engine import ContinuityEngine
from persona_core.telemetry.telemetry_engine import TelemetryEngine
from persona_core.narrative.narrative_engine import NarrativeEngine
from persona_core.guardrail.guardrail_engine import GuardrailEngine
from persona_core.ego.ego_engine import EgoEngine
from persona_core.ego.ego_state import EgoContinuityState
from persona_core.integration.integration_controller import IntegrationController
from persona_core.temporal_identity.temporal_identity_state import TemporalIdentityState
from persona_core.phase03.intent_layers import IntentLayers, IntentVectorEMA
from persona_core.phase03.dialogue_state_machine import STATE_IDS, DialogueState, DialogueStateMachine
from persona_core.phase03.safety_override import SafetyOverrideLayer


# --------------------------------------------------------------
# LLM client interface
# --------------------------------------------------------------

class LLMClientLike:
    def generate(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> str:
        raise NotImplementedError

    # Optional streaming interface. If implemented, controller can stream reply text.
    def generate_stream(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ):
        raise NotImplementedError


# --------------------------------------------------------------
# 設定型 / 結果型
# --------------------------------------------------------------

@dataclass
class PersonaControllerConfig:
    enable_reflection: bool = False
    default_user_id: Optional[str] = None


@dataclass
class PersonaTurnResult:
    reply_text: str
    memory: MemorySelectionResult
    identity: IdentityContinuityResult
    value: ValueDriftResult
    trait: TraitDriftResult
    global_state: GlobalStateContext
    meta: Dict[str, Any] = field(default_factory=dict)


# --------------------------------------------------------------
# PersonaController 本体
# --------------------------------------------------------------

class PersonaController:
    """
    Persona OS 完全版のワンターン統合制御クラス。
    """

    def __init__(
        self,
        *,
        config: Optional[PersonaControllerConfig] = None,
        memory_orchestrator: MemoryOrchestrator,
        identity_engine: IdentityContinuityEngineV3,
        value_engine: ValueDriftEngine,
        trait_engine: TraitDriftEngine,
        global_fsm: GlobalStateMachine,
        episode_store: Any,
        persona_db: Any,
        llm_client: LLMClientLike,
        initial_value_state: Optional[ValueState] = None,
        initial_trait_state: Optional[TraitState] = None,
        initial_trait_baseline: Optional[TraitState] = None,
        initial_ego_state: Optional[EgoContinuityState] = None,
        initial_temporal_identity_state: Optional[TemporalIdentityState] = None,
    ) -> None:

        self._config = config or PersonaControllerConfig()

        # Engines
        self._memory = memory_orchestrator
        self._identity = identity_engine
        self._value = value_engine
        self._trait = trait_engine
        self._fsm = global_fsm
        self._telemetry = TelemetryEngine()
        self._continuity = ContinuityEngine()
        self._narrative = NarrativeEngine()
        self._guardrail = GuardrailEngine()
        self._ego = EgoEngine()
        self._ego_state: Optional[EgoContinuityState] = initial_ego_state
        self._integration = IntegrationController()
        self._temporal_identity_state: Optional[TemporalIdentityState] = initial_temporal_identity_state
        self._freeze_updates: bool = False

        # Phase03: Intent + Routing + Dialogue DSM + Safety Override
        self._intent_layers = IntentLayers()
        self._dsm = DialogueStateMachine()
        self._safety_override = SafetyOverrideLayer()
        self._intent_ema_by_session: Dict[str, IntentVectorEMA] = {}
        self._dialogue_state_by_session: Dict[str, DialogueState] = {}
        self._auto_recovery_prev_by_session: Dict[str, Dict[str, float]] = {}
        try:
            self._phase03_session_cap = int(os.getenv("SIGMARIS_PHASE03_SESSION_CAP", "1024") or "1024")
        except Exception:
            self._phase03_session_cap = 1024
        if self._phase03_session_cap < 16:
            self._phase03_session_cap = 16

        # Backends
        self._episode_store = episode_store
        self._db = persona_db
        self._llm = llm_client

        # Internal states
        self._value_state = initial_value_state or ValueState()
        self._trait_state = initial_trait_state or TraitState()
        # 「成長」の軸: baseline（ユーザー固有の体質）
        self._trait_baseline = initial_trait_baseline or TraitState()
        self._prev_global_state: Optional[PersonaGlobalState] = None

    # ==========================================================
    # Main turn
    # ==========================================================

    def _decide_auto_recovery(self, *, session_id: str, failure: Any) -> Dict[str, Any]:
        """
        Phase02 FailureDetection -> Phase03 Auto Recovery (best-effort).

        - Forces a safer/explanatory dialogue state when needed.
        - Optionally stops memory injection into the LLM prompt.
        - Always returns a non-null dict (stable keys).
        """

        f = failure if isinstance(failure, dict) else {}

        try:
            level = int(f.get("level") or 0)
        except Exception:
            level = 0
        try:
            health = _as_float(f.get("health_score"), 1.0)
        except Exception:
            health = 1.0
        try:
            collapse = _as_float(f.get("collapse_risk_score"), 0.0)
        except Exception:
            collapse = 0.0
        try:
            flags: Dict[str, Any] = f.get("flags") if isinstance(f.get("flags"), dict) else {}
        except Exception:
            flags = {}
        try:
            reasons_raw = f.get("reasons")
            reasons = [str(x) for x in reasons_raw if x is not None] if isinstance(reasons_raw, list) else []
        except Exception:
            reasons = []

        prev = self._auto_recovery_prev_by_session.get(session_id) if session_id else None
        has_prev = isinstance(prev, dict)
        prev_level = int(prev.get("level", -1)) if has_prev else -1
        prev_health = float(prev.get("health_score", 1.0)) if has_prev else 1.0
        prev_collapse = float(prev.get("collapse_risk_score", 0.0)) if has_prev else 0.0

        try:
            worsened = bool(
                has_prev
                and (
                    (level > prev_level)
                    or (collapse - prev_collapse >= 0.12)
                    or (health <= prev_health - 0.10)
                )
            )
        except Exception:
            worsened = False

        forced_state = ""
        try:
            if level >= 3 or collapse >= 0.70 or bool(flags.get("external_overwrite_suspected")):
                forced_state = "S6_SAFETY"
            elif level >= 2 and worsened:
                forced_state = "S4_META"
        except Exception:
            forced_state = ""

        try:
            stop_level = int(os.getenv("SIGMARIS_AUTO_RECOVERY_STOP_MEMORY_LEVEL", "3") or "3")
        except Exception:
            stop_level = 3
        if stop_level < 0:
            stop_level = 0

        try:
            stop_memory_injection = bool(
                forced_state == "S6_SAFETY"
                or level >= stop_level
                or bool(flags.get("external_overwrite_suspected"))
            )
        except Exception:
            stop_memory_injection = False

        active = bool(forced_state)

        if session_id:
            try:
                self._auto_recovery_prev_by_session[session_id] = {
                    "level": float(level),
                    "health_score": float(health),
                    "collapse_risk_score": float(collapse),
                }
            except Exception:
                pass

        return {
            "active": bool(active),
            "forced_dialogue_state": str(forced_state),
            "stop_memory_injection": bool(stop_memory_injection),
            "worsened": bool(worsened),
            "reasons": list(reasons),
            "observed": {
                "level": int(level),
                "health_score": float(health),
                "collapse_risk_score": float(collapse),
                "flags": flags or {},
            },
            "previous": {
                "level": int(prev_level),
                "health_score": float(prev_health),
                "collapse_risk_score": float(prev_collapse),
            },
        }

    def _memory_for_llm(self, *, req: PersonaRequest, memory_result: MemorySelectionResult) -> MemorySelectionResult:
        """
        Allows control-plane policies to stop memory injection without disabling
        memory selection/persistence.
        """
        md = getattr(req, "metadata", None)
        if not isinstance(md, dict):
            return memory_result
        if not bool(md.get("_phase03_stop_memory_injection") or False):
            return memory_result

        try:
            raw = dict(memory_result.raw or {})
        except Exception:
            raw = {}
        try:
            ar = raw.get("auto_recovery")
            if not isinstance(ar, dict):
                ar = {}
                raw["auto_recovery"] = ar
            ar["stop_memory_injection"] = True
        except Exception:
            pass
        return MemorySelectionResult(pointers=[], merged_summary=None, raw=raw)

    def _build_v0_meta(self, *, req: PersonaRequest, meta: Dict[str, Any]) -> Dict[str, Any]:
        """
        v0 meta logging (best-effort):
        - Always non-null with fixed top keys
        - Uses whatever signals are already computed in this controller
        """

        trace_id = "UNKNOWN"
        md = getattr(req, "metadata", None)
        if isinstance(md, dict):
            try:
                v = md.get("_trace_id")
                if isinstance(v, str) and v.strip():
                    trace_id = v.strip()
            except Exception:
                pass

        # intent (Phase03 EMA if available)
        intent: Dict[str, float] = {}
        phase03 = meta.get("phase03") if isinstance(meta.get("phase03"), dict) else None
        try:
            vec = None
            if isinstance(phase03, dict):
                intent_obj = phase03.get("intent") if isinstance(phase03.get("intent"), dict) else None
                if isinstance(intent_obj, dict):
                    vector = intent_obj.get("vector") if isinstance(intent_obj.get("vector"), dict) else None
                    if isinstance(vector, dict):
                        vec = vector.get("ema") if isinstance(vector.get("ema"), dict) else vector.get("raw")
            if isinstance(vec, dict):
                for k, v in vec.items():
                    if isinstance(k, str) and k and isinstance(v, (int, float)):
                        intent[k] = float(v)
        except Exception:
            intent = {}

        # dialogue_state (Phase03 DSM if available)
        dialogue_state = "UNKNOWN"
        try:
            if isinstance(md, dict):
                ds = md.get("_phase03_dialogue_state")
                if isinstance(ds, str) and ds.strip():
                    dialogue_state = ds.strip()
            if dialogue_state == "UNKNOWN" and isinstance(phase03, dict):
                dlg = phase03.get("dialogue") if isinstance(phase03.get("dialogue"), dict) else None
                if isinstance(dlg, dict):
                    st = dlg.get("state") if isinstance(dlg.get("state"), dict) else None
                    if isinstance(st, dict):
                        cur = st.get("current")
                        if isinstance(cur, str) and cur.strip():
                            dialogue_state = cur.strip()
        except Exception:
            dialogue_state = "UNKNOWN"

        # telemetry (Phase02 C/N/M/S/R) as a flat dict
        telemetry_scores: Dict[str, float] = {"C": 0.0, "N": 0.0, "M": 0.0, "S": 0.0, "R": 0.0}
        try:
            tel = meta.get("telemetry") if isinstance(meta.get("telemetry"), dict) else None
            scores = None
            if isinstance(tel, dict):
                scores = tel.get("scores") if isinstance(tel.get("scores"), dict) else None
            if isinstance(scores, dict):
                for key in ("C", "N", "M", "S", "R"):
                    telemetry_scores[key] = _as_float(scores.get(key), 0.0)
        except Exception:
            telemetry_scores = {"C": 0.0, "N": 0.0, "M": 0.0, "S": 0.0, "R": 0.0}

        # safety
        total_risk = 0.0
        try:
            if isinstance(md, dict):
                total_risk = _as_float(md.get("_safety_risk_score"), 0.0)
        except Exception:
            total_risk = 0.0

        override = False
        try:
            so = None
            if isinstance(phase03, dict):
                so = phase03.get("safety") if isinstance(phase03.get("safety"), dict) else None
            if isinstance(so, dict):
                ov = so.get("override") if isinstance(so.get("override"), dict) else None
                if isinstance(ov, dict):
                    override = bool(ov.get("active") or False)
                else:
                    # fallback: level_num > 0
                    override = int(so.get("level_num") or 0) > 0
        except Exception:
            override = False

        return {
            "trace_id": trace_id,
            "intent": intent,
            "dialogue_state": dialogue_state,
            "telemetry": telemetry_scores,
            "safety": {"total_risk": float(total_risk), "override": bool(override)},
        }

    def _build_v1_meta(self, *, req: PersonaRequest, meta: Dict[str, Any]) -> Dict[str, Any]:
        """
        v1 meta logging (structured, non-null):
        - includes v0 fields + decision_candidates (>= 3 entries, best-effort)
        """

        v0 = self._build_v0_meta(req=req, meta=meta)

        intent = v0.get("intent") if isinstance(v0.get("intent"), dict) else {}
        dialogue_state = str(v0.get("dialogue_state") or "UNKNOWN")
        safety = v0.get("safety") if isinstance(v0.get("safety"), dict) else {}
        total_risk = _as_float(safety.get("total_risk"), 0.0)

        # Primary intent score (best-effort)
        primary_score = 0.0
        secondary_score = 0.0
        try:
            scores = [float(v) for v in intent.values() if isinstance(v, (int, float))]
            scores.sort(reverse=True)
            if len(scores) >= 1:
                primary_score = float(scores[0])
            if len(scores) >= 2:
                secondary_score = float(scores[1])
        except Exception:
            primary_score = 0.0
            secondary_score = 0.0

        # Compose candidates (minimum 3)
        candidates = [
            {
                "id": "primary",
                "label": f"{dialogue_state}_answer" if dialogue_state != "UNKNOWN" else "primary",
                "score": float(primary_score),
                "reason": "Selected by mode + intent alignment",
            },
            {
                "id": "alt_short",
                "label": "task_focused_short",
                "score": float(secondary_score),
                "reason": "Viable but not optimal for current mode",
            },
            {
                "id": "alt_refuse",
                "label": "safety_refusal",
                "score": float(total_risk),
                "reason": "Safety threshold relevance",
            },
        ]

        recovery = {"active": False, "forced_dialogue_state": "", "stop_memory_injection": False, "reasons": []}
        try:
            integ = meta.get("integration") if isinstance(meta.get("integration"), dict) else {}
            ar = integ.get("auto_recovery") if isinstance(integ.get("auto_recovery"), dict) else None
            if isinstance(ar, dict):
                recovery = {
                    "active": bool(ar.get("active") or False),
                    "forced_dialogue_state": str(ar.get("forced_dialogue_state") or ""),
                    "stop_memory_injection": bool(ar.get("stop_memory_injection") or False),
                    "reasons": list(ar.get("reasons") or []),
                }
        except Exception:
            recovery = {"active": False, "forced_dialogue_state": "", "stop_memory_injection": False, "reasons": []}

        return {
            "trace_id": v0.get("trace_id") or "UNKNOWN",
            "intent": intent,
            "dialogue_state": dialogue_state,
            "telemetry": v0.get("telemetry") if isinstance(v0.get("telemetry"), dict) else {"C": 0.0, "N": 0.0, "M": 0.0, "S": 0.0, "R": 0.0},
            "safety": {
                "total_risk": float(total_risk),
                "override": bool(safety.get("override") or False),
            },
            "decision_candidates": candidates,
            "recovery": recovery,
        }

    def handle_turn(
        self,
        req: PersonaRequest,
        *,
        user_id: Optional[str] = None,
        safety_flag: Optional[str] = None,
        overload_score: Optional[float] = None,
        reward_signal: float = 0.0,
        affect_signal: Optional[Dict[str, float]] = None,
    ) -> PersonaTurnResult:

        # ------------------------------------------------------
        # Trace（任意）
        # - server_persona_os.py が PersonaRequest.metadata に `_trace_id` を埋めてくれた場合のみ出力
        # ------------------------------------------------------
        log = get_logger(__name__)
        trace_id: Optional[str]
        try:
            trace_id = (getattr(req, "metadata", None) or {}).get("_trace_id")
        except Exception:
            trace_id = None

        def _trace(event: str, fields: Optional[Dict[str, Any]] = None) -> None:
            if not trace_id:
                return
            trace_event(
                log,
                trace_id=str(trace_id),
                event=f"persona_controller.{event}",
                fields=fields,
            )

        # user_id の最終確定（None 落ち防止）
        uid: Optional[str] = (
            user_id
            or self._config.default_user_id
            or getattr(req, "user_id", None)
        )

        meta: Dict[str, Any] = {}
        turn_trace_id = str(trace_id or uuid.uuid4())
        meta["trace_id"] = turn_trace_id
        try:
            if isinstance(getattr(req, "metadata", None), dict):
                req.metadata["_trace_id"] = turn_trace_id
        except Exception:
            pass
        t0 = time.perf_counter()
        t_marks: Dict[str, float] = {"start": t0}

        # Carry last safe-mode freeze into this turn (Part06 emergency modes)
        try:
            if isinstance(getattr(req, "metadata", None), dict):
                req.metadata["_freeze_updates"] = bool(self._freeze_updates)
        except Exception:
            pass

        # Carry last safe-mode freeze into this turn (Part06 emergency modes)
        try:
            if isinstance(getattr(req, "metadata", None), dict):
                req.metadata["_freeze_updates"] = bool(self._freeze_updates)
        except Exception:
            pass

        _trace(
            "start",
            {
                "user_id": uid,
                "session_id": getattr(req, "session_id", None),
                "message_len": len(getattr(req, "message", "") or ""),
                "message_preview": preview_text(getattr(req, "message", "")) if TRACE_INCLUDE_TEXT else "",
                "safety_flag": safety_flag,
                "overload_score": overload_score,
                "reward_signal": reward_signal,
            },
        )

        # ---- 1) Memory selection ----
        memory_result = self._select_memory(req=req, user_id=uid)

        meta["memory"] = {
            "pointer_count": len(memory_result.pointers),
            "has_merged_summary": memory_result.merged_summary is not None,
            "raw": memory_result.raw,  # ★ 透過
        }

        _trace(
            "memory_selected",
            {
                "pointer_count": len(memory_result.pointers),
                "has_merged_summary": memory_result.merged_summary is not None,
            },
        )

        # ---- 2) Identity continuity ----
        identity_result = self._identity.build_identity_context(
            req=req,
            memory=memory_result,
        )
        t_marks["identity"] = time.perf_counter()

        _trace(
            "identity_built",
            {
                "topic_label": (identity_result.identity_context or {}).get("topic_label"),
                "has_past_context": (identity_result.identity_context or {}).get("has_past_context"),
            },
        )

        # ---- 2.5) Phase02: provide TemporalIdentity signals to drift engines (optional) ----
        try:
            if isinstance(getattr(req, "metadata", None), dict) and self._temporal_identity_state is not None:
                req.metadata["_tid_inertia"] = float(getattr(self._temporal_identity_state, "inertia", 0.0) or 0.0)
                req.metadata["_tid_stability_budget"] = float(
                    getattr(self._temporal_identity_state, "stability_budget", 1.0) or 1.0
                )
                mid = getattr(self._temporal_identity_state, "middle_anchor", None) or {}
                if isinstance(mid, dict) and isinstance(mid.get("value"), dict):
                    req.metadata["_value_anchor"] = mid.get("value") or {}
        except Exception:
            pass

        # ---- 3) Value drift ----
        value_result = self._value.apply(
            current=self._value_state,
            req=req,
            memory=memory_result,
            identity=identity_result,
            reward_signal=reward_signal,
            safety_flag=safety_flag,
            db=self._db,
            user_id=uid,
        )
        self._value_state = value_result.new_state

        _trace("value_drift", {"delta": getattr(value_result, "delta", None)})

        # ---- 4) Trait drift ----
        trait_result = self._trait.apply(
            current=self._trait_state,
            baseline=self._trait_baseline,
            req=req,
            memory=memory_result,
            identity=identity_result,
            value_state=self._value_state,
            affect_signal=affect_signal,
            db=self._db,
            user_id=uid,
        )
        self._trait_state = trait_result.new_state

        _trace("trait_drift", {"delta": getattr(trait_result, "delta", None)})

        # ---- 4.5) Trait baseline update（slow learning） ----
        baseline_delta = self._update_trait_baseline(
            reward_signal=reward_signal,
            safety_flag=safety_flag,
            overload_score=overload_score,
        )

        # ---- 5) Global FSM ----
        global_state_ctx = self._fsm.decide(
            req=req,
            memory=memory_result,
            identity=identity_result,
            value_state=self._value_state,
            trait_state=self._trait_state,
            safety_flag=safety_flag,
            overload_score=overload_score,
            prev_state=self._prev_global_state,
        )
        self._prev_global_state = global_state_ctx.state
        t_marks["global_fsm"] = time.perf_counter()

        _trace(
            "global_state",
            {
                "state": global_state_ctx.state.name,
                "prev_state": global_state_ctx.prev_state.name if global_state_ctx.prev_state else None,
                "reasons": global_state_ctx.reasons,
            },
        )

        # ---- 5.25) Narrative / contradiction (Phase02 MD-03 health snapshot) ----
        try:
            meta["narrative"] = self._narrative.build(
                identity=identity_result,
                memory=memory_result,
                global_state=global_state_ctx,
                safety_flag=safety_flag,
            ).to_dict()
        except Exception:
            meta["narrative"] = {}

        # ---- 5.3) Continuity (E-layer signal; Phase02 used by M/S) ----
        try:
            continuity = self._continuity.compute(
                identity=identity_result,
                memory=memory_result,
                global_state=global_state_ctx,
                telemetry_ema=None,
                overload_score=overload_score,
                safety_flag=safety_flag,
            )
            meta["continuity"] = continuity.to_dict()
        except Exception:
            meta["continuity"] = {}

        # ---- 5.4) Ego continuity (self-model snapshot; used by S) ----
        try:
            ego_update = self._ego.update(
                prev=self._ego_state,
                user_id=str(uid or ""),
                session_id=getattr(req, "session_id", None),
                identity=identity_result,
                memory=memory_result,
                value_state=self._value_state,
                trait_state=self._trait_state,
                global_state=global_state_ctx,
                telemetry=None,
                continuity=meta.get("continuity"),
                narrative=meta.get("narrative"),
                overload_score=overload_score,
                drift_mag=None,
            )
            self._ego_state = ego_update.state
            meta["ego"] = ego_update.summary
            meta["integrity_flags"] = ego_update.integrity_flags

            if self._db is not None and hasattr(self._db, "store_ego_snapshot"):
                try:
                    self._db.store_ego_snapshot(
                        user_id=uid,
                        session_id=getattr(req, "session_id", None),
                        ego_id=ego_update.state.ego_id,
                        version=int(getattr(ego_update.state, "version", 1) or 1),
                        state=ego_update.state.to_dict(),
                        meta={"trace_id": (getattr(req, "metadata", None) or {}).get("_trace_id")},
                    )
                except Exception:
                    pass
        except Exception:
            pass

        # ---- 5.5) Telemetry (Phase02 C/N/M/S/R) ----
        telemetry = None
        try:
            safety_risk = None
            if isinstance(getattr(req, "metadata", None), dict):
                safety_risk = req.metadata.get("_safety_risk_score")
            telemetry = self._telemetry.compute(
                identity=identity_result,
                memory=memory_result,
                value_state=self._value_state,
                trait_state=self._trait_state,
                global_state=global_state_ctx,
                safety_flag=safety_flag,
                overload_score=overload_score,
                narrative=meta.get("narrative"),
                continuity=meta.get("continuity"),
                ego_summary=meta.get("ego"),
                value_delta=getattr(value_result, "delta", None),
                trait_delta=getattr(trait_result, "delta", None),
                safety_risk_score=(float(safety_risk) if safety_risk is not None else None),
            )
            meta["telemetry"] = telemetry.to_dict()

            if self._db is not None and hasattr(self._db, "store_telemetry_snapshot"):
                try:
                    self._db.store_telemetry_snapshot(
                        user_id=uid,
                        session_id=getattr(req, "session_id", None),
                        scores=telemetry.scores,
                        ema=telemetry.ema,
                        flags=telemetry.flags,
                        reasons=telemetry.reasons,
                        meta={"trace_id": (getattr(req, "metadata", None) or {}).get("_trace_id")},
                    )
                except Exception:
                    pass
        except Exception:
            pass
        t_marks["telemetry"] = time.perf_counter()

        # ---- 5.6) Integration layer (Phase02 MD-07) ----
        try:
            drift_mag = 0.0
            if telemetry is not None:
                try:
                    drift_mag = float(getattr(telemetry, "reasons", {}).get("drift_mag") or 0.0)  # type: ignore
                except Exception:
                    drift_mag = 0.0
            open_contradictions = int((meta.get("ego") or {}).get("open_contradictions", 0) or 0)
            contradiction_limit = int(os.getenv("SIGMARIS_CONTRADICTION_OPEN_LIMIT", "6") or "6")
            contradiction_pressure = min(1.0, float(open_contradictions) / float(max(1, contradiction_limit)))

            integration, new_tid_state, _phase_event = self._integration.process(
                prev_temporal_identity=self._temporal_identity_state,
                scores=(getattr(telemetry, "scores", None) or {}) if telemetry is not None else {},
                continuity=meta.get("continuity") or {},
                narrative=meta.get("narrative") or {},
                value_meta=(self._value_state.to_dict() if hasattr(self._value_state, "to_dict") else {}),
                self_meta=meta.get("ego") or {},
                drift_magnitude=float(drift_mag),
                contradiction_pressure=float(contradiction_pressure),
                external_overwrite_suspected=False,
                trigger_reconstruction=bool((meta.get("narrative") or {}).get("collapse_suspected", False)),
                operator_subjectivity_mode=(
                    (getattr(req, "metadata", None) or {}).get("_operator_subjectivity_mode")
                    if isinstance(getattr(req, "metadata", None), dict)
                    else None
                ),
                trace_id=(getattr(req, "metadata", None) or {}).get("_trace_id"),
                value_state=self._value_state,
                trait_state=self._trait_state,
                ego_state=self._ego_state,
            )
            self._temporal_identity_state = new_tid_state
            meta["integration"] = integration.to_dict()

            # Phase02 Failure -> Phase03 Auto Recovery (best-effort)
            try:
                sid = getattr(req, "session_id", None)
                session_id_str = str(sid) if sid is not None else ""
                auto_recovery = self._decide_auto_recovery(session_id=session_id_str, failure=(integration.failure or {}))

                # Attach to meta (non-null) + local event list for observability
                try:
                    if isinstance(meta.get("integration"), dict):
                        meta["integration"]["auto_recovery"] = auto_recovery
                        if isinstance(meta["integration"].get("events"), list) and bool(auto_recovery.get("active")):
                            meta["integration"]["events"].append(
                                {"event_type": "AUTO_RECOVERY", "at": time.time(), "payload": auto_recovery}
                            )
                except Exception:
                    pass

                # Append to integration event bus so it can be persisted by store_integration_events(...)
                try:
                    if bool(auto_recovery.get("active")):
                        if integration.events is None:
                            integration.events = []
                        if isinstance(integration.events, list):
                            integration.events.append(
                                {"event_type": "AUTO_RECOVERY", "at": time.time(), "payload": auto_recovery}
                            )
                except Exception:
                    pass

                # Feed control flags into request metadata (used by Phase03 + LLM call)
                if isinstance(getattr(req, "metadata", None), dict):
                    req.metadata["_phase03_forced_dialogue_state"] = str(auto_recovery.get("forced_dialogue_state") or "")
                    req.metadata["_phase03_stop_memory_injection"] = bool(auto_recovery.get("stop_memory_injection") or False)
            except Exception:
                pass

            # Carry integration freeze into this turn for drift engines and next-turn propagation.
            if isinstance(getattr(req, "metadata", None), dict):
                req.metadata["_freeze_updates"] = bool(req.metadata.get("_freeze_updates") or integration.freeze_updates)
            self._freeze_updates = bool(self._freeze_updates or integration.freeze_updates)

            # Optional persistence hooks (best-effort)
            if self._db is not None:
                trace_id = (getattr(req, "metadata", None) or {}).get("_trace_id")
                session_id = getattr(req, "session_id", None)

                if hasattr(self._db, "store_temporal_identity_snapshot"):
                    try:
                        self._db.store_temporal_identity_snapshot(
                            user_id=uid,
                            session_id=session_id,
                            trace_id=trace_id,
                            ego_id=str(new_tid_state.ego_id),
                            state=new_tid_state.to_dict(),
                            telemetry=(integration.temporal_identity or {}),
                        )
                    except Exception:
                        pass

                if hasattr(self._db, "store_subjectivity_snapshot"):
                    try:
                        self._db.store_subjectivity_snapshot(
                            user_id=uid,
                            session_id=session_id,
                            trace_id=trace_id,
                            subjectivity=(integration.subjectivity or {}),
                        )
                    except Exception:
                        pass

                if hasattr(self._db, "store_failure_snapshot"):
                    try:
                        self._db.store_failure_snapshot(
                            user_id=uid,
                            session_id=session_id,
                            trace_id=trace_id,
                            failure=(integration.failure or {}),
                        )
                    except Exception:
                        pass

                if hasattr(self._db, "store_identity_snapshot"):
                    try:
                        self._db.store_identity_snapshot(
                            user_id=uid,
                            session_id=session_id,
                            trace_id=trace_id,
                            snapshot=(integration.identity_snapshot or {}),
                        )
                    except Exception:
                        pass

                if hasattr(self._db, "store_integration_events"):
                    try:
                        self._db.store_integration_events(
                            user_id=uid,
                            session_id=session_id,
                            trace_id=trace_id,
                            events=(integration.events or []),
                        )
                    except Exception:
                        pass
        except Exception:
            pass

        # ---- 5.65) Phase03: Intent + DSM + Safety Override + Observability ----
        try:
            session_id = getattr(req, "session_id", None) or ""
            if not isinstance(session_id, str):
                session_id = str(session_id)

            # Cap per-session state (best-effort eviction)
            if session_id and session_id not in self._intent_ema_by_session:
                if len(self._intent_ema_by_session) >= self._phase03_session_cap:
                    try:
                        k0 = next(iter(self._intent_ema_by_session.keys()))
                        self._intent_ema_by_session.pop(k0, None)
                        self._dialogue_state_by_session.pop(k0, None)
                    except Exception:
                        self._intent_ema_by_session.clear()
                        self._dialogue_state_by_session.clear()

            md = (getattr(req, "metadata", None) or {}) if isinstance(getattr(req, "metadata", None), dict) else {}
            iv = self._intent_layers.compute(message=getattr(req, "message", "") or "", metadata=md)

            ema = self._intent_ema_by_session.get(session_id)
            if ema is None:
                ema = IntentVectorEMA(alpha=float(os.getenv("SIGMARIS_PHASE03_INTENT_EMA_ALPHA", "0.18") or "0.18"))
                self._intent_ema_by_session[session_id] = ema
            intent_ema = ema.update(iv.raw)

            safety_risk_score = md.get("_safety_risk_score")
            safety_categories = md.get("_safety_categories") if isinstance(md.get("_safety_categories"), dict) else None

            so = self._safety_override.decide(
                safety_flag=safety_flag,
                safety_risk_score=(float(safety_risk_score) if safety_risk_score is not None else None),
                intent_safety_risk=float(intent_ema.get("safety_risk", 0.0)),
                categories=safety_categories,
            )
            safety_forced = bool(so.active and so.level in ("hard", "terminate"))

            subj_mode = None
            try:
                subj_mode = (meta.get("integration") or {}).get("subjectivity", {}).get("mode")
            except Exception:
                subj_mode = None

            prev_ds = self._dialogue_state_by_session.get(session_id)
            ds, transition = self._dsm.decide(
                prev=prev_ds,
                intent_ema=intent_ema,
                intent_confidence=float(iv.confidence),
                safety_forced=safety_forced,
                safety_active=bool(so.active),
                subjectivity_mode=(str(subj_mode) if subj_mode is not None else None),
                transition_reasons=[],
            )

            # Auto recovery may force dialogue state regardless of intent/DSM hysteresis.
            try:
                forced = md.get("_phase03_forced_dialogue_state")
                if isinstance(forced, str) and forced in STATE_IDS and forced != ds.current_state:
                    t_force = time.time()
                    ds = DialogueState(
                        current_state=forced,
                        prev_state=ds.current_state,
                        entered_at=t_force,
                        confidence=1.0,
                        stability_score=1.0,
                        last_transition_reason="auto_recovery",
                    )
                    transition = {
                        "from": transition.get("from") or (prev_ds.current_state if prev_ds else None),
                        "to": forced,
                        "trigger": "auto_recovery",
                        "hysteresis_applied": False,
                        "dwell_ms": 0,
                        "reasons": list(transition.get("reasons") or []) + ["auto_recovery_forced"],
                        "subjectivity_mode": subj_mode,
                    }
            except Exception:
                pass
            if session_id:
                self._dialogue_state_by_session[session_id] = ds

            # Response policy (minimal): set generation defaults per dialogue state (unless client already set)
            gen = md.get("gen") if isinstance(md.get("gen"), dict) else {}
            if not isinstance(gen, dict):
                gen = {}
            if "temperature" not in gen or not isinstance(gen.get("temperature"), (int, float)):
                temp_map = {
                    "S1_CASUAL": 0.85,
                    "S2_TASK": 0.45,
                    "S3_EMOTIONAL": 0.60,
                    "S4_META": 0.50,
                    "S5_CREATIVE": 0.95,
                    "S6_SAFETY": 0.25,
                    "S0_NEUTRAL": 0.70,
                }
                gen["temperature"] = float(temp_map.get(ds.current_state, 0.70))
            if "max_tokens" not in gen or not isinstance(gen.get("max_tokens"), (int, float)):
                max_map = {
                    "S1_CASUAL": 700,
                    "S2_TASK": 1600,
                    "S3_EMOTIONAL": 1200,
                    "S4_META": 1400,
                    "S5_CREATIVE": 1800,
                    "S6_SAFETY": 700,
                    "S0_NEUTRAL": 1400,
                }
                gen["max_tokens"] = int(max_map.get(ds.current_state, 1400))

            if isinstance(getattr(req, "metadata", None), dict):
                req.metadata["gen"] = gen
                req.metadata["_phase03_dialogue_state"] = ds.current_state

            meta["phase03"] = {
                "timing_ms": {},  # filled at end
                "intent": {
                    "category": {
                        "scores": iv.category_scores,
                        "primary": iv.primary,
                        "secondary": iv.secondary,
                    },
                    "vector": {"raw": iv.raw, "ema": intent_ema},
                    "confidence": float(iv.confidence),
                },
                "routing": {
                    "strategy": "hybrid",
                    "target_state": ds.current_state,
                    "transition_confidence": float(ds.confidence),
                    "reasons": transition.get("reasons", []),
                },
                "dialogue": {
                    "state": {
                        "current": ds.current_state,
                        "previous": ds.prev_state,
                        "stability": float(getattr(ds, "stability_score", 0.0) or 0.0),
                    },
                    "transition": transition,
                },
                "safety": so.to_dict(),
                "auto_recovery": (
                    (meta.get("integration") or {}).get("auto_recovery", {})
                    if isinstance(meta.get("integration"), dict)
                    else {}
                ),
            }
        except Exception:
            pass
        t_marks["phase03"] = time.perf_counter()

        # ---- 5.7) Guardrails (Phase01/07 + Phase02 freeze merge) ----
        try:
            guardrail = self._guardrail.decide(
                telemetry=meta.get("telemetry"),
                continuity=meta.get("continuity"),
                narrative=meta.get("narrative"),
                integrity_flags=meta.get("integrity_flags"),
                integration=meta.get("integration"),
            )
            meta["guardrail"] = guardrail.to_dict()

            if isinstance(getattr(req, "metadata", None), dict):
                req.metadata["_freeze_updates"] = bool(req.metadata.get("_freeze_updates") or guardrail.freeze_updates)
                req.metadata["_guardrail_system_rules"] = guardrail.system_rules
                req.metadata["_guardrail_disclosures"] = guardrail.disclosures
            self._freeze_updates = bool(self._freeze_updates or guardrail.freeze_updates)
        except Exception:
            pass
        t_marks["guardrail"] = time.perf_counter()

        # ---- 6) LLM generate ----
        memory_for_llm = self._memory_for_llm(req=req, memory_result=memory_result)
        reply_text = self._call_llm(
            req=req,
            memory_result=memory_for_llm,
            identity_result=identity_result,
            value_state=self._value_state,
            trait_state=self._trait_state,
            global_state=global_state_ctx,
        )
        t_marks["llm"] = time.perf_counter()

        # ---- 7) EpisodeStore / PersonaDB 保存 ----
        _trace(
            "llm_generated",
            {
                "reply_len": len(reply_text or ""),
                "reply_preview": preview_text(reply_text) if TRACE_INCLUDE_TEXT else "",
            },
        )

        self._store_episode(
            user_id=uid,
            req=req,
            reply_text=reply_text,
            memory_result=memory_result,
            identity_result=identity_result,
            global_state=global_state_ctx,
        )
        t_marks["store"] = time.perf_counter()

        _trace("stored", None)

        # ---- meta ----
        try:
            gs_dict = global_state_ctx.to_dict()
        except Exception:
            gs_dict = {"state": getattr(global_state_ctx, "state", None)}

        meta.update(
            {
                "value_delta": getattr(value_result, "delta", None),
                "trait_delta": getattr(trait_result, "delta", None),
                "trait_baseline": self._trait_baseline.to_dict(),
                "trait_baseline_delta": baseline_delta,
                "global_state": gs_dict,
                "reward_signal": reward_signal,
                "safety_flag": safety_flag,
                "overload_score": overload_score,
            }
        )

        # Fill Phase03 timing (best-effort, no hard dependency)
        try:
            t_end = time.perf_counter()
            t_marks["end"] = t_end
            phase03 = meta.get("phase03") if isinstance(meta.get("phase03"), dict) else None
            if isinstance(phase03, dict) and isinstance(phase03.get("timing_ms"), dict):
                order = [
                    ("memory", "memory"),
                    ("identity", "identity"),
                    ("global_fsm", "global_fsm"),
                    ("telemetry", "telemetry"),
                    ("phase03", "phase03"),
                    ("guardrail", "guardrail"),
                    ("llm", "llm"),
                    ("store", "store"),
                    ("end", "end"),
                ]
                by_layer: Dict[str, int] = {}
                prev_key = "start"
                for key, label in order:
                    if key not in t_marks:
                        continue
                    dt_ms = (float(t_marks[key]) - float(t_marks.get(prev_key, t0))) * 1000.0
                    by_layer[label] = int(max(0.0, dt_ms))
                    prev_key = key
                phase03["timing_ms"] = {
                    "total": int(max(0.0, (t_end - t0) * 1000.0)),
                    "by_layer": by_layer,
                }
        except Exception:
            pass

        # v0 meta (compact, non-null)
        try:
            meta["v0"] = self._build_v0_meta(req=req, meta=meta)
        except Exception:
            meta["v0"] = {
                "trace_id": (getattr(req, "metadata", None) or {}).get("_trace_id") if isinstance(getattr(req, "metadata", None), dict) else "UNKNOWN",
                "intent": {},
                "dialogue_state": "UNKNOWN",
                "telemetry": {"C": 0.0, "N": 0.0, "M": 0.0, "S": 0.0, "R": 0.0},
                "safety": {"total_risk": 0.0, "override": False},
            }

        # v1 meta (structured, non-null)
        try:
            v1 = self._build_v1_meta(req=req, meta=meta)
            meta["v1"] = v1
            meta["decision_candidates"] = list(v1.get("decision_candidates") or [])
        except Exception:
            meta["v1"] = {
                "trace_id": (getattr(req, "metadata", None) or {}).get("_trace_id") if isinstance(getattr(req, "metadata", None), dict) else "UNKNOWN",
                "intent": {},
                "dialogue_state": "UNKNOWN",
                "telemetry": {"C": 0.0, "N": 0.0, "M": 0.0, "S": 0.0, "R": 0.0},
                "safety": {"total_risk": 0.0, "override": False},
                "decision_candidates": [],
                "recovery": {"active": False, "forced_dialogue_state": "", "stop_memory_injection": False, "reasons": []},
            }
            meta["decision_candidates"] = []

        return PersonaTurnResult(
            reply_text=reply_text,
            memory=memory_result,
            identity=identity_result,
            value=value_result,
            trait=trait_result,
            global_state=global_state_ctx,
            meta=meta,
        )

    def handle_turn_stream(
        self,
        req: PersonaRequest,
        *,
        user_id: Optional[str] = None,
        safety_flag: Optional[str] = None,
        overload_score: Optional[float] = None,
        reward_signal: float = 0.0,
        affect_signal: Optional[Dict[str, float]] = None,
        defer_persistence: bool = False,
    ):
        """
        handle_turn のストリーミング版。
        逐次 `{"type":"delta","text":"..."}` を yield し、最後に `{"type":"done","result": PersonaTurnResult}` を yield する。
        """

        log = get_logger(__name__)
        trace_id: Optional[str]
        try:
            trace_id = (getattr(req, "metadata", None) or {}).get("_trace_id")
        except Exception:
            trace_id = None

        def _trace(event: str, fields: Optional[Dict[str, Any]] = None) -> None:
            if not trace_id:
                return
            trace_event(
                log,
                trace_id=str(trace_id),
                event=f"persona_controller.{event}",
                fields=fields,
            )

        uid: Optional[str] = (
            user_id or self._config.default_user_id or getattr(req, "user_id", None)
        )

        meta: Dict[str, Any] = {}
        turn_trace_id = str(trace_id or uuid.uuid4())
        meta["trace_id"] = turn_trace_id
        try:
            if isinstance(getattr(req, "metadata", None), dict):
                req.metadata["_trace_id"] = turn_trace_id
        except Exception:
            pass
        t0 = time.perf_counter()
        t_marks: Dict[str, float] = {"start": t0}

        _trace(
            "start",
            {
                "user_id": uid,
                "session_id": getattr(req, "session_id", None),
                "message_len": len(getattr(req, "message", "") or ""),
                "message_preview": preview_text(getattr(req, "message", "")) if TRACE_INCLUDE_TEXT else "",
                "safety_flag": safety_flag,
                "overload_score": overload_score,
                "reward_signal": reward_signal,
                "stream": True,
            },
        )

        # ---- 1) Memory selection ----
        memory_result = self._select_memory(req=req, user_id=uid)
        t_marks["memory"] = time.perf_counter()
        t_marks["memory"] = time.perf_counter()
        meta["memory"] = {
            "pointer_count": len(memory_result.pointers),
            "has_merged_summary": memory_result.merged_summary is not None,
            "raw": memory_result.raw,
        }
        _trace(
            "memory_selected",
            {
                "pointer_count": len(memory_result.pointers),
                "has_merged_summary": memory_result.merged_summary is not None,
            },
        )

        # ---- 2) Identity continuity ----
        identity_result = self._identity.build_identity_context(req=req, memory=memory_result)
        t_marks["identity"] = time.perf_counter()
        _trace(
            "identity_built",
            {
                "topic_label": (identity_result.identity_context or {}).get("topic_label"),
                "has_past_context": (identity_result.identity_context or {}).get("has_past_context"),
            },
        )

        # ---- 2.5) Phase02: provide TemporalIdentity signals to drift engines (optional) ----
        try:
            if isinstance(getattr(req, "metadata", None), dict) and self._temporal_identity_state is not None:
                req.metadata["_tid_inertia"] = float(getattr(self._temporal_identity_state, "inertia", 0.0) or 0.0)
                req.metadata["_tid_stability_budget"] = float(
                    getattr(self._temporal_identity_state, "stability_budget", 1.0) or 1.0
                )
                mid = getattr(self._temporal_identity_state, "middle_anchor", None) or {}
                if isinstance(mid, dict) and isinstance(mid.get("value"), dict):
                    req.metadata["_value_anchor"] = mid.get("value") or {}
        except Exception:
            pass

        # ---- 3) Value drift ----
        drift_db = None if defer_persistence else self._db
        value_result = self._value.apply(
            current=self._value_state,
            req=req,
            memory=memory_result,
            identity=identity_result,
            reward_signal=reward_signal,
            safety_flag=safety_flag,
            db=drift_db,
            user_id=uid,
        )
        self._value_state = value_result.new_state
        _trace("value_drift", {"delta": getattr(value_result, "delta", None)})

        # ---- 4) Trait drift (uses baseline) ----
        trait_result = self._trait.apply(
            current=self._trait_state,
            baseline=self._trait_baseline,
            req=req,
            memory=memory_result,
            identity=identity_result,
            value_state=self._value_state,
            affect_signal=affect_signal,
            db=drift_db,
            user_id=uid,
        )
        self._trait_state = trait_result.new_state
        _trace("trait_drift", {"delta": getattr(trait_result, "delta", None)})

        # ---- 4.5) Trait baseline update (slow learning) ----
        baseline_delta = self._update_trait_baseline(
            reward_signal=reward_signal,
            safety_flag=safety_flag,
            overload_score=overload_score,
        )

        # ---- 5) Global FSM ----
        global_state_ctx = self._fsm.decide(
            req=req,
            memory=memory_result,
            identity=identity_result,
            value_state=self._value_state,
            trait_state=self._trait_state,
            safety_flag=safety_flag,
            overload_score=overload_score,
            prev_state=self._prev_global_state,
        )
        self._prev_global_state = global_state_ctx.state
        t_marks["global_fsm"] = time.perf_counter()
        _trace("global_state", {"state": getattr(global_state_ctx, "state", None)})

        # ---- 5.25) Narrative / contradiction (Phase02 MD-03 health snapshot) ----
        try:
            meta["narrative"] = self._narrative.build(
                identity=identity_result,
                memory=memory_result,
                global_state=global_state_ctx,
                safety_flag=safety_flag,
            ).to_dict()
        except Exception:
            meta["narrative"] = {}

        # ---- 5.3) Continuity ----
        try:
            continuity = self._continuity.compute(
                identity=identity_result,
                memory=memory_result,
                global_state=global_state_ctx,
                telemetry_ema=None,
                overload_score=overload_score,
                safety_flag=safety_flag,
            )
            meta["continuity"] = continuity.to_dict()
        except Exception:
            meta["continuity"] = {}

        # ---- 5.4) Ego continuity ----
        telemetry = None
        ego_state_to_persist: Optional[Dict[str, Any]] = None
        ego_id_to_persist: Optional[str] = None
        ego_version_to_persist: Optional[int] = None

        tid_state_to_persist: Optional[Dict[str, Any]] = None
        subjectivity_to_persist: Optional[Dict[str, Any]] = None
        failure_to_persist: Optional[Dict[str, Any]] = None
        identity_snapshot_to_persist: Optional[Dict[str, Any]] = None
        integration_events_to_persist: Optional[List[Dict[str, Any]]] = None

        try:
            ego_update = self._ego.update(
                prev=self._ego_state,
                user_id=str(uid or ""),
                session_id=getattr(req, "session_id", None),
                identity=identity_result,
                memory=memory_result,
                value_state=self._value_state,
                trait_state=self._trait_state,
                global_state=global_state_ctx,
                telemetry=None,
                continuity=meta.get("continuity"),
                narrative=meta.get("narrative"),
                overload_score=overload_score,
                drift_mag=None,
            )
            self._ego_state = ego_update.state
            meta["ego"] = ego_update.summary
            meta["integrity_flags"] = ego_update.integrity_flags

            try:
                ego_state_to_persist = ego_update.state.to_dict()
                ego_id_to_persist = str(ego_update.state.ego_id)
                ego_version_to_persist = int(getattr(ego_update.state, "version", 1) or 1)
            except Exception:
                ego_state_to_persist = None
        except Exception:
            pass

        # ---- 5.5) Telemetry (Phase02 C/N/M/S/R) ----
        try:
            safety_risk = None
            if isinstance(getattr(req, "metadata", None), dict):
                safety_risk = req.metadata.get("_safety_risk_score")
            telemetry = self._telemetry.compute(
                identity=identity_result,
                memory=memory_result,
                value_state=self._value_state,
                trait_state=self._trait_state,
                global_state=global_state_ctx,
                safety_flag=safety_flag,
                overload_score=overload_score,
                narrative=meta.get("narrative"),
                continuity=meta.get("continuity"),
                ego_summary=meta.get("ego"),
                value_delta=getattr(value_result, "delta", None),
                trait_delta=getattr(trait_result, "delta", None),
                safety_risk_score=(float(safety_risk) if safety_risk is not None else None),
            )
            meta["telemetry"] = telemetry.to_dict()

            if not defer_persistence and self._db is not None and hasattr(self._db, "store_telemetry_snapshot"):
                try:
                    self._db.store_telemetry_snapshot(
                        user_id=uid,
                        session_id=getattr(req, "session_id", None),
                        scores=telemetry.scores,
                        ema=telemetry.ema,
                        flags=telemetry.flags,
                        reasons=telemetry.reasons,
                        meta={"trace_id": (getattr(req, "metadata", None) or {}).get("_trace_id")},
                    )
                except Exception:
                    pass
        except Exception:
            telemetry = None
        t_marks["telemetry"] = time.perf_counter()

        # ---- 5.6) Integration layer (Phase02 MD-07) ----
        try:
            drift_mag = 0.0
            if telemetry is not None:
                try:
                    drift_mag = float(getattr(telemetry, "reasons", {}).get("drift_mag") or 0.0)  # type: ignore
                except Exception:
                    drift_mag = 0.0
            open_contradictions = int((meta.get("ego") or {}).get("open_contradictions", 0) or 0)
            contradiction_limit = int(os.getenv("SIGMARIS_CONTRADICTION_OPEN_LIMIT", "6") or "6")
            contradiction_pressure = min(1.0, float(open_contradictions) / float(max(1, contradiction_limit)))

            integration, new_tid_state, _phase_event = self._integration.process(
                prev_temporal_identity=self._temporal_identity_state,
                scores=(getattr(telemetry, "scores", None) or {}) if telemetry is not None else {},
                continuity=meta.get("continuity") or {},
                narrative=meta.get("narrative") or {},
                value_meta=(self._value_state.to_dict() if hasattr(self._value_state, "to_dict") else {}),
                self_meta=meta.get("ego") or {},
                drift_magnitude=float(drift_mag),
                contradiction_pressure=float(contradiction_pressure),
                external_overwrite_suspected=False,
                trigger_reconstruction=bool((meta.get("narrative") or {}).get("collapse_suspected", False)),
                operator_subjectivity_mode=(
                    (getattr(req, "metadata", None) or {}).get("_operator_subjectivity_mode")
                    if isinstance(getattr(req, "metadata", None), dict)
                    else None
                ),
                trace_id=(getattr(req, "metadata", None) or {}).get("_trace_id"),
                value_state=self._value_state,
                trait_state=self._trait_state,
                ego_state=self._ego_state,
            )
            self._temporal_identity_state = new_tid_state
            meta["integration"] = integration.to_dict()

            # Phase02 Failure -> Phase03 Auto Recovery (best-effort)
            try:
                sid = getattr(req, "session_id", None)
                session_id_str = str(sid) if sid is not None else ""
                auto_recovery = self._decide_auto_recovery(session_id=session_id_str, failure=(integration.failure or {}))

                try:
                    if isinstance(meta.get("integration"), dict):
                        meta["integration"]["auto_recovery"] = auto_recovery
                        if isinstance(meta["integration"].get("events"), list) and bool(auto_recovery.get("active")):
                            meta["integration"]["events"].append(
                                {"event_type": "AUTO_RECOVERY", "at": time.time(), "payload": auto_recovery}
                            )
                except Exception:
                    pass

                try:
                    if bool(auto_recovery.get("active")):
                        if integration.events is None:
                            integration.events = []
                        if isinstance(integration.events, list):
                            integration.events.append(
                                {"event_type": "AUTO_RECOVERY", "at": time.time(), "payload": auto_recovery}
                            )
                except Exception:
                    pass

                if isinstance(getattr(req, "metadata", None), dict):
                    req.metadata["_phase03_forced_dialogue_state"] = str(auto_recovery.get("forced_dialogue_state") or "")
                    req.metadata["_phase03_stop_memory_injection"] = bool(auto_recovery.get("stop_memory_injection") or False)
            except Exception:
                pass

            if isinstance(getattr(req, "metadata", None), dict):
                req.metadata["_freeze_updates"] = bool(req.metadata.get("_freeze_updates") or integration.freeze_updates)
            self._freeze_updates = bool(self._freeze_updates or integration.freeze_updates)

            tid_state_to_persist = new_tid_state.to_dict()
            subjectivity_to_persist = integration.subjectivity or {}
            failure_to_persist = integration.failure or {}
            identity_snapshot_to_persist = integration.identity_snapshot or {}
            integration_events_to_persist = integration.events or []

            if not defer_persistence and self._db is not None:
                trace_id_local = (getattr(req, "metadata", None) or {}).get("_trace_id")
                session_id_local = getattr(req, "session_id", None)

                if hasattr(self._db, "store_temporal_identity_snapshot"):
                    try:
                        self._db.store_temporal_identity_snapshot(
                            user_id=uid,
                            session_id=session_id_local,
                            trace_id=trace_id_local,
                            ego_id=str(new_tid_state.ego_id),
                            state=tid_state_to_persist,
                            telemetry=(integration.temporal_identity or {}),
                        )
                    except Exception:
                        pass
                if hasattr(self._db, "store_subjectivity_snapshot"):
                    try:
                        self._db.store_subjectivity_snapshot(
                            user_id=uid,
                            session_id=session_id_local,
                            trace_id=trace_id_local,
                            subjectivity=subjectivity_to_persist,
                        )
                    except Exception:
                        pass
                if hasattr(self._db, "store_failure_snapshot"):
                    try:
                        self._db.store_failure_snapshot(
                            user_id=uid,
                            session_id=session_id_local,
                            trace_id=trace_id_local,
                            failure=failure_to_persist,
                        )
                    except Exception:
                        pass
                if hasattr(self._db, "store_identity_snapshot"):
                    try:
                        self._db.store_identity_snapshot(
                            user_id=uid,
                            session_id=session_id_local,
                            trace_id=trace_id_local,
                            snapshot=identity_snapshot_to_persist,
                        )
                    except Exception:
                        pass
                if hasattr(self._db, "store_integration_events"):
                    try:
                        self._db.store_integration_events(
                            user_id=uid,
                            session_id=session_id_local,
                            trace_id=trace_id_local,
                            events=integration_events_to_persist,
                        )
                    except Exception:
                        pass
        except Exception:
            pass

        # ---- 5.65) Phase03: Intent + DSM + Safety Override + Observability ----
        try:
            session_id = getattr(req, "session_id", None) or ""
            if not isinstance(session_id, str):
                session_id = str(session_id)

            if session_id and session_id not in self._intent_ema_by_session:
                if len(self._intent_ema_by_session) >= self._phase03_session_cap:
                    try:
                        k0 = next(iter(self._intent_ema_by_session.keys()))
                        self._intent_ema_by_session.pop(k0, None)
                        self._dialogue_state_by_session.pop(k0, None)
                    except Exception:
                        self._intent_ema_by_session.clear()
                        self._dialogue_state_by_session.clear()

            md = (getattr(req, "metadata", None) or {}) if isinstance(getattr(req, "metadata", None), dict) else {}
            iv = self._intent_layers.compute(message=getattr(req, "message", "") or "", metadata=md)

            ema = self._intent_ema_by_session.get(session_id)
            if ema is None:
                ema = IntentVectorEMA(alpha=float(os.getenv("SIGMARIS_PHASE03_INTENT_EMA_ALPHA", "0.18") or "0.18"))
                self._intent_ema_by_session[session_id] = ema
            intent_ema = ema.update(iv.raw)

            safety_risk_score = md.get("_safety_risk_score")
            safety_categories = md.get("_safety_categories") if isinstance(md.get("_safety_categories"), dict) else None

            so = self._safety_override.decide(
                safety_flag=safety_flag,
                safety_risk_score=(float(safety_risk_score) if safety_risk_score is not None else None),
                intent_safety_risk=float(intent_ema.get("safety_risk", 0.0)),
                categories=safety_categories,
            )
            safety_forced = bool(so.active and so.level in ("hard", "terminate"))

            subj_mode = None
            try:
                subj_mode = (meta.get("integration") or {}).get("subjectivity", {}).get("mode")
            except Exception:
                subj_mode = None

            prev_ds = self._dialogue_state_by_session.get(session_id)
            ds, transition = self._dsm.decide(
                prev=prev_ds,
                intent_ema=intent_ema,
                intent_confidence=float(iv.confidence),
                safety_forced=safety_forced,
                safety_active=bool(so.active),
                subjectivity_mode=(str(subj_mode) if subj_mode is not None else None),
                transition_reasons=[],
            )

            # Auto recovery may force dialogue state regardless of intent/DSM hysteresis.
            try:
                forced = md.get("_phase03_forced_dialogue_state")
                if isinstance(forced, str) and forced in STATE_IDS and forced != ds.current_state:
                    t_force = time.time()
                    ds = DialogueState(
                        current_state=forced,
                        prev_state=ds.current_state,
                        entered_at=t_force,
                        confidence=1.0,
                        stability_score=1.0,
                        last_transition_reason="auto_recovery",
                    )
                    transition = {
                        "from": transition.get("from") or (prev_ds.current_state if prev_ds else None),
                        "to": forced,
                        "trigger": "auto_recovery",
                        "hysteresis_applied": False,
                        "dwell_ms": 0,
                        "reasons": list(transition.get("reasons") or []) + ["auto_recovery_forced"],
                        "subjectivity_mode": subj_mode,
                    }
            except Exception:
                pass
            if session_id:
                self._dialogue_state_by_session[session_id] = ds

            gen = md.get("gen") if isinstance(md.get("gen"), dict) else {}
            if not isinstance(gen, dict):
                gen = {}
            if "temperature" not in gen or not isinstance(gen.get("temperature"), (int, float)):
                temp_map = {
                    "S1_CASUAL": 0.85,
                    "S2_TASK": 0.45,
                    "S3_EMOTIONAL": 0.60,
                    "S4_META": 0.50,
                    "S5_CREATIVE": 0.95,
                    "S6_SAFETY": 0.25,
                    "S0_NEUTRAL": 0.70,
                }
                gen["temperature"] = float(temp_map.get(ds.current_state, 0.70))
            if "max_tokens" not in gen or not isinstance(gen.get("max_tokens"), (int, float)):
                max_map = {
                    "S1_CASUAL": 700,
                    "S2_TASK": 1600,
                    "S3_EMOTIONAL": 1200,
                    "S4_META": 1400,
                    "S5_CREATIVE": 1800,
                    "S6_SAFETY": 700,
                    "S0_NEUTRAL": 1400,
                }
                gen["max_tokens"] = int(max_map.get(ds.current_state, 1400))

            if isinstance(getattr(req, "metadata", None), dict):
                req.metadata["gen"] = gen
                req.metadata["_phase03_dialogue_state"] = ds.current_state

            meta["phase03"] = {
                "timing_ms": {},  # filled at end
                "intent": {
                    "category": {
                        "scores": iv.category_scores,
                        "primary": iv.primary,
                        "secondary": iv.secondary,
                    },
                    "vector": {"raw": iv.raw, "ema": intent_ema},
                    "confidence": float(iv.confidence),
                },
                "routing": {
                    "strategy": "hybrid",
                    "target_state": ds.current_state,
                    "transition_confidence": float(ds.confidence),
                    "reasons": transition.get("reasons", []),
                },
                "dialogue": {
                    "state": {
                        "current": ds.current_state,
                        "previous": ds.prev_state,
                        "stability": float(getattr(ds, "stability_score", 0.0) or 0.0),
                    },
                    "transition": transition,
                },
                "safety": so.to_dict(),
                "auto_recovery": (
                    (meta.get("integration") or {}).get("auto_recovery", {})
                    if isinstance(meta.get("integration"), dict)
                    else {}
                ),
            }
        except Exception:
            pass
        t_marks["phase03"] = time.perf_counter()

        # ---- 5.7) Guardrails ----
        try:
            guardrail = self._guardrail.decide(
                telemetry=meta.get("telemetry"),
                continuity=meta.get("continuity"),
                narrative=meta.get("narrative"),
                integrity_flags=meta.get("integrity_flags"),
                integration=meta.get("integration"),
            )
            meta["guardrail"] = guardrail.to_dict()

            if isinstance(getattr(req, "metadata", None), dict):
                req.metadata["_freeze_updates"] = bool(req.metadata.get("_freeze_updates") or guardrail.freeze_updates)
                req.metadata["_guardrail_system_rules"] = guardrail.system_rules
                req.metadata["_guardrail_disclosures"] = guardrail.disclosures
            self._freeze_updates = bool(self._freeze_updates or guardrail.freeze_updates)
        except Exception:
            pass
        t_marks["guardrail"] = time.perf_counter()

        # ---- 6) LLM (stream) ----
        parts: list[str] = []
        memory_for_llm = self._memory_for_llm(req=req, memory_result=memory_result)
        try:
            if hasattr(self._llm, "generate_stream"):
                for chunk in self._llm.generate_stream(
                    req=req,
                    memory=memory_for_llm,
                    identity=identity_result,
                    value_state=self._value_state,
                    trait_state=self._trait_state,
                    global_state=global_state_ctx,
                ):
                    if not chunk:
                        continue
                    parts.append(str(chunk))
                    yield {"type": "delta", "text": str(chunk)}
            else:
                text = self._call_llm(
                    req=req,
                    memory_result=memory_for_llm,
                    identity_result=identity_result,
                    value_state=self._value_state,
                    trait_state=self._trait_state,
                    global_state=global_state_ctx,
                )
                parts.append(text)
                yield {"type": "delta", "text": text}
        except Exception as e:
            _trace("llm_error", {"error": str(e)})
            raise
        finally:
            t_marks["llm"] = time.perf_counter()

        reply_text = "".join(parts).strip()

        _trace(
            "reply_generated",
            {
                "reply_len": len(reply_text),
                "reply_preview": preview_text(reply_text) if TRACE_INCLUDE_TEXT else "",
            },
        )

        def _persist_async() -> None:
            try:
                trace_id_local: Optional[str]
                try:
                    trace_id_local = (getattr(req, "metadata", None) or {}).get("_trace_id")
                except Exception:
                    trace_id_local = None

                # ---- snapshots (if supported) ----
                if self._db is not None:
                    try:
                        if hasattr(self._db, "store_value_snapshot"):
                            self._db.store_value_snapshot(
                                user_id=uid,
                                state=value_result.new_state.to_dict(),
                                delta=value_result.delta,
                                meta={
                                    "trace_id": trace_id_local,
                                    "session_id": getattr(req, "session_id", None),
                                    "identity_context": (identity_result.identity_context or {}),
                                    "global_state": (
                                        global_state_ctx.to_dict()
                                        if hasattr(global_state_ctx, "to_dict")
                                        else {"state": getattr(global_state_ctx, "state", None)}
                                    ),
                                    "memory": memory_result.raw or {},
                                },
                            )
                    except Exception:
                        pass
                    try:
                        if hasattr(self._db, "store_trait_snapshot"):
                            self._db.store_trait_snapshot(
                                user_id=uid,
                                state=trait_result.new_state.to_dict(),
                                delta=trait_result.delta,
                                meta={
                                    "trace_id": trace_id_local,
                                    "session_id": getattr(req, "session_id", None),
                                    "identity_context": (identity_result.identity_context or {}),
                                    "global_state": (
                                        global_state_ctx.to_dict()
                                        if hasattr(global_state_ctx, "to_dict")
                                        else {"state": getattr(global_state_ctx, "state", None)}
                                    ),
                                    "memory": memory_result.raw or {},
                                    "baseline": self._trait_baseline.to_dict(),
                                    "baseline_delta": baseline_delta,
                                },
                            )
                    except Exception:
                        pass

                    try:
                        if telemetry is not None and hasattr(self._db, "store_telemetry_snapshot"):
                            self._db.store_telemetry_snapshot(
                                user_id=uid,
                                session_id=getattr(req, "session_id", None),
                                scores=getattr(telemetry, "scores", None) or {},
                                ema=getattr(telemetry, "ema", None) or {},
                                flags=getattr(telemetry, "flags", None) or {},
                                reasons=getattr(telemetry, "reasons", None) or {},
                                meta={"trace_id": trace_id_local},
                            )
                    except Exception:
                        pass

                    try:
                        if (
                            ego_state_to_persist is not None
                            and ego_id_to_persist is not None
                            and ego_version_to_persist is not None
                            and hasattr(self._db, "store_ego_snapshot")
                        ):
                            self._db.store_ego_snapshot(
                                user_id=uid,
                                session_id=getattr(req, "session_id", None),
                                ego_id=ego_id_to_persist,
                                version=int(ego_version_to_persist),
                                state=ego_state_to_persist,
                                meta={"trace_id": trace_id_local},
                            )
                    except Exception:
                        pass

                    # ---- Phase02 snapshots (best-effort) ----
                    try:
                        if (
                            tid_state_to_persist is not None
                            and hasattr(self._db, "store_temporal_identity_snapshot")
                        ):
                            self._db.store_temporal_identity_snapshot(
                                user_id=uid,
                                session_id=getattr(req, "session_id", None),
                                trace_id=trace_id_local,
                                ego_id=str((tid_state_to_persist or {}).get("ego_id") or ""),
                                state=tid_state_to_persist,
                                telemetry=((meta.get("integration") or {}).get("temporal_identity") or {}),
                            )
                    except Exception:
                        pass

                    try:
                        if subjectivity_to_persist is not None and hasattr(self._db, "store_subjectivity_snapshot"):
                            self._db.store_subjectivity_snapshot(
                                user_id=uid,
                                session_id=getattr(req, "session_id", None),
                                trace_id=trace_id_local,
                                subjectivity=subjectivity_to_persist,
                            )
                    except Exception:
                        pass

                    try:
                        if failure_to_persist is not None and hasattr(self._db, "store_failure_snapshot"):
                            self._db.store_failure_snapshot(
                                user_id=uid,
                                session_id=getattr(req, "session_id", None),
                                trace_id=trace_id_local,
                                failure=failure_to_persist,
                            )
                    except Exception:
                        pass

                    try:
                        if identity_snapshot_to_persist is not None and hasattr(self._db, "store_identity_snapshot"):
                            self._db.store_identity_snapshot(
                                user_id=uid,
                                session_id=getattr(req, "session_id", None),
                                trace_id=trace_id_local,
                                snapshot=identity_snapshot_to_persist,
                            )
                    except Exception:
                        pass

                    try:
                        if integration_events_to_persist is not None and hasattr(self._db, "store_integration_events"):
                            self._db.store_integration_events(
                                user_id=uid,
                                session_id=getattr(req, "session_id", None),
                                trace_id=trace_id_local,
                                events=integration_events_to_persist,
                            )
                    except Exception:
                        pass

                # ---- episodes / embeddings / storage ----
                self._store_episode(
                    user_id=uid,
                    req=req,
                    reply_text=reply_text,
                    memory_result=memory_result,
                    identity_result=identity_result,
                    global_state=global_state_ctx,
                )
            except Exception:
                # Best-effort; never break streaming caller.
                log.exception("deferred persistence failed")

        if defer_persistence:
            threading.Thread(target=_persist_async, daemon=True).start()
            _trace("stored_deferred", None)
        else:
            self._store_episode(
                user_id=uid,
                req=req,
                reply_text=reply_text,
                memory_result=memory_result,
                identity_result=identity_result,
                global_state=global_state_ctx,
            )
            _trace("stored", None)
        t_marks["store"] = time.perf_counter()

        try:
            gs_dict = global_state_ctx.to_dict()
        except Exception:
            gs_dict = {"state": getattr(global_state_ctx, "state", None)}

        meta.update(
            {
                "value_delta": getattr(value_result, "delta", None),
                "trait_delta": getattr(trait_result, "delta", None),
                "trait_baseline": self._trait_baseline.to_dict(),
                "trait_baseline_delta": baseline_delta,
                "global_state": gs_dict,
                "reward_signal": reward_signal,
                "safety_flag": safety_flag,
                "overload_score": overload_score,
                "persistence": {"deferred": bool(defer_persistence)},
            }
        )

        # Fill Phase03 timing (best-effort, no hard dependency)
        try:
            t_end = time.perf_counter()
            t_marks["end"] = t_end
            phase03 = meta.get("phase03") if isinstance(meta.get("phase03"), dict) else None
            if isinstance(phase03, dict) and isinstance(phase03.get("timing_ms"), dict):
                order = [
                    ("memory", "memory"),
                    ("identity", "identity"),
                    ("global_fsm", "global_fsm"),
                    ("telemetry", "telemetry"),
                    ("phase03", "phase03"),
                    ("guardrail", "guardrail"),
                    ("llm", "llm"),
                    ("store", "store"),
                    ("end", "end"),
                ]
                by_layer: Dict[str, int] = {}
                prev_key = "start"
                for key, label in order:
                    if key not in t_marks:
                        continue
                    dt_ms = (float(t_marks[key]) - float(t_marks.get(prev_key, t0))) * 1000.0
                    by_layer[label] = int(max(0.0, dt_ms))
                    prev_key = key
                phase03["timing_ms"] = {
                    "total": int(max(0.0, (t_end - t0) * 1000.0)),
                    "by_layer": by_layer,
                }
        except Exception:
            pass

        # v0 meta (compact, non-null)
        try:
            meta["v0"] = self._build_v0_meta(req=req, meta=meta)
        except Exception:
            meta["v0"] = {
                "trace_id": (getattr(req, "metadata", None) or {}).get("_trace_id") if isinstance(getattr(req, "metadata", None), dict) else "UNKNOWN",
                "intent": {},
                "dialogue_state": "UNKNOWN",
                "telemetry": {"C": 0.0, "N": 0.0, "M": 0.0, "S": 0.0, "R": 0.0},
                "safety": {"total_risk": 0.0, "override": False},
            }

        # v1 meta (structured, non-null)
        try:
            v1 = self._build_v1_meta(req=req, meta=meta)
            meta["v1"] = v1
            meta["decision_candidates"] = list(v1.get("decision_candidates") or [])
        except Exception:
            meta["v1"] = {
                "trace_id": (getattr(req, "metadata", None) or {}).get("_trace_id") if isinstance(getattr(req, "metadata", None), dict) else "UNKNOWN",
                "intent": {},
                "dialogue_state": "UNKNOWN",
                "telemetry": {"C": 0.0, "N": 0.0, "M": 0.0, "S": 0.0, "R": 0.0},
                "safety": {"total_risk": 0.0, "override": False},
                "decision_candidates": [],
                "recovery": {"active": False, "forced_dialogue_state": "", "stop_memory_injection": False, "reasons": []},
            }
            meta["decision_candidates"] = []

        yield {
            "type": "done",
            "result": PersonaTurnResult(
                reply_text=reply_text,
                memory=memory_result,
                identity=identity_result,
                value=value_result,
                trait=trait_result,
                global_state=global_state_ctx,
                meta=meta,
            ),
        }

    def _update_trait_baseline(
        self,
        *,
        reward_signal: float,
        safety_flag: Optional[str],
        overload_score: Optional[float],
    ) -> Optional[Dict[str, float]]:
        """
        baseline（体質）をゆっくり更新する。
        - reward_signal が 0 のときは更新しない（暗黙学習を避ける）
        - safety_flag / overload が強いときは更新しない（暴走防止）

        返り値は baseline の delta（このターンでどれだけ動いたか）。
        """
        if reward_signal == 0.0:
            return None
        if safety_flag:
            return None
        if isinstance(overload_score, (int, float)) and float(overload_score) >= 0.7:
            return None

        r = float(reward_signal)
        if r > 1.0:
            r = 1.0
        elif r < -1.0:
            r = -1.0

        # 体感として「少しずつ成長」する程度のレート
        lr = 0.02 * abs(r)
        sign = 1.0 if r >= 0 else -1.0

        before = self._trait_baseline.to_dict()
        target = self._trait_state.to_dict()

        for k in ("calm", "empathy", "curiosity"):
            b = float(before.get(k, 0.5))
            t = float(target.get(k, 0.5))
            # r>0: targetへ近づく / r<0: targetから離れる
            nb = b + (t - b) * lr * sign
            if nb < 0.0:
                nb = 0.0
            elif nb > 1.0:
                nb = 1.0
            setattr(self._trait_baseline, k, nb)

        after = self._trait_baseline.to_dict()
        return {k: float(after[k] - before[k]) for k in after.keys()}

    # ==========================================================
    # Memory orchestrator
    # ==========================================================

    def _select_memory(
        self,
        *,
        req: PersonaRequest,
        user_id: Optional[str],
    ) -> MemorySelectionResult:
        return self._memory.select(
            req=req,
            user_id=user_id,
            episode_store=self._episode_store,
            persona_db=self._db,
        )

    # ==========================================================
    # LLM 呼び出し
    # ==========================================================

    def _call_llm(
        self,
        *,
        req: PersonaRequest,
        memory_result: MemorySelectionResult,
        identity_result: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> str:
        return self._llm.generate(
            req=req,
            memory=memory_result,
            identity=identity_result,
            value_state=value_state,
            trait_state=trait_state,
            global_state=global_state,
        )

    # ==========================================================
    # Episode / DB 保存
    # ==========================================================

    def _store_episode(
        self,
        *,
        user_id: Optional[str],
        req: PersonaRequest,
        reply_text: str,
        memory_result: MemorySelectionResult,
        identity_result: IdentityContinuityResult,
        global_state: GlobalStateContext,
    ) -> None:

        req_text = (req.message or "") if req is not None else ""

        # identity_context 互換吸収
        identity_context = getattr(identity_result, "identity_context", None)
        if identity_context is None:
            identity_context = getattr(identity_result, "context", None) or {}

        # global_state dict 互換
        try:
            gs_dict = global_state.to_dict()
        except Exception:
            gs_dict = {"state": getattr(global_state, "state", None)}

        ep = Episode(
            episode_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            summary=(reply_text or "")[:120],
            emotion_hint="",
            traits_hint={},
            raw_context=req_text,
            embedding=None,
        )

        # embedding 対応
        try:
            if hasattr(self._llm, "encode"):
                ep.embedding = self._llm.encode(ep.summary)  # type: ignore
            elif hasattr(self._llm, "embed"):
                ep.embedding = self._llm.embed(ep.summary)  # type: ignore
        except Exception:
            ep.embedding = None

        # EpisodeStore
        try:
            if hasattr(self._episode_store, "add"):
                self._episode_store.add(ep)
        except Exception:
            pass

        if self._db is None:
            return

        meta = {
            "user_id": user_id,
            "trace_id": (getattr(req, "metadata", None) or {}).get("_trace_id"),
            "identity_context": identity_context,
            "global_state": gs_dict,
            "memory_pointers": [p.__dict__ for p in (memory_result.pointers or [])],
            "memory_raw": memory_result.raw or {},
        }

        # ---- legacy API ----
        if hasattr(self._db, "store_episode_record"):
            try:
                self._db.store_episode_record(
                    user_id=user_id,
                    request=req_text,
                    response=reply_text,
                    meta=meta,
                )
            except Exception:
                pass
            return

        # ---- full API ----
        if hasattr(self._db, "store_episode"):
            try:
                session_id = getattr(req, "session_id", None) or str(uuid.uuid4())

                self._db.store_episode(
                    session_id=session_id,
                    role="user",
                    content=req_text,
                    topic_hint=None,
                    emotion_hint=None,
                    importance=0.0,
                    meta={
                        "direction": "input",
                        "user_id": user_id,
                        "identity_context": identity_context,
                        "global_state": gs_dict,
                    },
                )

                self._db.store_episode(
                    session_id=session_id,
                    role="assistant",
                    content=reply_text,
                    topic_hint=None,
                    emotion_hint=None,
                    importance=0.0,
                    meta={
                        "direction": "output",
                        "user_id": user_id,
                        "identity_context": identity_context,
                        "global_state": gs_dict,
                        "memory_pointers": [p.__dict__ for p in (memory_result.pointers or [])],
                        "memory_raw": memory_result.raw or {},
                    },
                )

            except Exception:
                pass
