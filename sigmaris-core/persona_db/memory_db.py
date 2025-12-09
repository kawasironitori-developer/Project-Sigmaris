from __future__ import annotations

import os
import json
import re
import sqlite3
from datetime import datetime
from typing import Optional, List, Dict, Any

from .growth_log import GrowthLogEntry


# ============================================================
# DB ROOT
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


# ============================================================
# Tokenizer（完全版 SelectiveRecall 互換）
# ============================================================

STOPWORDS = {
    "the", "this", "that", "it", "you",
    "and", "or", "but", "a", "an", "of",
    "in", "on", "to"
}

def _simple_tokenize(text: str) -> List[str]:
    """
    Persona OS 完全版：軽量トークナイザー
    - 空白/句読点区切り
    - stopwords 除外
    - 記号のみ/1文字/極端に長いもの除外
    """
    if not text:
        return []

    chunks = re.split(r"[ \t\r\n、。！？,.!?;:()「」『』]+", text)
    out: List[str] = []

    for c in chunks:
        c = c.strip()
        if not c:
            continue

        # 記号のみ
        if all((not ch.isalnum()) and (ch not in "_-") for ch in c):
            continue

        # stopword / 1文字
        lower = c.lower()
        if len(c) < 2 or lower in STOPWORDS:
            continue

        # 長すぎるもの
        if len(c) > 32:
            continue

        out.append(c)

    return out


# ============================================================
#   MemoryDB（PersonaOS 完全版）
# ============================================================

class MemoryDB:
    """
    PersonaOS 完全版：長期記憶 DB
    - episodes
    - concepts
    - identity_events
    - growth_log
    """

    def __init__(
        self,
        user_id: str = "system",
        db_path: Optional[str] = None,
    ) -> None:

        if db_path:
            self.db_path = db_path
        else:
            _ensure_dir(DEFAULT_DB_ROOT)
            safe = _safe_user_id(user_id)
            self.db_path = os.path.join(DEFAULT_DB_ROOT, f"{safe}.sqlite3")

        # FastAPI のマルチスレッド・マルチアクセスに対応
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    # ============================================================
    # DB schema（完全版）
    # ============================================================

    def _init_schema(self) -> None:
        cur = self.conn.cursor()

        # --- episodes ---
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
            """CREATE INDEX IF NOT EXISTS idx_eps_session_ts
               ON episodes (session_id, ts);
            """
        )

        # --- identity events ---
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

        # --- concepts ---
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

        # --- growth_log ---
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
        自然言語の 1 発話ログを保存し、同時に concept を更新する。
        PersonaController / 旧 PersonaOS 双方から呼ばれることを想定。
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

        # episode 内容から concept を更新
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
        # topic_hint を優先ラベルとして扱う
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

        # 重複排除
        unique_tokens = list(dict.fromkeys(tokens))
        base_score = max(0.05, min(1.0, importance or 0.1))

        for tok in unique_tokens[:16]:
            lower = tok.lower()
            if lower in STOPWORDS:
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
        baseline からの相対として現在のトレイトを再構成する。
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
                    "curiosity": float(
                        baseline.get("curiosity", base["curiosity"])
                    ),
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
            "curiosity": base["curiosity"]
            + float(row["sum_curiosity"] or 0.0),
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
        ラベルごとに 1 レコードを upsert。
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
    # Growth log API
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
    # Identity Continuity API（episodes view）
    # ============================================================

    def get_recent_episodes(
        self,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        最新の会話ログを dict 形式で取得。
        旧 PersonaOS 側が「最近の文脈」を作るために使用。
        """
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT
                id, ts, session_id, role, content,
                topic_hint, emotion_hint, importance, meta_json
            FROM episodes
            ORDER BY id DESC
            LIMIT ?
            """,
            (int(limit),),
        )
        rows = cur.fetchall()

        out: List[Dict[str, Any]] = []
        for r in rows:
            try:
                meta = json.loads(r["meta_json"]) if r["meta_json"] else {}
            except Exception:
                meta = {"_parse_error": True}

            out.append(
                {
                    "id": r["id"],
                    "ts": r["ts"],
                    "session_id": r["session_id"],
                    "role": r["role"],
                    "content": r["content"],
                    "topic_hint": r["topic_hint"],
                    "emotion_hint": r["emotion_hint"],
                    "importance": float(r["importance"] or 0.0),
                    "meta": meta,
                }
            )
        return out

    # ------------------------------------------------------------

    class _EpisodeRecord:
        """
        /db/episodes API 用の簡易レコードオブジェクト。
        （server.py から r.id / r.content 形式で参照される）
        """

        def __init__(self, row: sqlite3.Row) -> None:
            self.id: int = row["id"]
            self.ts: str = row["ts"]
            self.session_id: Optional[str] = row["session_id"]
            self.role: str = row["role"]
            self.content: str = row["content"]
            self.topic_hint: Optional[str] = row["topic_hint"]
            self.emotion_hint: Optional[str] = row["emotion_hint"]
            self.importance: float = float(row["importance"] or 0.0)
            try:
                self.meta: Dict[str, Any] = (
                    json.loads(row["meta_json"]) if row["meta_json"] else {}
                )
            except Exception:
                self.meta = {"_parse_error": True}

    def load_recent_episodes(self, limit: int = 50) -> List["_EpisodeRecord"]:
        """
        server.py /db/episodes 用：
        r.id, r.content のように attribute アクセスできるレコードを返す。
        """
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT
                id, ts, session_id, role, content,
                topic_hint, emotion_hint, importance, meta_json
            FROM episodes
            ORDER BY id DESC
            LIMIT ?
            """,
            (int(limit),),
        )
        rows = cur.fetchall()
        return [self._EpisodeRecord(r) for r in rows]

    # ------------------------------------------------------------

    def search_episodes_by_keyword(
        self,
        keyword: str,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        content / topic_hint / meta_json を横断検索。
        PersonaOS が「あの〇〇の件」のような曖昧参照に利用。
        """
        kw = f"%{keyword}%"
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT
                id, ts, session_id, role, content,
                topic_hint, emotion_hint, importance, meta_json
            FROM episodes
            WHERE content LIKE ?
               OR topic_hint LIKE ?
               OR meta_json LIKE ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (kw, kw, kw, int(limit)),
        )
        rows = cur.fetchall()

        out: List[Dict[str, Any]] = []
        for r in rows:
            try:
                meta = json.loads(r["meta_json"]) if r["meta_json"] else {}
            except Exception:
                meta = {"_parse_error": True}

            out.append(
                {
                    "id": r["id"],
                    "ts": r["ts"],
                    "session_id": r["session_id"],
                    "role": r["role"],
                    "content": r["content"],
                    "topic_hint": r["topic_hint"],
                    "emotion_hint": r["emotion_hint"],
                    "importance": float(r["importance"] or 0.0),
                    "meta": meta,
                }
            )
        return out

    # ------------------------------------------------------------

    def get_related_episodes(
        self,
        user_input: str,
        limit: int = 10,
    ) -> Dict[str, Any]:
        """
        Identity Continuity 用の「関連エピソード」検索。
        - 入力を tokenize
        - keyword ごとに検索
        - importance / recency で簡易スコアリング
        """
        tokens = _simple_tokenize(user_input)
        if not tokens:
            return {"related": [], "tokens": []}

        results: List[Dict[str, Any]] = []

        for tok in tokens[:6]:
            hits = self.search_episodes_by_keyword(tok, limit=limit)
            for h in hits:
                h["_tok"] = tok
                results.append(h)

        # id ベースで重複排除
        uniq: Dict[int, Dict[str, Any]] = {}
        for r in results:
            eid = int(r["id"])
            if eid not in uniq:
                uniq[eid] = r

        merged = list(uniq.values())
        for r in merged:
            importance = float(r.get("importance") or 0.1)
            r["_score"] = importance + (float(r["id"]) / 1_000_000.0)

        merged.sort(key=lambda x: x["_score"], reverse=True)

        return {
            "tokens": tokens,
            "related": merged[:limit],
        }

    # ============================================================
    # Utility
    # ============================================================

    def close(self) -> None:
        try:
            self.conn.close()
        except Exception:
            pass


# ------------------------------------------------------------
# 互換性維持用シングルトン（旧コード向け）
# ------------------------------------------------------------

db = MemoryDB(user_id="system")