# aei/episodic_memory/sqlite_store.py
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from .epmem import Episode


class SQLiteEpisodeStore:
    """
    SQLite バックエンドの EpisodeStore。

    必須API:
      - add(Episode)
      - get_last(n)
      - get_all()
      - get_range(since, until)  ← LongTermPsychology が要求
      - delete(episode_id)
    """

    def __init__(self, db_path: str = "data/episodes.db") -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_db()

    # ----------------------------------------------------------
    # 初期化：テーブル作成
    # ----------------------------------------------------------
    def _init_db(self) -> None:
        cur = self.conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS episodes (
                episode_id   TEXT PRIMARY KEY,
                timestamp    TEXT NOT NULL,
                summary      TEXT,
                emotion_hint TEXT,
                traits_hint  TEXT,
                raw_context  TEXT
            );
            """
        )
        self.conn.commit()

    # ----------------------------------------------------------
    # Episode 追加
    # ----------------------------------------------------------
    def add(self, episode: Episode) -> None:
        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT OR REPLACE INTO episodes
                (episode_id, timestamp, summary, emotion_hint, traits_hint, raw_context)
            VALUES
                (?, ?, ?, ?, ?, ?);
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
        self.conn.commit()

    # ----------------------------------------------------------
    # Episode → Python 変換
    # ----------------------------------------------------------
    def _row_to_episode(self, row: sqlite3.Row) -> Episode:
        ts_raw = row["timestamp"]
        try:
            ts = datetime.fromisoformat(ts_raw)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
        except Exception:
            ts = datetime.now(timezone.utc)

        traits_raw = row["traits_hint"]
        try:
            traits = json.loads(traits_raw) if traits_raw else {}
        except Exception:
            traits = {}

        return Episode(
            episode_id=row["episode_id"],
            timestamp=ts,
            summary=row["summary"] or "",
            emotion_hint=row["emotion_hint"] or "",
            traits_hint=traits,
            raw_context=row["raw_context"] or "",
        )

    # ----------------------------------------------------------
    # 最近 n 件（古い順）
    # ----------------------------------------------------------
    def get_last(self, n: int) -> List[Episode]:
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT * FROM episodes
            ORDER BY timestamp DESC
            LIMIT ?;
            """,
            (int(n),),
        )
        rows = cur.fetchall()
        episodes = [self._row_to_episode(r) for r in rows]
        episodes.reverse()
        return episodes

    # ----------------------------------------------------------
    # 全件取得（古い順）
    # ----------------------------------------------------------
    def get_all(self) -> List[Episode]:
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT * FROM episodes
            ORDER BY timestamp ASC;
            """
        )
        rows = cur.fetchall()
        return [self._row_to_episode(r) for r in rows]

    # ----------------------------------------------------------
    # ★ 期間取得（LongTermPsychology 用）
    # ----------------------------------------------------------
    def get_range(self, since: datetime, until: datetime) -> List[Episode]:
        """
        timestamp BETWEEN since AND until の Episode を返す。
        LongTermPsychology が必須で使う。
        """
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT *
            FROM episodes
            WHERE timestamp BETWEEN ? AND ?
            ORDER BY timestamp ASC;
            """,
            (since.isoformat(), until.isoformat()),
        )
        rows = cur.fetchall()
        return [self._row_to_episode(r) for r in rows]

    # ----------------------------------------------------------
    # 削除
    # ----------------------------------------------------------
    def delete(self, episode_id: str) -> None:
        cur = self.conn.cursor()
        cur.execute("DELETE FROM episodes WHERE episode_id = ?;", (episode_id,))
        self.conn.commit()

    # ----------------------------------------------------------
    # クローズ
    # ----------------------------------------------------------
    def close(self) -> None:
        try:
            self.conn.close()
        except Exception:
            pass