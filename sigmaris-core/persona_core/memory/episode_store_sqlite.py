# sigmaris-core/persona_core/memory/episode_store_sqlite.py
# ============================================================
# SQLiteEpisodeStore（Persona OS 完全版・記憶完全版準拠）
#
# 既存の JSON 版 EpisodeStore と同じ I/F を持つ SQLite バックエンド。
#   - add(episode)
#   - load_all()
#   - get_last(n)
#   - count()
#   - last_summary()
#   - trait_trend(n)
#   - fetch_recent(limit)
#   - fetch_by_ids(ids)
#   - search_embedding(vector, limit)
#
# PersonaController / SelectiveRecall / EpisodeMerger からは
# 既存 EpisodeStore と差し替え可能な「公式 Episodic Memory Store」。
# ============================================================

from __future__ import annotations

import json
import math
import os
import sqlite3
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .episode_store import Episode


# ============================================================
# Utility: cosine similarity（embedding 用）
# ============================================================

def _cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


# ============================================================
# SQLiteEpisodeStore 本体
# ============================================================

class SQLiteEpisodeStore:
    """
    Sigmaris Persona OS 公式 Episodic Memory Store（SQLite backend）

    JSON 版 EpisodeStore と完全互換のパブリック API を提供する。
    """

    DEFAULT_DB_PATH = "./sigmaris-data/episodes.sqlite3"

    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or self.DEFAULT_DB_PATH

        # ディレクトリ作成
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

        # スキーマ初期化
        self._init_schema()

    # --------------------------------------------------------
    # 内部: 接続 & スキーマ
    # --------------------------------------------------------

    def _connect(self) -> sqlite3.Connection:
        # シンプルさ優先で都度接続（スレッドセーフ）
        return sqlite3.connect(self.db_path)

    def _init_schema(self) -> None:
        with self._connect() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS episodes (
                    episode_id   TEXT PRIMARY KEY,
                    timestamp    TEXT NOT NULL,
                    summary      TEXT NOT NULL,
                    emotion_hint TEXT,
                    traits_hint  TEXT,   -- JSON
                    raw_context  TEXT,
                    embedding    TEXT    -- JSON (List[float] or null)
                );
                """
            )
            # timestamp インデックス（新しい順の取得が多い）
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_episodes_timestamp "
                "ON episodes (timestamp);"
            )
            conn.commit()

    # --------------------------------------------------------
    # 内部: Episode <-> row 変換
    # --------------------------------------------------------

    def _episode_to_row(self, episode: Episode) -> Dict[str, Any]:
        d = asdict(episode)
        # timestamp は ISO 文字列で保存（Episode.as_dict と同等）
        ts = episode.timestamp.astimezone(timezone.utc).isoformat()
        traits_json = json.dumps(episode.traits_hint or {}, ensure_ascii=False)
        emb_json = json.dumps(episode.embedding, ensure_ascii=False) if episode.embedding is not None else None

        return {
            "episode_id": episode.episode_id,
            "timestamp": ts,
            "summary": episode.summary,
            "emotion_hint": episode.emotion_hint,
            "traits_hint": traits_json,
            "raw_context": episode.raw_context,
            "embedding": emb_json,
        }

    def _row_to_episode(self, row: sqlite3.Row) -> Episode:
        # row: (episode_id, timestamp, summary, emotion_hint, traits_hint, raw_context, embedding)
        episode_id, ts_raw, summary, emotion_hint, traits_json, raw_context, emb_json = row

        # timestamp 復元
        if ts_raw:
            try:
                ts = datetime.fromisoformat(ts_raw)
            except Exception:
                ts = datetime.now(timezone.utc)
        else:
            ts = datetime.now(timezone.utc)

        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        # traits_hint / embedding 復元
        traits: Dict[str, float]
        if traits_json:
            try:
                traits = json.loads(traits_json)
                if not isinstance(traits, dict):
                    traits = {}
            except Exception:
                traits = {}
        else:
            traits = {}

        embedding: Optional[List[float]]
        if emb_json:
            try:
                embedding_loaded = json.loads(emb_json)
                if isinstance(embedding_loaded, list):
                    embedding = [float(x) for x in embedding_loaded]
                else:
                    embedding = None
            except Exception:
                embedding = None
        else:
            embedding = None

        return Episode(
            episode_id=episode_id or "",
            timestamp=ts,
            summary=summary or "",
            emotion_hint=emotion_hint or "",
            traits_hint=traits or {},
            raw_context=raw_context or "",
            embedding=embedding,
        )

    # --------------------------------------------------------
    # CRUD API（JSON EpisodeStore と同名）
    # --------------------------------------------------------

    def add(self, episode: Episode) -> None:
        """
        EpisodeStore への追加（完全版 OS の公式入口）
        PersonaController._store_episode() → ここに到達する。
        """
        row = self._episode_to_row(episode)
        with self._connect() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT OR REPLACE INTO episodes (
                    episode_id,
                    timestamp,
                    summary,
                    emotion_hint,
                    traits_hint,
                    raw_context,
                    embedding
                )
                VALUES (:episode_id, :timestamp, :summary, :emotion_hint,
                        :traits_hint, :raw_context, :embedding)
                """,
                row,
            )
            conn.commit()

    def load_all(self) -> List[Episode]:
        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                "SELECT episode_id, timestamp, summary, emotion_hint, "
                "traits_hint, raw_context, embedding "
                "FROM episodes ORDER BY timestamp ASC"
            )
            rows = cur.fetchall()
        return [self._row_to_episode(r) for r in rows]

    def get_last(self, n: int = 1) -> List[Episode]:
        """
        JSON 版の「eps[-n:]」と同じ挙動に合わせるため、
        DB では timestamp DESC で n 件取り、返す前に昇順に並べ直す。
        """
        if n <= 0:
            return []

        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                "SELECT episode_id, timestamp, summary, emotion_hint, "
                "traits_hint, raw_context, embedding "
                "FROM episodes ORDER BY timestamp DESC LIMIT ?",
                (n,),
            )
            rows = cur.fetchall()

        episodes = [self._row_to_episode(r) for r in rows]
        episodes.sort(key=lambda e: e.timestamp)
        return episodes

    def count(self) -> int:
        with self._connect() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM episodes")
            (cnt,) = cur.fetchone() or (0,)
        return int(cnt)

    # --------------------------------------------------------
    # Analytics
    # --------------------------------------------------------

    def last_summary(self) -> Optional[str]:
        last = self.get_last(1)
        return last[0].summary if last else None

    def trait_trend(self, n: int = 5) -> Dict[str, float]:
        """
        直近 n 件の traits_hint の平均。
        JSON 版 EpisodeStore の実装と同じロジックを SQL で再現。
        """
        eps = self.get_last(n)
        if not eps:
            return {"calm": 0.0, "empathy": 0.0, "curiosity": 0.0}

        calm_sum = sum(ep.traits_hint.get("calm", 0.0) for ep in eps)
        emp_sum = sum(ep.traits_hint.get("empathy", 0.0) for ep in eps)
        cur_sum = sum(ep.traits_hint.get("curiosity", 0.0) for ep in eps)
        denom = float(len(eps))

        return {
            "calm": round(calm_sum / denom, 4),
            "empathy": round(emp_sum / denom, 4),
            "curiosity": round(cur_sum / denom, 4),
        }

    # --------------------------------------------------------
    # Persona Core（SelectiveRecall / EpisodeMerger）必須 API
    # --------------------------------------------------------

    def fetch_recent(self, limit: int = 5) -> List[Episode]:
        """
        SelectiveRecall が first-stage recall に使う入口。
        直近 limit 件（timestamp 新しい順）を返す。
        """
        if limit <= 0:
            return []

        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                "SELECT episode_id, timestamp, summary, emotion_hint, "
                "traits_hint, raw_context, embedding "
                "FROM episodes ORDER BY timestamp DESC LIMIT ?",
                (limit,),
            )
            rows = cur.fetchall()

        episodes = [self._row_to_episode(r) for r in rows]
        # 新しい順で取得しているが、呼び出し側では順序に厳密依存しない前提。
        # 必要なら昇順にしたければここで sort する。
        episodes.sort(key=lambda e: e.timestamp)
        return episodes

    def fetch_by_ids(self, ids: List[str]) -> List[Episode]:
        """
        EpisodeMerger が pointer → episode に変換する際に使う。
        pointer の順序に合わせて返却する。
        """
        if not ids:
            return []

        placeholders = ",".join("?" for _ in ids)

        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                f"""
                SELECT episode_id, timestamp, summary, emotion_hint,
                       traits_hint, raw_context, embedding
                FROM episodes
                WHERE episode_id IN ({placeholders})
                """,
                ids,
            )
            rows = cur.fetchall()

        table: Dict[str, Episode] = {
            r["episode_id"]: self._row_to_episode(r) for r in rows
        }

        # 元の ids の順序を維持
        return [table[eid] for eid in ids if eid in table]

    def search_embedding(self, vector: List[float], limit: int = 5) -> List[Episode]:
        """
        ベクトル検索（embedding）用 API。

        実装方針：
          - embedding が存在する Episode を一括取得
          - Python 側で cosine similarity を計算
          - スコア上位 limit 件を返す
        """
        if not vector or limit <= 0:
            return self.fetch_recent(limit=limit if limit > 0 else 5)

        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                """
                SELECT episode_id, timestamp, summary, emotion_hint,
                       traits_hint, raw_context, embedding
                FROM episodes
                WHERE embedding IS NOT NULL
                """
            )
            rows = cur.fetchall()

        scored: List[tuple[float, Episode]] = []

        for r in rows:
            # embedding JSON → List[float]
            emb_json = r["embedding"]
            if not emb_json:
                continue

            try:
                emb_loaded = json.loads(emb_json)
                if not isinstance(emb_loaded, list):
                    continue
                emb_vec = [float(x) for x in emb_loaded]
            except Exception:
                continue

            if len(emb_vec) != len(vector):
                continue

            sim = _cosine_similarity(vector, emb_vec)
            if sim <= 0.0:
                continue

            ep = self._row_to_episode(r)
            scored.append((sim, ep))

        if not scored:
            # embedding が無い / スコアゼロ → fallback
            return self.fetch_recent(limit=limit)

        scored.sort(key=lambda x: x[0], reverse=True)
        top_eps = [ep for _, ep in scored[:limit]]
        # 類似度順のままで問題ないが、必要なら timestamp で再ソート可能
        return top_eps