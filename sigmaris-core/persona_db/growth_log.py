# persona_db/growth_log.py
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Any, Optional

from persona_core.types import TraitVector, RewardSignal


@dataclass
class GrowthLogEntry:
    """
    PersonaOS → MemoryDB.growth_log 用 1 レコード（完全版 v0.2）

    - 内面状態の変化（trait shift）
    - RewardSignal
    - モード（state）
    - 安全系フラグ（silence / contradiction / intuition_allow）
    - identity_hint / emotion / snapshot

    MemoryDB.store_growth_log(entry.to_row()) 用の dict を生成する。
    """

    # ベース情報
    user_id: str
    session_id: str
    last_message: str

    # Traits
    traits_before: TraitVector
    traits_after: TraitVector

    # RewardSignal（任意・None可）
    reward: Optional[RewardSignal] = None

    # state: "dialogue" / "reflect" / "introspect" / ...
    state: str = ""

    # silence / contradiction / intuition_allow など
    flags: Dict[str, bool] = field(default_factory=dict)

    # EmotionCore 互換
    emotion: Optional[str] = None
    intensity: Optional[float] = None

    # Identity Continuity 互換
    identity_hint: Optional[str] = None

    # 任意デバッグ
    extra_debug: Optional[Dict[str, Any]] = None

    # ============================================================
    # to_row() → MemoryDB.growth_log INSERT 用 dict に変換
    # ============================================================

    def to_row(self) -> Dict[str, Any]:
        ts = datetime.utcnow().isoformat()

        # --------------------------------------------------------
        # Trait shift
        # --------------------------------------------------------
        before = self.traits_before
        after = self.traits_after

        delta_calm = float(after.calm - before.calm)
        delta_empathy = float(after.empathy - before.empathy)
        delta_curiosity = float(after.curiosity - before.curiosity)

        value_shift = abs(delta_calm) + abs(delta_empathy) + abs(delta_curiosity)

        # --------------------------------------------------------
        # RewardSignal
        # --------------------------------------------------------
        reward_value = 0.0
        reward_reason = ""
        reward_meta = {}

        if isinstance(self.reward, RewardSignal):
            reward_value = float(self.reward.value)
            reward_reason = str(self.reward.reason or "")
            reward_meta = self.reward.meta or {}

        # reward_meta に value_shift が入っていれば優先
        if "value_shift" in reward_meta:
            try:
                value_shift = float(reward_meta["value_shift"])
            except Exception:
                pass

        # --------------------------------------------------------
        # emotion / intensity
        # --------------------------------------------------------
        emotion = self.emotion or ""
        intensity = (
            float(self.intensity)
            if self.intensity is not None
            else min(1.0, max(0.0, value_shift))
        )

        # --------------------------------------------------------
        # Flags
        # --------------------------------------------------------
        f = self.flags or {}
        silence = 1 if f.get("silence") else 0
        contradiction = 1 if f.get("contradiction") else 0
        intuition = 1 if (f.get("intuition_allow") or f.get("intuition")) else 0

        # --------------------------------------------------------
        # Identity Hint
        # --------------------------------------------------------
        identity_hint = self.identity_hint or ""

        # --------------------------------------------------------
        # Snapshot（UI・デバッグ）
        # --------------------------------------------------------
        snapshot_obj = {
            "ts": ts,
            "state": self.state,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "last_message": self.last_message,
            "traits_before": {
                "calm": float(before.calm),
                "empathy": float(before.empathy),
                "curiosity": float(before.curiosity),
            },
            "traits_after": {
                "calm": float(after.calm),
                "empathy": float(after.empathy),
                "curiosity": float(after.curiosity),
            },
            "reward": {
                "value": reward_value,
                "reason": reward_reason,
                "meta": reward_meta,
            },
            "flags": f,
        }

        if self.extra_debug:
            snapshot_obj["extra_debug"] = self.extra_debug
        if identity_hint:
            snapshot_obj["identity_hint"] = identity_hint

        snapshot = json.dumps(snapshot_obj, ensure_ascii=False)

        # --------------------------------------------------------
        # MemoryDB.growth_log スキーマに完全対応
        # --------------------------------------------------------
        return {
            "ts": ts,
            "session_id": self.session_id,
            "delta_calm": delta_calm,
            "delta_empathy": delta_empathy,
            "delta_curiosity": delta_curiosity,
            "reward": reward_value,
            "reward_reason": reward_reason,
            "value_shift": value_shift,
            "emotion": emotion,
            "intensity": intensity,
            "silence": silence,
            "contradiction": contradiction,
            "intuition": intuition,
            "identity_hint": identity_hint,
            "snapshot": snapshot,
        }