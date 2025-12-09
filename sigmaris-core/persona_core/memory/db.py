# sigmaris_persona_core/memory/db.py
from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


# ============================================================
# UTILS
# ============================================================

def _utc_now_iso() -> str:
    """UTC 現在時刻を ISO8601 文字列で返す."""
    return datetime.now(timezone.utc).isoformat()


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


# ============================================================
# RECORD MODELS
# ============================================================

@dataclass
class EpisodeRecord:
    id: int
    user_id: str
    session_id: str
    ts: str
    role: str
    content: str
    topic_hint: Optional[str]
    emotion_hint: Optional[str]
    importance: float
    meta: Dict[str, Any]


@dataclass
class ConceptRecord:
    id: int
    user_id: str
    label: str
    score: float
    occurrences: int
    last_seen: str
    meta: Dict[str, Any]


@dataclass
class IdentityEventRecord:
    id: int
    user_id: str
    kind: str
    delta_calm: float
    delta_empathy: float
    delta_curiosity: float
    reward: float
    ts: str
    meta: Dict[str, Any]


@dataclass
class TraitSnapshotRecord:
    id: int
    user_id: str
    ts: str
    calm: float
    empathy: float
    curiosity: float
    d_calm: float
    d_empathy: float
    d_curiosity: float
    meta: Dict[str, Any]


@dataclass
class ValueSnapshotRecord:
    id: int
    user_id: str
    ts: str
    openness: float
    safety_bias: float
    stability: float
    d_openness: float
    d_safety_bias: float
    d_stability: float
    meta: Dict[str, Any]


# ============================================================
# MemoryDB (Persona-DB 完全版)
# ============================================================

class MemoryDB:
    """
    Persona-DB v0.2（SQLite 完全版）

    ・ユーザーごとにファイルが独立
    ・5レイヤ記憶：
        - episodes
        - concepts
        - identity_events
        - trait_snapshots
        - value_snapshots
    """

    def __init__(self, user_id: str, db_root: Optional[str] = None) -> None:
        self.user_id = user_id

        # DB ルートディレクトリ
        if db_root is None:
            env_root = os.getenv("PERSONA_DB_DIR")
            if env_root:
                db_root = env_root
            else:
                base_dir = os.path.abspath(
                    os.path.join(os.path.dirname(__file__), "..", "..")
                )
                db_root = os.path.join(base_dir, "persona_db")

        _ensure_dir(db_root)

        self._db_path = os.path.join(db_root, f"{self.user_id}.db")
        self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row

        self._init_schema()

    # ============================================================
    # SCHEMA
    # ============================================================

    def _init_schema(self) -> None:
        cur = self._conn.cursor()

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS episodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                session_id TEXT,
                ts TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                topic_hint TEXT,
                emotion_hint TEXT,
                importance REAL NOT NULL DEFAULT 0.0,
                meta TEXT
            );
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS concepts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                label TEXT NOT NULL,
                score REAL NOT NULL DEFAULT 0.0,
                occurrences INTEGER NOT NULL DEFAULT 1,
                last_seen TEXT NOT NULL,
                meta TEXT,
                UNIQUE (user_id, label)
            );
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS identity_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                delta_calm REAL NOT NULL DEFAULT 0.0,
                delta_empathy REAL NOT NULL DEFAULT 0.0,
                delta_curiosity REAL NOT NULL DEFAULT 0.0,
                reward REAL NOT NULL DEFAULT 0.0,
                ts TEXT NOT NULL,
                meta TEXT
            );
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS trait_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                ts TEXT NOT NULL,
                calm REAL NOT NULL DEFAULT 0.0,
                empathy REAL NOT NULL DEFAULT 0.0,
                curiosity REAL NOT NULL DEFAULT 0.0,
                d_calm REAL NOT NULL DEFAULT 0.0,
                d_empathy REAL NOT NULL DEFAULT 0.0,
                d_curiosity REAL NOT NULL DEFAULT 0.0,
                meta TEXT
            );
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS value_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                ts TEXT NOT NULL,
                openness REAL NOT NULL DEFAULT 0.0,
                safety_bias REAL NOT NULL DEFAULT 0.0,
                stability REAL NOT NULL DEFAULT 0.0,
                d_openness REAL NOT NULL DEFAULT 0.0,
                d_safety_bias REAL NOT NULL DEFAULT 0.0,
                d_stability REAL NOT NULL DEFAULT 0.0,
                meta TEXT
            );
            """
        )

        self._conn.commit()

    # ============================================================
    # UTIL
    # ============================================================

    def _dump_meta(self, meta: Optional[Dict[str, Any]]) -> Optional[str]:
        if meta is None:
            return None
        try:
            return json.dumps(meta, ensure_ascii=False)
        except Exception:
            return json.dumps({"_raw": str(meta)}, ensure_ascii=False)

    def _load_meta(self, raw: Optional[str]) -> Dict[str, Any]:
        if raw in (None, ""):
            return {}
        try:
            return json.loads(raw)
        except Exception:
            return {"_raw": raw}

    # ============================================================
    # EPISODES
    # ============================================================

    def store_episode(
        self,
        session_id: str,
        role: str,
        content: str,
        topic_hint: Optional[str] = None,
        emotion_hint: Optional[str] = None,
        importance: float = 0.0,
        meta: Optional[Dict[str, Any]] = None,
    ) -> int:
        ts = _utc_now_iso()
        meta_str = self._dump_meta(meta)

        cur = self._conn.cursor()
        cur.execute(
            """
            INSERT INTO episodes (
                user_id, session_id, ts, role, content,
                topic_hint, emotion_hint, importance, meta
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                self.user_id,
                session_id,
                ts,
                role,
                content,
                topic_hint,
                emotion_hint,
                float(importance),
                meta_str,
            ),
        )
        self._conn.commit()
        return int(cur.lastrowid)

    def load_recent_episodes(
        self,
        limit: int = 50,
        min_importance: float = 0.0,
    ) -> List[EpisodeRecord]:
        cur = self._conn.cursor()
        cur.execute(
            """
            SELECT *
            FROM episodes
            WHERE user_id = ?
              AND importance >= ?
            ORDER BY ts DESC, id DESC
            LIMIT ?;
            """,
            (self.user_id, float(min_importance), int(limit)),
        )

        rows = cur.fetchall()
        out: List[EpisodeRecord] = []

        for r in rows:
            out.append(
                EpisodeRecord(
                    id=int(r["id"]),
                    user_id=str(r["user_id"]),
                    session_id=str(r["session_id"] or ""),
                    ts=str(r["ts"]),
                    role=str(r["role"]),
                    content=str(r["content"]),
                    topic_hint=r["topic_hint"],
                    emotion_hint=r["emotion_hint"],
                    importance=float(r["importance"]),
                    meta=self._load_meta(r["meta"]),
                )
            )
        return out

    # ============================================================
    # CONCEPTS
    # ============================================================

    def store_concept(
        self,
        label: str,
        score: float,
        occurrences: int = 1,
        meta: Optional[Dict[str, Any]] = None,
    ) -> int:
        ts = _utc_now_iso()
        meta_str = self._dump_meta(meta)

        cur = self._conn.cursor()
        cur.execute(
            """
            SELECT id, score, occurrences
            FROM concepts
            WHERE user_id = ? AND label = ?;
            """,
            (self.user_id, label),
        )
        row = cur.fetchone()

        if row:
            new_score = float(score)
            new_occ = int(row["occurrences"]) + int(occurrences)
            cur.execute(
                """
                UPDATE concepts
                SET score = ?, occurrences = ?, last_seen = ?, meta = ?
                WHERE id = ?;
                """,
                (new_score, new_occ, ts, meta_str, int(row["id"])),
            )
            self._conn.commit()
            return int(row["id"])
        else:
            cur.execute(
                """
                INSERT INTO concepts (
                    user_id, label, score, occurrences, last_seen, meta
                ) VALUES (?, ?, ?, ?, ?, ?);
                """,
                (
                    self.user_id,
                    label,
                    float(score),
                    int(occurrences),
                    ts,
                    meta_str,
                ),
            )
            self._conn.commit()
            return int(cur.lastrowid)

    def load_concepts(
        self,
        limit: int = 50,
        min_score: float = 0.0,
    ) -> List[ConceptRecord]:
        cur = self._conn.cursor()
        cur.execute(
            """
            SELECT *
            FROM concepts
            WHERE user_id = ?
              AND score >= ?
            ORDER BY score DESC, occurrences DESC, last_seen DESC
            LIMIT ?;
            """,
            (self.user_id, float(min_score), int(limit)),
        )
        rows = cur.fetchall()
        out: List[ConceptRecord] = []

        for r in rows:
            out.append(
                ConceptRecord(
                    id=int(r["id"]),
                    user_id=str(r["user_id"]),
                    label=str(r["label"]),
                    score=float(r["score"]),
                    occurrences=int(r["occurrences"]),
                    last_seen=str(r["last_seen"]),
                    meta=self._load_meta(r["meta"]),
                )
            )
        return out

    # ============================================================
    # IDENTITY EVENTS
    # ============================================================

    def store_identity_event(
        self,
        kind: str,
        delta_calm: float = 0.0,
        delta_empathy: float = 0.0,
        delta_curiosity: float = 0.0,
        reward: float = 0.0,
        meta: Optional[Dict[str, Any]] = None,
    ) -> int:

        ts = _utc_now_iso()
        meta_str = self._dump_meta(meta)

        cur = self._conn.cursor()
        cur.execute(
            """
            INSERT INTO identity_events (
                user_id, kind,
                delta_calm, delta_empathy, delta_curiosity,
                reward, ts, meta
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                self.user_id,
                kind,
                float(delta_calm),
                float(delta_empathy),
                float(delta_curiosity),
                float(reward),
                ts,
                meta_str,
            ),
        )
        self._conn.commit()
        return int(cur.lastrowid)

    def load_identity_events(
        self,
        limit: int = 100,
        kind: Optional[str] = None,
    ) -> List[IdentityEventRecord]:
        cur = self._conn.cursor()

        if kind is None:
            cur.execute(
                """
                SELECT *
                FROM identity_events
                WHERE user_id = ?
                ORDER BY ts DESC, id DESC
                LIMIT ?;
                """,
                (self.user_id, int(limit)),
            )
        else:
            cur.execute(
                """
                SELECT *
                FROM identity_events
                WHERE user_id = ?
                  AND kind = ?
                ORDER BY ts DESC, id DESC
                LIMIT ?;
                """,
                (self.user_id, kind, int(limit)),
            )

        rows = cur.fetchall()
        out: List[IdentityEventRecord] = []

        for r in rows:
            out.append(
                IdentityEventRecord(
                    id=int(r["id"]),
                    user_id=str(r["user_id"]),
                    kind=str(r["kind"]),
                    delta_calm=float(r["delta_calm"]),
                    delta_empathy=float(r["delta_empathy"]),
                    delta_curiosity=float(r["delta_curiosity"]),
                    reward=float(r["reward"]),
                    ts=str(r["ts"]),
                    meta=self._load_meta(r["meta"]),
                )
            )

        return out

    # ============================================================
    # TRAIT SNAPSHOTS
    # ============================================================

    def store_trait_snapshot(
        self,
        user_id: Optional[str],
        state: Dict[str, float],
        delta: Dict[str, float],
        meta: Optional[Dict[str, Any]] = None,
    ) -> int:

        eff_user_id = user_id or self.user_id
        ts = _utc_now_iso()
        meta_str = self._dump_meta(meta)

        calm = float(state.get("calm", 0.0))
        emp = float(state.get("empathy", 0.0))
        curv = float(state.get("curiosity", 0.0))

        d_calm = float(delta.get("calm", 0.0))
        d_emp = float(delta.get("empathy", 0.0))
        d_cur = float(delta.get("curiosity", 0.0))

        cur_ = self._conn.cursor()
        cur_.execute(
            """
            INSERT INTO trait_snapshots (
                user_id, ts,
                calm, empathy, curiosity,
                d_calm, d_empathy, d_curiosity,
                meta
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                eff_user_id,
                ts,
                calm,
                emp,
                curv,
                d_calm,
                d_emp,
                d_cur,
                meta_str,
            ),
        )
        self._conn.commit()
        return int(cur_.lastrowid)

    def load_trait_snapshots(
        self,
        limit: int = 100,
    ) -> List[TraitSnapshotRecord]:

        cur = self._conn.cursor()
        cur.execute(
            """
            SELECT *
            FROM trait_snapshots
            WHERE user_id = ?
            ORDER BY ts DESC, id DESC
            LIMIT ?;
            """,
            (self.user_id, int(limit)),
        )
        rows = cur.fetchall()

        out: List[TraitSnapshotRecord] = []
        for r in rows:
            out.append(
                TraitSnapshotRecord(
                    id=int(r["id"]),
                    user_id=str(r["user_id"]),
                    ts=str(r["ts"]),
                    calm=float(r["calm"]),
                    empathy=float(r["empathy"]),
                    curiosity=float(r["curiosity"]),
                    d_calm=float(r["d_calm"]),
                    d_empathy=float(r["d_empathy"]),
                    d_curiosity=float(r["d_curiosity"]),
                    meta=self._load_meta(r["meta"]),
                )
            )
        return out

    # ============================================================
    # VALUE SNAPSHOTS
    # ============================================================

    def store_value_snapshot(
        self,
        user_id: Optional[str],
        state: Dict[str, float],
        delta: Dict[str, float],
        meta: Optional[Dict[str, Any]] = None,
    ) -> int:

        eff_user_id = user_id or self.user_id
        ts = _utc_now_iso()
        meta_str = self._dump_meta(meta)

        openness = float(state.get("openness", 0.0))
        safety = float(state.get("safety_bias", 0.0))
        stability = float(state.get("stability", 0.0))

        d_open = float(delta.get("openness", 0.0))
        d_safety = float(delta.get("safety_bias", 0.0))
        d_stab = float(delta.get("stability", 0.0))

        cur_ = self._conn.cursor()
        cur_.execute(
            """
            INSERT INTO value_snapshots (
                user_id, ts,
                openness, safety_bias, stability,
                d_openness, d_safety_bias, d_stability,
                meta
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                eff_user_id,
                ts,
                openness,
                safety,
                stability,
                d_open,
                d_safety,
                d_stab,
                meta_str,
            ),
        )
        self._conn.commit()
        return int(cur_.lastrowid)

    def load_value_snapshots(
        self,
        limit: int = 100,
    ) -> List[ValueSnapshotRecord]:

        cur = self._conn.cursor()
        cur.execute(
            """
            SELECT *
            FROM value_snapshots
            WHERE user_id = ?
            ORDER BY ts DESC, id DESC
            LIMIT ?;
            """,
            (self.user_id, int(limit)),
        )

        rows = cur.fetchall()
        out: List[ValueSnapshotRecord] = []

        for r in rows:
            out.append(
                ValueSnapshotRecord(
                    id=int(r["id"]),
                    user_id=str(r["user_id"]),
                    ts=str(r["ts"]),
                    openness=float(r["openness"]),
                    safety_bias=float(r["safety_bias"]),
                    stability=float(r["stability"]),
                    d_openness=float(r["d_openness"]),
                    d_safety_bias=float(r["d_safety_bias"]),
                    d_stability=float(r["d_stability"]),
                    meta=self._load_meta(r["meta"]),
                )
            )
        return out

    # ============================================================
    # CLOSE
    # ============================================================

    def close(self) -> None:
        try:
            self._conn.close()
        except Exception:
            pass