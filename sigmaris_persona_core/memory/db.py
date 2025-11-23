# sigmaris_persona_core/memory/db.py
from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


def _utc_now_iso() -> str:
    """UTC 現在時刻を ISO8601 文字列で返す."""
    return datetime.now(timezone.utc).isoformat()


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


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


class MemoryDB:
    """
    Persona-DB v0.1

    ・ユーザーごとに SQLite DB ファイルを分離
    ・3レイヤ記憶：
        - episodes: 短〜中期の対話ログ
        - concepts: テーマ/概念のクラスタ（タグ的なもの）
        - identity_events: 価値・トレイト変動などの重要イベント
    """

    def __init__(
        self,
        user_id: str,
        db_root: Optional[str] = None,
    ) -> None:
        """
        :param user_id: この DB インスタンスが扱うユーザー ID
        :param db_root: DB を格納するルートディレクトリ
                        未指定の場合は "persona_db" をプロジェクト直下に作成
        """
        self.user_id = user_id

        # ルートディレクトリ決定
        if db_root is None:
            # 環境変数優先（あれば）
            env_root = os.getenv("PERSONA_DB_DIR")
            if env_root:
                db_root = env_root
            else:
                # このファイルから 2階層上をプロジェクトルートとみなす
                base_dir = os.path.abspath(
                    os.path.join(os.path.dirname(__file__), "..", "..")
                )
                db_root = os.path.join(base_dir, "persona_db")

        _ensure_dir(db_root)

        db_path = os.path.join(db_root, f"{self.user_id}.db")
        self._db_path = db_path

        # check_same_thread=False で FastAPI からの利用に耐えられるようにする
        self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row

        self._init_schema()

    # ------------------------------------------------------------------
    # スキーマ初期化
    # ------------------------------------------------------------------
    def _init_schema(self) -> None:
        cur = self._conn.cursor()

        # episodes: 対話ログ / 記憶エピソード
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

        # concepts: 概念・テーマクラスタ
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

        # identity_events: トレイト変動や価値の重要イベント
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

        self._conn.commit()

    # ------------------------------------------------------------------
    # 内部ユーティリティ
    # ------------------------------------------------------------------
    def _dump_meta(self, meta: Optional[Dict[str, Any]]) -> Optional[str]:
        if meta is None:
            return None
        try:
            return json.dumps(meta, ensure_ascii=False)
        except Exception:
            # 破損しないよう保険で文字列化
            return json.dumps({"_raw": str(meta)}, ensure_ascii=False)

    def _load_meta(self, raw: Optional[str]) -> Dict[str, Any]:
        if raw in (None, ""):
            return {}
        try:
            return json.loads(raw)
        except Exception:
            return {"_raw": raw}

    # ------------------------------------------------------------------
    # episodes
    # ------------------------------------------------------------------
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
        """
        対話エピソードを保存する。
        importance は 0.0〜1.0 を想定（高いほど重要）
        """
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
        """
        直近のエピソードを新しい順で取得。
        """
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
        records: List[EpisodeRecord] = []
        for r in rows:
            records.append(
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
        return records

    # ------------------------------------------------------------------
    # concepts
    # ------------------------------------------------------------------
    def store_concept(
        self,
        label: str,
        score: float,
        occurrences: int = 1,
        meta: Optional[Dict[str, Any]] = None,
    ) -> int:
        """
        概念クラスタを upsert する。
        ・既存 label があれば score や occurrences を更新
        ・なければ新規追加
        """
        ts = _utc_now_iso()
        meta_str = self._dump_meta(meta)

        cur = self._conn.cursor()
        # 既存レコードを確認
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
            # 更新
            new_score = float(score)
            new_occ = int(row["occurrences"]) + int(occurrences)
            cur.execute(
                """
                UPDATE concepts
                SET score = ?, occurrences = ?, last_seen = ?, meta = ?
                WHERE id = ?;
                """,
                (
                    new_score,
                    new_occ,
                    ts,
                    meta_str,
                    int(row["id"]),
                ),
            )
            self._conn.commit()
            return int(row["id"])
        else:
            # 挿入
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
        """
        概念クラスタを score の高い順に取得。
        """
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
        records: List[ConceptRecord] = []
        for r in rows:
            records.append(
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
        return records

    # ------------------------------------------------------------------
    # identity_events
    # ------------------------------------------------------------------
    def store_identity_event(
        self,
        kind: str,
        delta_calm: float = 0.0,
        delta_empathy: float = 0.0,
        delta_curiosity: float = 0.0,
        reward: float = 0.0,
        meta: Optional[Dict[str, Any]] = None,
    ) -> int:
        """
        トレイト変動・価値変動などの「人格に関わるイベント」を記録。
        """
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
        """
        直近の identity_events を新しい順で取得。
        kind を指定するとその種類に絞る。
        """
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
        records: List[IdentityEventRecord] = []
        for r in rows:
            records.append(
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
        return records

    # ------------------------------------------------------------------
    # クローズ
    # ------------------------------------------------------------------
    def close(self) -> None:
        try:
            self._conn.close()
        except Exception:
            pass