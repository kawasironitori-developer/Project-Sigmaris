from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from persona_core.memory.episode_store import Episode
from persona_core.trait.trait_drift_engine import TraitState
from persona_core.value.value_drift_engine import ValueState

from .supabase_rest import SupabaseRESTClient


class SupabasePersonaDB:
    """
    PersonaController が呼ぶ DB API を Supabase(Postgres) で実装する。

    いまの v2 の利用箇所:
    - ValueDriftEngine / TraitDriftEngine: store_value_snapshot / store_trait_snapshot
    - PersonaController._store_episode: store_episode (入力/出力を2回呼ぶ)
    """

    def __init__(self, client: SupabaseRESTClient) -> None:
        self._c = client

    def store_episode(
        self,
        *,
        session_id: str,
        role: str,
        content: str,
        topic_hint: Optional[str],
        emotion_hint: Optional[str],
        importance: float,
        meta: Dict[str, Any],
    ) -> None:
        user_id = str((meta or {}).get("user_id") or "")
        trace_id = (meta or {}).get("trace_id")

        row = {
            "trace_id": trace_id,
            "user_id": user_id,
            "session_id": session_id,
            "role": role,
            "content": content,
            "topic_hint": topic_hint,
            "emotion_hint": emotion_hint,
            "importance": float(importance),
            "meta": meta or {},
        }
        self._c.insert("common_turns", row)

    def store_value_snapshot(
        self,
        *,
        user_id: Optional[str],
        state: Dict[str, float],
        delta: Dict[str, float],
        meta: Dict[str, Any],
    ) -> None:
        row = {
            "trace_id": (meta or {}).get("trace_id"),
            "user_id": str(user_id or ""),
            "state": state or {},
            "delta": delta or {},
            "meta": meta or {},
        }
        self._c.insert("common_value_snapshots", row)

    def store_trait_snapshot(
        self,
        *,
        user_id: Optional[str],
        state: Dict[str, float],
        delta: Dict[str, float],
        meta: Dict[str, Any],
    ) -> None:
        row = {
            "trace_id": (meta or {}).get("trace_id"),
            "user_id": str(user_id or ""),
            "state": state or {},
            "delta": delta or {},
            "meta": meta or {},
        }
        self._c.insert("common_trait_snapshots", row)

    def store_telemetry_snapshot(
        self,
        *,
        user_id: Optional[str],
        session_id: Optional[str],
        scores: Dict[str, float],
        ema: Dict[str, float],
        flags: Dict[str, Any],
        reasons: Dict[str, Any],
        meta: Dict[str, Any],
    ) -> None:
        row = {
            "trace_id": (meta or {}).get("trace_id"),
            "user_id": str(user_id or ""),
            "session_id": session_id,
            "scores": scores or {},
            "ema": ema or {},
            "flags": flags or {},
            "reasons": reasons or {},
            "meta": meta or {},
        }
        self._c.insert("common_telemetry_snapshots", row)

    def store_ego_snapshot(
        self,
        *,
        user_id: Optional[str],
        session_id: Optional[str],
        ego_id: str,
        version: int,
        state: Dict[str, Any],
        meta: Dict[str, Any],
    ) -> None:
        row = {
            "trace_id": (meta or {}).get("trace_id"),
            "user_id": str(user_id or ""),
            "session_id": session_id,
            "ego_id": str(ego_id),
            "version": int(version),
            "state": state or {},
            "meta": meta or {},
        }
        self._c.insert("common_ego_snapshots", row)

    # --------------------------
    # Phase02 snapshots (Temporal Identity / Subjectivity / Failure / Integration)
    # --------------------------

    def store_temporal_identity_snapshot(
        self,
        *,
        user_id: Optional[str],
        session_id: Optional[str],
        trace_id: Optional[str],
        ego_id: str,
        state: Dict[str, Any],
        telemetry: Dict[str, Any],
    ) -> None:
        row = {
            "trace_id": trace_id,
            "user_id": str(user_id or ""),
            "session_id": session_id,
            "ego_id": str(ego_id),
            "state": state or {},
            "telemetry": telemetry or {},
        }
        self._c.insert("common_temporal_identity_snapshots", row)

    def load_last_temporal_identity_state(self, *, user_id: str) -> Optional[Dict[str, Any]]:
        rows = self._c.select(
            "common_temporal_identity_snapshots",
            columns="state,created_at",
            filters=[f"user_id=eq.{user_id}"],
            order="created_at.desc",
            limit=1,
        )
        if not rows:
            return None
        return rows[0].get("state") or None

    def store_subjectivity_snapshot(
        self,
        *,
        user_id: Optional[str],
        session_id: Optional[str],
        trace_id: Optional[str],
        subjectivity: Dict[str, Any],
    ) -> None:
        row = {
            "trace_id": trace_id,
            "user_id": str(user_id or ""),
            "session_id": session_id,
            "subjectivity": subjectivity or {},
        }
        self._c.insert("common_subjectivity_snapshots", row)

    def store_failure_snapshot(
        self,
        *,
        user_id: Optional[str],
        session_id: Optional[str],
        trace_id: Optional[str],
        failure: Dict[str, Any],
    ) -> None:
        row = {
            "trace_id": trace_id,
            "user_id": str(user_id or ""),
            "session_id": session_id,
            "failure": failure or {},
        }
        self._c.insert("common_failure_snapshots", row)

    def store_identity_snapshot(
        self,
        *,
        user_id: Optional[str],
        session_id: Optional[str],
        trace_id: Optional[str],
        snapshot: Dict[str, Any],
    ) -> None:
        row = {
            "trace_id": trace_id,
            "user_id": str(user_id or ""),
            "session_id": session_id,
            "snapshot": snapshot or {},
        }
        self._c.insert("common_identity_snapshots", row)

    def store_integration_events(
        self,
        *,
        user_id: Optional[str],
        session_id: Optional[str],
        trace_id: Optional[str],
        events: List[Dict[str, Any]],
    ) -> None:
        for ev in events or []:
            row = {
                "trace_id": trace_id,
                "user_id": str(user_id or ""),
                "session_id": session_id,
                "event_type": str(ev.get("event_type") or ""),
                "payload": ev or {},
            }
            self._c.insert("common_integration_events", row)

    def load_last_ego_state(self, *, user_id: str) -> Optional[Dict[str, Any]]:
        rows = self._c.select(
            "common_ego_snapshots",
            columns="state,version,ego_id,created_at",
            filters=[f"user_id=eq.{user_id}"],
            order="created_at.desc",
            limit=1,
        )
        if not rows:
            return None
        return rows[0].get("state") or None

    def store_life_event(
        self,
        *,
        user_id: str,
        session_id: Optional[str],
        trace_id: Optional[str],
        kind: str,
        payload: Dict[str, Any],
    ) -> None:
        self._c.insert(
            "common_life_events",
            {
                "user_id": str(user_id),
                "session_id": session_id,
                "trace_id": trace_id,
                "kind": kind,
                "payload": payload or {},
            },
        )

    def store_operator_override(
        self,
        *,
        user_id: str,
        trace_id: Optional[str],
        actor: Optional[str],
        kind: str,
        payload: Dict[str, Any],
    ) -> None:
        self._c.insert(
            "common_operator_overrides",
            {
                "user_id": str(user_id),
                "trace_id": trace_id,
                "actor": actor,
                "kind": kind,
                "payload": payload or {},
            },
        )

    def load_last_operator_override(
        self,
        *,
        user_id: str,
        kind: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        filters = [f"user_id=eq.{user_id}"]
        if kind:
            filters.append(f"kind=eq.{kind}")
        rows = self._c.select(
            "common_operator_overrides",
            columns="kind,payload,actor,created_at",
            filters=filters,
            order="created_at.desc",
            limit=1,
        )
        if not rows:
            return None
        return rows[0] or None

    # --------------------------
    # Load latest states (server wiring 用)
    # --------------------------

    def load_last_value_state(self, *, user_id: str) -> Optional[ValueState]:
        rows = self._c.select(
            "common_value_snapshots",
            columns="state,created_at",
            filters=[f"user_id=eq.{user_id}"],
            order="created_at.desc",
            limit=1,
        )
        if not rows:
            return None
        st = rows[0].get("state") or {}
        return ValueState(
            stability=float(st.get("stability", 0.0)),
            openness=float(st.get("openness", 0.0)),
            safety_bias=float(st.get("safety_bias", 0.0)),
            user_alignment=float(st.get("user_alignment", 0.0)),
        )

    def load_last_trait_state(self, *, user_id: str) -> Optional[TraitState]:
        rows = self._c.select(
            "common_trait_snapshots",
            columns="state,created_at",
            filters=[f"user_id=eq.{user_id}"],
            order="created_at.desc",
            limit=1,
        )
        if not rows:
            return None
        st = rows[0].get("state") or {}
        return TraitState(
            calm=float(st.get("calm", 0.0)),
            empathy=float(st.get("empathy", 0.0)),
            curiosity=float(st.get("curiosity", 0.0)),
        )


class SupabaseEpisodeStore:
    """
    SelectiveRecall が使う最小 I/F:
    - add(ep)
    - fetch_recent(limit)
    - fetch_by_ids(ids)

    ここでは user_id を分離するため、インスタンス生成時に user_id を固定する。
    """

    def __init__(self, client: SupabaseRESTClient, *, user_id: str) -> None:
        self._c = client
        self._user_id = user_id

    def add(self, ep: Episode) -> None:
        d = ep.as_dict()
        # timestamp は ISO8601 文字列になっている想定
        row = {
            "episode_id": d.get("episode_id"),
            "user_id": self._user_id,
            "timestamp": d.get("timestamp"),
            "summary": d.get("summary") or "",
            "emotion_hint": d.get("emotion_hint") or "",
            "traits_hint": d.get("traits_hint") or {},
            "raw_context": d.get("raw_context") or "",
            "embedding": d.get("embedding"),
            "meta": {},
        }
        self._c.upsert("common_episodes", row, on_conflict="episode_id")

    def fetch_recent(self, limit: int = 50) -> List[Episode]:
        rows = self._c.select(
            "common_episodes",
            columns="episode_id,timestamp,summary,emotion_hint,traits_hint,raw_context,embedding",
            filters=[f"user_id=eq.{self._user_id}"],
            order="timestamp.desc",
            limit=int(limit),
        )
        out: List[Episode] = []
        for r in rows or []:
            out.append(Episode.from_dict(r))
        return out

    def fetch_by_ids(self, ids: List[str]) -> List[Episode]:
        if not ids:
            return []
        # PostgREST: in 演算子
        # 例: episode_id=in.(a,b)
        joined = ",".join(ids)
        rows = self._c.select(
            "common_episodes",
            columns="episode_id,timestamp,summary,emotion_hint,traits_hint,raw_context,embedding",
            filters=[
                f"user_id=eq.{self._user_id}",
                f"episode_id=in.({joined})",
            ],
            order="timestamp.asc",
        )
        return [Episode.from_dict(r) for r in (rows or [])]

    def search_embedding(self, vector: List[float], limit: int = 5) -> List[Episode]:
        # TODO: pgvector での検索（RPC / SQL function）に置き換える余地あり
        return self.fetch_recent(limit=limit)
