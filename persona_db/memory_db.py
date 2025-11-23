from __future__ import annotations

import os
import json
import re
import sqlite3
from datetime import datetime
from typing import Optional, List, Dict, Any

from .growth_log import GrowthLogEntry


# ============================================================
#  DB ROOT
# ============================================================

DEFAULT_DB_ROOT = os.getenv(
    "SIGMARIS_PERSONA_DB_ROOT",
    os.path.dirname(__file__),
)


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _safe_user_id(user_id: str) -> str:
    """
    SQLite のファイル名として安全化。
    """
    if not user_id:
        return "system"
    safe = []
    for ch in user_id:
        if ch.isalnum() or ch in ("-", "_"):
            safe.append(ch)
        else:
            safe.append("_")
    return "".join(safe)


def _simple_tokenize(text: str) -> List[str]:
    """
    v0.2 の超簡易トークナイザー。
    - 空白・句読点で分割
    - 記号のみ/1文字/極端に長いトークンは捨てる
    """
    if not text:
        return []

    rough_chunks = re.split(r"[ \t\r\n、。！？,.!?]+", text)

    tokens: List[str] = []
    for chunk in rough_chunks:
        chunk = chunk.strip()
        if not chunk:
            continue

        # 記号のみは捨てる
        if all((not c.isalnum()) and (c not in "_-") for c in chunk):
            continue

        # 1 文字はノイズと判断
        if len(chunk) < 2:
            continue

        # 長すぎるトークンもノイズ扱い
        if len(chunk) > 24:
            continue

        tokens.append(chunk)

    return tokens


# ============================================================
#   MemoryDB (PersonaOS: All Long-term Memory)
# ============================================================

class MemoryDB:
    """
    PersonaOS 完全版：長期記憶 DB

    - episodes：自然言語の会話ログ
    - concepts：概念クラスタ（トークン/話題）
    - identity_events：トレイト変化の履歴（Value Drift / Reward / Emotion）
    - growth_log：PersonaOS 内部の成長ログ（GrowthLogEntry）
    """

    def __init__(
        self,
        user_id: str = "system",
        db_path: Optional[str] = None,
    ) -> None:
        # user_id 単位でファイルを分ける（sigmaris_persona_core 側で管理）
        if db_path is not None:
            self.db_path = db_path
        else:
            _ensure_dir(DEFAULT_DB_ROOT)
            safe_id = _safe_user_id(user_id)
            self.db_path = os.path.join(DEFAULT_DB_ROOT, f"{safe_id}.sqlite3")

        # FastAPI マルチスレッド想定
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    # ============================================================
    # DB schema
    # ============================================================

    def _init_schema(self) -> None:
        cur = self.conn.cursor()

        # --- episodes（会話ログ） ---
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS episodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                session_id TEXT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                topic_hint TEXT,
                emotion_hint TEXT,
                importance REAL,
                meta_json TEXT
            );
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_episodes_session_ts
            ON episodes (session_id, ts);
            """
        )

        # --- identity events（トレイト変動） ---
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS identity_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                kind TEXT NOT NULL,
                delta_calm REAL,
                delta_empathy REAL,
                delta_curiosity REAL,
                reward REAL,
                meta_json TEXT
            );
            """
        )

        # --- concepts（概念クラスタ） ---
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS concepts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL UNIQUE,
                score REAL,
                occurrences INTEGER,
                last_updated TEXT,
                meta_json TEXT
            );
            """
        )

        # --- growth_log（旧仕様互換＋PersonaOS用） ---
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS growth_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                session_id TEXT,
                delta_calm REAL,
                delta_empathy REAL,
                delta_curiosity REAL,
                reward REAL,
                reward_reason TEXT,
                value_shift REAL,
                emotion TEXT,
                intensity REAL,
                silence INTEGER,
                contradiction INTEGER,
                intuition INTEGER,
                identity_hint TEXT,
                snapshot TEXT
            );
            """
        )

        self.conn.commit()

    # ============================================================
    # Episode API
    # ============================================================

    def store_episode(
        self,
        *,
        session_id: Optional[str],
        role: str,
        content: str,
        topic_hint: Optional[str],
        emotion_hint: Optional[str],
        importance: float,
        meta: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        自然言語の 1 発話ログを保存し、同時に concept 更新。
        PersonaOS.process() から呼ばれる想定。
        """
        ts = datetime.utcnow().isoformat()
        meta_json = json.dumps(meta or {}, ensure_ascii=False)

        with self.conn:
            self.conn.execute(
                """
                INSERT INTO episodes (
                    ts, session_id, role, content,
                    topic_hint, emotion_hint, importance, meta_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ts,
                    session_id,
                    role,
                    content,
                    topic_hint,
                    emotion_hint,
                    float(importance),
                    meta_json,
                ),
            )

        # episode から concept を更新
        self._update_concepts_from_episode(
            content=content,
            topic_hint=topic_hint,
            importance=float(importance),
        )

    # ------------------------------------------------------------

    def _update_concepts_from_episode(
        self,
        *,
        content: str,
        topic_hint: Optional[str],
        importance: float,
    ) -> None:
        """
        v0.2 concept 更新（topic hint 優先 + トークン抽出）
        """

        # topic hint 優先
        if topic_hint:
            label = str(topic_hint).strip()
            if label:
                self.store_concept(
                    label=label,
                    score=float(importance),
                    occurrences=1,
                    meta={"source": "topic_hint"},
                )

        tokens = _simple_tokenize(content)
        if not tokens:
            return

        unique_tokens = list(dict.fromkeys(tokens))
        base_score = max(0.05, min(1.0, importance or 0.1))

        for tok in unique_tokens[:16]:
            lower = tok.lower()
            if lower in ("the", "this", "that", "it", "you", "and", "or", "but"):
                continue

            self.store_concept(
                label=tok,
                score=base_score,
                occurrences=1,
                meta={"source": "auto_from_episode"},
            )

    # ============================================================
    # Identity events API
    # ============================================================

    def store_identity_event(
        self,
        *,
        kind: str,
        delta_calm: float = 0.0,
        delta_empathy: float = 0.0,
        delta_curiosity: float = 0.0,
        reward: float = 0.0,
        meta: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        AEI からの Reward / Emotion / Value などを
        identity_events に 1 行として記録する。
        """
        ts = datetime.utcnow().isoformat()
        meta_json = json.dumps(meta or {}, ensure_ascii=False)

        with self.conn:
            self.conn.execute(
                """
                INSERT INTO identity_events (
                    ts, kind,
                    delta_calm, delta_empathy, delta_curiosity,
                    reward, meta_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ts,
                    kind,
                    float(delta_calm),
                    float(delta_empathy),
                    float(delta_curiosity),
                    float(reward),
                    meta_json,
                ),
            )

    # ------------------------------------------------------------

    def load_latest_traits(
        self,
        baseline: Optional[Dict[str, float]] = None,
    ) -> Dict[str, float]:
        """
        identity_events の delta_* を集計して
        「現在のトレイト」を baseline からの相対で再構成する。
        """
        base = {
            "calm": 0.5,
            "empathy": 0.5,
            "curiosity": 0.5,
        }

        if baseline:
            base.update(
                {
                    "calm": float(baseline.get("calm", base["calm"])),
                    "empathy": float(baseline.get("empathy", base["empathy"])),
                    "curiosity": float(baseline.get("curiosity", base["curiosity"])),
                }
            )

        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT
                COALESCE(SUM(delta_calm), 0.0)       AS sum_calm,
                COALESCE(SUM(delta_empathy), 0.0)    AS sum_empathy,
                COALESCE(SUM(delta_curiosity), 0.0)  AS sum_curiosity
            FROM identity_events;
            """
        )
        row = cur.fetchone()

        if row is None:
            return base

        return {
            "calm": base["calm"] + float(row["sum_calm"] or 0.0),
            "empathy": base["empathy"] + float(row["sum_empathy"] or 0.0),
            "curiosity": base["curiosity"] + float(row["sum_curiosity"] or 0.0),
        }

    # ============================================================
    # Concepts API
    # ============================================================

    def store_concept(
        self,
        *,
        label: str,
        score: float,
        occurrences: int = 1,
        meta: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        ラベルごとに 1 レコードを upsert する。
        score は最新値で上書き、occurrences は加算。
        """
        label = label.strip()
        if not label:
            return

        ts = datetime.utcnow().isoformat()
        meta_json = json.dumps(meta or {}, ensure_ascii=False)

        with self.conn:
            self.conn.execute(
                """
                INSERT INTO concepts (
                    label, score, occurrences, last_updated, meta_json
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(label) DO UPDATE SET
                    score = excluded.score,
                    occurrences = concepts.occurrences + excluded.occurrences,
                    last_updated = excluded.last_updated,
                    meta_json = excluded.meta_json
                """,
                (
                    label,
                    float(score),
                    int(occurrences),
                    ts,
                    meta_json,
                ),
            )

    # ------------------------------------------------------------

    def get_concept_map(
        self,
        *,
        min_score: float = 0.0,
        limit: int = 64,
    ) -> Dict[str, Any]:
        """
        PersonaOS / UI 用の概念マップビュー。
        """
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT
                label,
                score,
                occurrences,
                last_updated,
                meta_json
            FROM concepts
            WHERE score >= ?
            ORDER BY score DESC, occurrences DESC, last_updated DESC
            LIMIT ?
            """,
            (float(min_score), int(limit)),
        )
        rows = cur.fetchall()

        nodes: List[Dict[str, Any]] = []

        for r in rows:
            try:
                meta = json.loads(r["meta_json"]) if r["meta_json"] else {}
            except Exception:
                meta = {"_parse_error": True}

            nodes.append(
                {
                    "label": r["label"],
                    "score": float(r["score"] or 0.0),
                    "occurrences": int(r["occurrences"] or 0),
                    "last_updated": r["last_updated"],
                    "meta": meta,
                }
            )

        return {
            "nodes": nodes,
            "stats": {
                "count": len(nodes),
                "min_score": min_score,
            },
            "edges": [],  # v0.2 では未使用（将来の共起クラスタ用）
        }

    # ============================================================
    # Growth log API（PersonaOS 用）
    # ============================================================

    def store_growth_log(self, entry: GrowthLogEntry) -> None:
        """
        PersonaOS 内部の GrowthLogEntry を 1 件保存。
        """
        row = entry.to_row()
        with self.conn:
            self.conn.execute(
                """
                INSERT INTO growth_log (
                    ts,
                    session_id,
                    delta_calm,
                    delta_empathy,
                    delta_curiosity,
                    reward,
                    reward_reason,
                    value_shift,
                    emotion,
                    intensity,
                    silence,
                    contradiction,
                    intuition,
                    identity_hint,
                    snapshot
                )
                VALUES (
                    :ts,
                    :session_id,
                    :delta_calm,
                    :delta_empathy,
                    :delta_curiosity,
                    :reward,
                    :reward_reason,
                    :value_shift,
                    :emotion,
                    :intensity,
                    :silence,
                    :contradiction,
                    :intuition,
                    :identity_hint,
                    :snapshot
                )
                """,
                row,
            )

    def get_recent_growth_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        直近の growth_log を取得（デバッグ・可視化用）。
        """
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT
                id,
                ts,
                session_id,
                delta_calm,
                delta_empathy,
                delta_curiosity,
                reward,
                reward_reason,
                value_shift,
                emotion,
                intensity,
                silence,
                contradiction,
                intuition,
                identity_hint,
                snapshot
            FROM growth_log
            ORDER BY id DESC
            LIMIT ?
            """,
            (int(limit),),
        )
        rows = cur.fetchall()
        return [dict(r) for r in rows]

    # ============================================================
    # Utility
    # ============================================================

    def close(self) -> None:
        try:
            self.conn.close()
        except Exception:
            pass


# ------------------------------------------------------------
# 互換性維持用のシングルトン（旧コード向け）
# ------------------------------------------------------------

db = MemoryDB(user_id="system")