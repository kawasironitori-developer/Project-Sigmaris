# aei/episodic_memory/episode_store_sqlite.py
from __future__ import annotations
import sqlite3
import json
from datetime import datetime, timezone
from typing import List, Optional

from .epmem import Episode


class EpisodeStoreSQLite:
    """
    SQLite バックエンドの EpisodeStore。
    - API は EpisodeStore（メモリ版）と完全互換
    - データは data/episodes.db に永続化される
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
    # Episode → DB
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
    # 最新 n 件を Episode として返す
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

        # 新しい順で取ってきたので反転して「古 → 新」に揃える
        return list(reversed(episodes))

    # ---------------------------------------------------
    # 全取得
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