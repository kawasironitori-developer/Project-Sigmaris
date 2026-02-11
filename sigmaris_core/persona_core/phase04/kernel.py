from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class KernelState:
    stable_knowledge: Dict[str, Any] = field(default_factory=dict)
    contextual_beliefs: Dict[str, Any] = field(default_factory=dict)
    core_values: Dict[str, Any] = field(default_factory=dict)
    operational_policies: Dict[str, Any] = field(default_factory=dict)
    temporary_biases: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "stable_knowledge": self.stable_knowledge,
            "contextual_beliefs": self.contextual_beliefs,
            "core_values": self.core_values,
            "operational_policies": self.operational_policies,
            "temporary_biases": self.temporary_biases,
        }


@dataclass
class Snapshot:
    snapshot_id: str
    created_at: datetime
    state: KernelState

    def to_dict(self) -> Dict[str, Any]:
        return {
            "snapshot_id": self.snapshot_id,
            "created_at": self.created_at.isoformat(),
            "state": self.state.to_dict(),
        }


class Kernel:
    """
    Phase04 Layer 1 (MVP):
    - Deterministic state holder with snapshot/rollback.
    - Structural-only validation.

    Persistence is intentionally optional in MVP.
    """

    def __init__(self) -> None:
        self._state_by_user: Dict[str, KernelState] = {}
        self._snapshots_by_user: Dict[str, Dict[str, Snapshot]] = {}
        try:
            self._max_snapshots = int(os.getenv("SIGMARIS_KERNEL_MAX_SNAPSHOTS", "32") or "32")
        except Exception:
            self._max_snapshots = 32
        if self._max_snapshots < 1:
            self._max_snapshots = 1

    def get_state(self, *, user_id: str) -> KernelState:
        uid = str(user_id)
        st = self._state_by_user.get(uid)
        if st is None:
            st = KernelState()
            self._state_by_user[uid] = st
        return st

    def snapshot(self, *, user_id: str) -> str:
        uid = str(user_id)
        snap_id = uuid.uuid4().hex
        # deep-ish copy via json to ensure immutability against accidental mutation
        raw = json.loads(json.dumps(self.get_state(user_id=uid).to_dict(), ensure_ascii=False))
        st = KernelState(**raw)  # type: ignore[arg-type]
        snap = Snapshot(snapshot_id=snap_id, created_at=_now_utc(), state=st)
        bucket = self._snapshots_by_user.setdefault(uid, {})
        bucket[snap_id] = snap

        # prune oldest
        if len(bucket) > self._max_snapshots:
            ordered = sorted(bucket.values(), key=lambda s: s.created_at)
            for s in ordered[: max(0, len(bucket) - self._max_snapshots)]:
                bucket.pop(s.snapshot_id, None)

        return snap_id

    def get_snapshot(self, *, user_id: str, snapshot_id: str) -> Optional[Snapshot]:
        bucket = self._snapshots_by_user.get(str(user_id)) or {}
        snap = bucket.get(str(snapshot_id))
        return snap

    def rollback(self, *, user_id: str, snapshot_id: str) -> bool:
        uid = str(user_id)
        bucket = self._snapshots_by_user.get(uid) or {}
        snap = bucket.get(str(snapshot_id))
        if snap is None:
            return False
        # restore
        raw = json.loads(json.dumps(snap.state.to_dict(), ensure_ascii=False))
        self._state_by_user[uid] = KernelState(**raw)  # type: ignore[arg-type]
        return True

    def apply_delta(
        self,
        *,
        user_id: str,
        target_category: str,
        key: str,
        operation_type: str,
        delta_value: Any,
    ) -> Dict[str, Any]:
        """
        MVP supported operations:
        - add_entry / replace : state[category][key] = delta_value
        - remove_entry       : pop key
        """
        st = self.get_state(user_id=str(user_id))
        cat = str(target_category)
        if not hasattr(st, cat):
            return {"ok": False, "error": "unknown_target_category"}
        bucket: Dict[str, Any] = getattr(st, cat)
        if not isinstance(bucket, dict):
            return {"ok": False, "error": "invalid_target_bucket"}

        op = str(operation_type)
        k = str(key)
        if op in ("add_entry", "replace", "increment", "decrement"):
            # structural-only: we do not interpret value semantics here
            bucket[k] = delta_value
            return {"ok": True}
        if op == "remove_entry":
            bucket.pop(k, None)
            return {"ok": True}
        return {"ok": False, "error": "unsupported_operation_type"}
