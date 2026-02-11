from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from persona_core.phase04.governance import GovernanceLayer
from persona_core.phase04.kernel import Kernel
from persona_core.phase04.perception import PerceptionLayer
from persona_core.phase04.signal_types import ExternalSignal, GovernanceDecision, SourceType


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Phase04Runtime:
    """
    A lightweight orchestrator for Phase04 layers.

    MVP: produces perception+governance outputs for observability.
    Kernel application can be enabled later.
    """

    def __init__(self) -> None:
        self.kernel = Kernel()
        self.perception = PerceptionLayer()
        self.governance = GovernanceLayer()

    def build_user_signal(
        self,
        *,
        user_id: str,
        session_id: str,
        message: str,
        attachments: Optional[List[Dict[str, Any]]] = None,
    ) -> ExternalSignal:
        return ExternalSignal(
            id=uuid.uuid4().hex,
            source_type="user_input",  # type: ignore[assignment]
            origin_identifier=f"{user_id}:{session_id}",
            timestamp=_now(),
            raw_payload=str(message or "")[:800],
            metadata={
                "session_id": session_id,
                "attachment_count": len(attachments or []),
                "attachments": attachments or [],
            },
        )

    def run_for_turn(
        self,
        *,
        user_id: str,
        session_id: str,
        message: str,
        extra_signals: Optional[List[ExternalSignal]] = None,
        trace_id: Optional[str] = None,
        persist: Optional[Any] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        signals = [
            self.build_user_signal(
                user_id=user_id,
                session_id=session_id,
                message=message,
                attachments=attachments,
            )
        ]
        if extra_signals:
            signals.extend(extra_signals)

        po = self.perception.process(signals=signals, current_text=message or "")

        # Provide summaries to governance without leaking raw payloads
        summaries = []
        for s in po.scored:
            summaries.append(
                {
                    "signal_id": s.signal.id,
                    "source_type": s.signal.source_type,
                    "trust_score": s.trust_score,
                    "relevance_score": s.relevance_score,
                    "novelty_score": s.novelty_score,
                    "recency_score": s.recency_score,
                }
            )

        gd: GovernanceDecision = self.governance.decide_growth(
            candidate_deltas=po.candidate_deltas,
            signal_summaries=summaries,
        )

        # Kernel apply (optional)
        kernel_enabled = os.getenv("SIGMARIS_PHASE04_KERNEL_APPLY", "").strip().lower() in ("1", "true", "yes", "on")
        kernel_apply = {"enabled": bool(kernel_enabled), "snapshot_id": None, "applied": 0, "rollback": False, "errors": []}

        if kernel_enabled:
            snap_id = None
            try:
                snap_id = self.kernel.snapshot(user_id=user_id)
                kernel_apply["snapshot_id"] = snap_id
            except Exception:
                snap_id = None

            applied = 0
            had_error = False
            for d in gd.approved:
                res = self.kernel.apply_delta(
                    user_id=user_id,
                    target_category=d.target_category,
                    key=d.key,
                    operation_type=d.operation_type,
                    delta_value=d.delta_value,
                )
                if res.get("ok"):
                    applied += 1
                else:
                    had_error = True
                    kernel_apply["errors"].append({"delta": d.to_dict(), "error": res.get("error")})
            kernel_apply["applied"] = int(applied)

            if had_error and snap_id:
                try:
                    ok = self.kernel.rollback(user_id=user_id, snapshot_id=str(snap_id))
                    kernel_apply["rollback"] = bool(ok)
                except Exception:
                    kernel_apply["rollback"] = True

            # Persist (best-effort) if provided (e.g., SupabasePersonaDB)
            if persist is not None:
                try:
                    persist.upsert_kernel_state(user_id=user_id, state=self.kernel.get_state(user_id=user_id).to_dict())
                except Exception:
                    pass
                if snap_id:
                    try:
                        snap = self.kernel.get_snapshot(user_id=user_id, snapshot_id=str(snap_id))
                        persist.insert_kernel_snapshot(user_id=user_id, snapshot_id=str(snap_id), state=(snap.state.to_dict() if snap else {}))
                    except Exception:
                        pass
                try:
                    persist.insert_kernel_delta_log(
                        user_id=user_id,
                        session_id=session_id,
                        trace_id=trace_id,
                        decision=gd.to_dict(),
                        approved_deltas=[d.to_dict() for d in gd.approved],
                    )
                except Exception:
                    pass
                if kernel_apply.get("rollback") and snap_id:
                    try:
                        persist.insert_kernel_rollback(
                            user_id=user_id,
                            snapshot_id=str(snap_id),
                            trace_id=trace_id,
                            reason="kernel_apply_failed_rolled_back",
                        )
                    except Exception:
                        pass

        return {
            "perception": po.to_dict(),
            "governance": gd.to_dict(),
            "kernel": kernel_apply,
        }


_RUNTIME: Optional[Phase04Runtime] = None


def get_phase04_runtime() -> Phase04Runtime:
    global _RUNTIME
    if _RUNTIME is None:
        _RUNTIME = Phase04Runtime()
    return _RUNTIME
