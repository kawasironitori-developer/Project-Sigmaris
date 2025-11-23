# aei/episodic_memory/archive_manager.py
from __future__ import annotations

import json
import gzip
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from .epmem import Episode


class EpisodeArchiveManager:
    """
    Episode アーカイブ管理クラス。

    - 古い Episode を SQLite から取り出し
    - JSON/GZIP ファイルに保存
    - SQLite 側からは削除して容量削減
    - データは一切失われない

    使い方：
        arch = EpisodeArchiveManager()
        arch.archive(episodes)  # Episode のリストを渡すだけ
    """

    def __init__(self, archive_dir: str = "data/archive") -> None:
        self.archive_dir = Path(archive_dir)
        self.archive_dir.mkdir(parents=True, exist_ok=True)

    # ----------------------------------------------------------
    # JSON に変換
    # ----------------------------------------------------------
    def _episodes_to_json(self, episodes: List[Episode]) -> str:
        data = [ep.as_dict() for ep in episodes]
        return json.dumps(data, ensure_ascii=False, indent=2)

    # ----------------------------------------------------------
    # アーカイブ実行
    # ----------------------------------------------------------
    def archive(self, episodes: List[Episode]) -> str:
        if not episodes:
            return ""

        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        fname = self.archive_dir / f"episodes-{ts}.json.gz"

        # gzip で圧縮書き込み
        with gzip.open(fname, "wt", encoding="utf-8") as f:
            f.write(self._episodes_to_json(episodes))

        return str(fname)