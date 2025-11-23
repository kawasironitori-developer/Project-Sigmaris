# persona_db/growth_log.py
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Any, Optional

from sigmaris_persona_core.types import TraitVector, RewardSignal


@dataclass
class GrowthLogEntry:
    """
    PersonaOS → persona_db.growth_log 用の 1 レコード表現。

    - 1 ステップの「内面状態の変化」をまとめて記録する。
    - 実際のテーブルには user_id は持たず、
      「どのファイル(<user>.sqlite3)に書かれているか」で紐づける設計。
    """

    user_id: str
    session_id: str
    last_message: str

    traits_before: TraitVector
    traits_after: TraitVector
    reward: RewardSignal

    state: str                      # dialogue / reflect / introspect など
    flags: Dict[str, bool]          # safety_flagged / silence / contradiction / intuition_allow

    emotion: Optional[str] = None   # 将来的に EmotionCore から渡す
    intensity: Optional[float] = None
    identity_hint: Optional[str] = None
    extra_debug: Optional[Dict[str, Any]] = None

    def to_row(self) -> Dict[str, Any]:
        """
        memory_db.MemoryDB.store_growth_log() がそのまま
        `:ts`, `:session_id` ... として使う dict を返す。
        growth_log テーブルのスキーマと完全に対応させている。
        """
        ts = datetime.utcnow().isoformat()

        # トレイト差分
        delta_calm = float(self.traits_after.calm - self.traits_before.calm)
        delta_empathy = float(self.traits_after.empathy - self.traits_before.empathy)
        delta_curiosity = float(self.traits_after.curiosity - self.traits_before.curiosity)

        # RewardSignal
        reward_value = float(self.reward.value)
        reward_reason = str(self.reward.reason or "")
        reward_meta = self.reward.meta or {}

        # value_shift は今のところ未定義なので 0.0 にしておく。
        value_shift = 0.0
        if "value_shift" in reward_meta:
            try:
                value_shift = float(reward_meta["value_shift"])
            except Exception:
                value_shift = 0.0

        # emotion/intensity は引数が無ければ 0 扱い
        emotion = self.emotion or ""
        intensity = float(self.intensity) if self.intensity is not None else 0.0

        # サブシステムフラグ（bool → int）
        silence = 1 if self.flags.get("silence", False) else 0
        contradiction = 1 if self.flags.get("contradiction", False) else 0
        intuition = 1 if self.flags.get("intuition_allow", False) else 0

        # identity_hint / snapshot
        identity_hint = self.identity_hint or ""

        snapshot_obj: Dict[str, Any] = {
            "state": self.state,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "last_message": self.last_message,
            "traits_before": {
                "calm": float(self.traits_before.calm),
                "empathy": float(self.traits_before.empathy),
                "curiosity": float(self.traits_before.curiosity),
            },
            "traits_after": {
                "calm": float(self.traits_after.calm),
                "empathy": float(self.traits_after.empathy),
                "curiosity": float(self.traits_after.curiosity),
            },
            "reward": {
                "value": reward_value,
                "reason": reward_reason,
                "meta": reward_meta,
            },
            "flags": self.flags,
        }

        if self.extra_debug:
            snapshot_obj["extra_debug"] = self.extra_debug
        if self.identity_hint:
            snapshot_obj["identity_hint"] = self.identity_hint

        snapshot = json.dumps(snapshot_obj, ensure_ascii=False)

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