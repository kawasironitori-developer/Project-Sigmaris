# sigmaris-core/persona_core/persona_db.py
# ============================================================
# PersonaDB（Persona OS 完全版・記憶完全版準拠）
#
# 役割:
#   - ValueDriftEngine からの value_snapshot を保存
#   - TraitDriftEngine からの trait_snapshot を保存
#   - PersonaController からの episode_record（対話ログ＋メタ）を保存
#   - EpisodeStore（記憶ストア）とは独立した「人格OSの中核DB」
# ============================================================

from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from persona_core.value.value_drift_engine import ValueState
from persona_core.trait.trait_drift_engine import TraitState


# ============================================================
# レコードモデル定義
# ============================================================

@dataclass
class ValueSnapshotRecord:
    user_id: Optional[str]
    timestamp: datetime
    state: Dict[str, float]
    delta: Dict[str, float]
    meta: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["timestamp"] = self.timestamp.astimezone(timezone.utc).isoformat()
        return d

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "ValueSnapshotRecord":
        ts_raw = d.get("timestamp")
        if ts_raw:
            try:
                ts = datetime.fromisoformat(ts_raw)
            except Exception:
                ts = datetime.now(timezone.utc)
        else:
            ts = datetime.now(timezone.utc)

        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        return ValueSnapshotRecord(
            user_id=d.get("user_id"),
            timestamp=ts,
            state=d.get("state", {}) or {},
            delta=d.get("delta", {}) or {},
            meta=d.get("meta", {}) or {},
        )


@dataclass
class TraitSnapshotRecord:
    user_id: Optional[str]
    timestamp: datetime
    state: Dict[str, float]
    delta: Dict[str, float]
    meta: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["timestamp"] = self.timestamp.astimezone(timezone.utc).isoformat()
        return d

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "TraitSnapshotRecord":
        ts_raw = d.get("timestamp")
        if ts_raw:
            try:
                ts = datetime.fromisoformat(ts_raw)
            except Exception:
                ts = datetime.now(timezone.utc)
        else:
            ts = datetime.now(timezone.utc)

        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        return TraitSnapshotRecord(
            user_id=d.get("user_id"),
            timestamp=ts,
            state=d.get("state", {}) or {},
            delta=d.get("delta", {}) or {},
            meta=d.get("meta", {}) or {},
        )


@dataclass
class EpisodeRecord:
    user_id: Optional[str]
    timestamp: datetime
    request: str
    response: str
    meta: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["timestamp"] = self.timestamp.astimezone(timezone.utc).isoformat()
        return d

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "EpisodeRecord":
        ts_raw = d.get("timestamp")
        if ts_raw:
            try:
                ts = datetime.fromisoformat(ts_raw)
            except:
                ts = datetime.now(timezone.utc)
        else:
            ts = datetime.now(timezone.utc)

        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        return EpisodeRecord(
            user_id=d.get("user_id"),
            timestamp=ts,
            request=d.get("request", "") or "",
            response=d.get("response", "") or "",
            meta=d.get("meta", {}) or {},
        )


# ============================================================
# PersonaDB 本体（JSON backend）
# ============================================================

class PersonaDB:
    """
    Sigmaris Persona OS 完全版の中核DBレイヤ。
    - DriftEngine → スナップショット保存
    - PersonaController → episode_record 保存
    - load_xxx_state → Value / Trait 状態の復元
    """

    def __init__(self, base_dir: Optional[str] = None) -> None:
        root = base_dir or "./sigmaris-data/persona_db"
        self.base_dir = root

        os.makedirs(self.base_dir, exist_ok=True)

        self._value_path = os.path.join(self.base_dir, "value_snapshots.json")
        self._trait_path = os.path.join(self.base_dir, "trait_snapshots.json")
        self._episode_path = os.path.join(self.base_dir, "episode_records.json")

        # 初期化
        for p in (self._value_path, self._trait_path, self._episode_path):
            if not os.path.exists(p):
                self._save_json(p, [])

    # --------------------------------------------------------
    # JSON I/O
    # --------------------------------------------------------

    def _load_json(self, path: str) -> List[Dict[str, Any]]:
        try:
            if not os.path.exists(path):
                self._save_json(path, [])
                return []
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            self._save_json(path, [])
            return []

    def _save_json(self, path: str, data: List[Dict[str, Any]]) -> None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def _append_record(self, path: str, record_dict: Dict[str, Any]) -> None:
        raw = self._load_json(path)
        raw.append(record_dict)
        raw.sort(key=lambda x: x.get("timestamp", ""))
        self._save_json(path, raw)

    # ========================================================
    #  公開 API — Drift Snapshot / Episode Record
    # ========================================================

    def store_value_snapshot(
        self,
        *,
        user_id: Optional[str],
        state: Dict[str, float],
        delta: Dict[str, float],
        meta: Dict[str, Any],
    ) -> None:
        rec = ValueSnapshotRecord(
            user_id=user_id,
            timestamp=datetime.now(timezone.utc),
            state=state,
            delta=delta,
            meta=meta,
        )
        self._append_record(self._value_path, rec.to_dict())

    def store_trait_snapshot(
        self,
        *,
        user_id: Optional[str],
        state: Dict[str, float],
        delta: Dict[str, float],
        meta: Dict[str, Any],
    ) -> None:
        rec = TraitSnapshotRecord(
            user_id=user_id,
            timestamp=datetime.now(timezone.utc),
            state=state,
            delta=delta,
            meta=meta,
        )
        self._append_record(self._trait_path, rec.to_dict())

    def store_episode_record(
        self,
        *,
        user_id: Optional[str],
        request: str,
        response: str,
        meta: Dict[str, Any],
    ) -> None:
        rec = EpisodeRecord(
            user_id=user_id,
            timestamp=datetime.now(timezone.utc),
            request=request,
            response=response,
            meta=meta,
        )
        self._append_record(self._episode_path, rec.to_dict())

    # ========================================================
    #  状態復元ユーティリティ
    # ========================================================

    def load_last_value_state(self, user_id: Optional[str] = None) -> Optional[ValueState]:
        raw = self._load_json(self._value_path)
        if not raw:
            return None

        for d in reversed(raw):
            rec = ValueSnapshotRecord.from_dict(d)
            if user_id is not None and rec.user_id != user_id:
                continue
            st = rec.state or {}
            return ValueState(
                stability=float(st.get("stability", 0.0)),
                openness=float(st.get("openness", 0.0)),
                safety_bias=float(st.get("safety_bias", 0.0)),
                user_alignment=float(st.get("user_alignment", 0.0)),
            )
        return None

    def load_last_trait_state(self, user_id: Optional[str] = None) -> Optional[TraitState]:
        raw = self._load_json(self._trait_path)
        if not raw:
            return None

        for d in reversed(raw):
            rec = TraitSnapshotRecord.from_dict(d)
            if user_id is not None and rec.user_id != user_id:
                continue
            st = rec.state or {}
            return TraitState(
                calm=float(st.get("calm", 0.0)),
                empathy=float(st.get("empathy", 0.0)),
                curiosity=float(st.get("curiosity", 0.0)),
            )
        return None

    # ========================================================
    # EpisodeRecord ロード
    # ========================================================

    def fetch_recent_episodes(
        self,
        *,
        user_id: Optional[str] = None,
        limit: int = 20,
    ) -> List[EpisodeRecord]:
        raw = self._load_json(self._episode_path)
        if not raw:
            return []

        recs = [EpisodeRecord.from_dict(d) for d in raw]
        if user_id is not None:
            recs = [r for r in recs if r.user_id == user_id]

        return recs[-limit:] if recs else []