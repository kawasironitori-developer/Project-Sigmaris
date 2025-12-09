from __future__ import annotations
import sqlite3
import json
from datetime import datetime
from typing import List, Optional, Any

from .epmem import Episode


class EpisodeStoreSQLite:
    """
    SQLite バックエンドの EpisodeStore。
    Persona Core v2 / MemoryOrchestrator / EpisodeMerger に完全対応。
    """

    def __init__(self, db_path: str = "data/episodes.db") -> None:
        self.db_path = db_path
        self._init_db()

    # ---------------------------------------------------
    # 初期化：テーブル作成
    # ---------------------------------------------------
    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS episodes (
                episode_id TEXT PRIMARY KEY,
                timestamp TEXT,
                summary TEXT,
                emotion_hint TEXT,
                traits_hint TEXT,
                raw_context TEXT
            )
            """
        )
        conn.commit()
        conn.close()

    # ---------------------------------------------------
    # Episode を DB へ保存
    # ---------------------------------------------------
    def add(self, episode: Episode) -> None:
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()

        cur.execute(
            """
            INSERT OR REPLACE INTO episodes 
            (episode_id, timestamp, summary, emotion_hint, traits_hint, raw_context)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                episode.episode_id,
                episode.timestamp.isoformat(),
                episode.summary,
                episode.emotion_hint,
                json.dumps(episode.traits_hint, ensure_ascii=False),
                episode.raw_context,
            ),
        )
        conn.commit()
        conn.close()

    # ---------------------------------------------------
    # 既存 API: 最新 n 件を Episode として返す
    # ---------------------------------------------------
    def get_last(self, n: int) -> List[Episode]:
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()

        cur.execute(
            """
            SELECT episode_id, timestamp, summary, emotion_hint, traits_hint, raw_context
            FROM episodes
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (n,),
        )

        rows = cur.fetchall()
        conn.close()

        episodes = []
        for ep_id, ts, summary, emo, traits, raw in rows:
            dt = datetime.fromisoformat(ts)
            episodes.append(
                Episode(
                    episode_id=ep_id,
                    timestamp=dt,
                    summary=summary,
                    emotion_hint=emo,
                    traits_hint=json.loads(traits),
                    raw_context=raw,
                )
            )

        return list(reversed(episodes))

    # ---------------------------------------------------
    # 既存 API: 全取得
    # ---------------------------------------------------
    def get_all(self) -> List[Episode]:
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()

        cur.execute(
            """
            SELECT episode_id, timestamp, summary, emotion_hint, traits_hint, raw_context
            FROM episodes
            ORDER BY timestamp ASC
            """
        )

        rows = cur.fetchall()
        conn.close()

        episodes = []
        for ep_id, ts, summary, emo, traits, raw in rows:
            dt = datetime.fromisoformat(ts)
            episodes.append(
                Episode(
                    episode_id=ep_id,
                    timestamp=dt,
                    summary=summary,
                    emotion_hint=emo,
                    traits_hint=json.loads(traits),
                    raw_context=raw,
                )
            )

        return episodes

    # ===========================================================
    # 🔥 Persona Core v2 必須メソッド（追加実装）
    # ===========================================================

    # ---------------------------------------------------
    # MemoryOrchestrator → SelectiveRecall 用
    # 最新 n 件を返す（get_last のラッパ）
    # ---------------------------------------------------
    def fetch_recent(self, n: int) -> List[Episode]:
        return self.get_last(n)

    # ---------------------------------------------------
    # EpisodeMerger が使用
    # episode_id リストで複数取得
    # ---------------------------------------------------
    def fetch_by_ids(self, ids: List[str]) -> List[Episode]:
        if not ids:
            return []

        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()

        q = f"""
            SELECT episode_id, timestamp, summary, emotion_hint, traits_hint, raw_context
            FROM episodes
            WHERE episode_id IN ({",".join(['?'] * len(ids))})
        """

        cur.execute(q, ids)
        rows = cur.fetchall()
        conn.close()

        episodes = []
        for ep_id, ts, summary, emo, traits, raw in rows:
            dt = datetime.fromisoformat(ts)
            episodes.append(
                Episode(
                    episode_id=ep_id,
                    timestamp=dt,
                    summary=summary,
                    emotion_hint=emo,
                    traits_hint=json.loads(traits),
                    raw_context=raw,
                )
            )

        return episodes

    # ---------------------------------------------------
    # PersonaOS v2 設計的に必要な “embedding 検索”
    # 今は簡易ダミーとして実装
    # ---------------------------------------------------
    def search_embedding(self, vector: List[float], limit: int = 5) -> List[Episode]:
        """
        本来はベクトル検索を行うが、
        SQLite 版では簡易に「最新から limit 件返す」動作に置き換える。
        """
        return self.get_last(limit)