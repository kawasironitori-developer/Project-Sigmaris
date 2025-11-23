# aei/episodic_memory/__init__.py
from .epmem import Episode, EpisodeStore
from .sqlite_store import SQLiteEpisodeStore
from .archive_manager import EpisodeArchiveManager

__all__ = [
    "Episode",
    "EpisodeStore",          # 既存の in-memory 実装（互換用）
    "SQLiteEpisodeStore",    # 新規：SQLite バックエンド
    "EpisodeArchiveManager", # 新規：アーカイブ管理
]