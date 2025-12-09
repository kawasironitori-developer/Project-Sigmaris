# sigmaris-core/persona_core/memory/episode_store.py
# ============================================================
# EpisodeStore（Persona OS 完全版・記憶完全版準拠）
# ============================================================

from __future__ import annotations

import json
import os
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, asdict
from datetime import datetime, timezone


# ============================================================
# Episode Model（完全版 Persona OS 対応）
# ============================================================

@dataclass
class Episode:
    """
    AEI Episodic Memory Unit — 記憶完全版 Persona OS の公式レコード。
    PersonaController / SelectiveRecall / EpisodeMerger 全部がこれを前提にする。
    """
    episode_id: str
    timestamp: datetime
    summary: str
    emotion_hint: str
    traits_hint: Dict[str, float]
    raw_context: str
    embedding: Optional[List[float]] = None

    def as_dict(self) -> Dict[str, Any]:
        """Episode を JSON 互換の dict に変換"""
        d = asdict(self)
        d["timestamp"] = self.timestamp.astimezone(timezone.utc).isoformat()
        return d

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "Episode":
        """dict から Episode に復元"""
        ts_raw = d.get("timestamp")
        if ts_raw:
            try:
                ts = datetime.fromisoformat(ts_raw)
            except Exception:
                ts = datetime.now(timezone.utc)
        else:
            ts = datetime.now(timezone.utc)

        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        return Episode(
            episode_id=d.get("episode_id", ""),
            timestamp=ts,
            summary=d.get("summary", ""),
            emotion_hint=d.get("emotion_hint", ""),
            traits_hint=d.get("traits_hint", {}) or {},
            raw_context=d.get("raw_context", ""),
            embedding=d.get("embedding"),
        )


# ============================================================
# EpisodeStore（JSON backend）
# ============================================================

class EpisodeStore:
    """
    Sigmaris Persona OS 公式 Episodic Memory Store（記憶完全版準拠）

    - SelectiveRecall の fetch_recent(...)
    - EpisodeMerger の fetch_by_ids(...)
    - PersonaController の episode 保存

    すべての I/F を保証する公式ストレージ。
    """

    DEFAULT_PATH = "./sigmaris-data/episodes.json"

    def __init__(self, path: Optional[str] = None) -> None:
        self.path = path or self.DEFAULT_PATH
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        if not os.path.exists(self.path):
            self._save_json([])

    # --------------------------------------------------------
    # JSON I/O
    # --------------------------------------------------------

    def _load_json(self) -> List[Dict[str, Any]]:
        """JSON ファイルを読み込む（破損時は初期化）"""
        try:
            if not os.path.exists(self.path):
                self._save_json([])
                return []
            with open(self.path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            # JSON破損時でも OS 全体を止めず復旧
            self._save_json([])
            return []

    def _save_json(self, raw_list: List[Dict[str, Any]]) -> None:
        """JSON ファイルを保存"""
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(raw_list, f, ensure_ascii=False, indent=2)

    # --------------------------------------------------------
    # CRUD API
    # --------------------------------------------------------

    def add(self, episode: Episode) -> None:
        """
        EpisodeStore への追加（完全版 OS の公式入口）。
        PersonaController._store_episode() → ここに到達する。
        """
        raw = self._load_json()
        raw.append(episode.as_dict())

        # timestamp 昇順（ISO文字列なら辞書順で昇順になる）
        raw.sort(key=lambda x: x.get("timestamp", ""))

        self._save_json(raw)

    def load_all(self) -> List[Episode]:
        """全エピソードを Episode オブジェクトとして読み込む"""
        return [Episode.from_dict(d) for d in self._load_json()]

    def get_last(self, n: int = 1) -> List[Episode]:
        """末尾 n 件を返す"""
        eps = self.load_all()
        return eps[-n:] if eps else []

    def count(self) -> int:
        """現在のエピソード総数を返す"""
        return len(self._load_json())

    # --------------------------------------------------------
    # Analytics
    # --------------------------------------------------------

    def last_summary(self) -> Optional[str]:
        """直近エピソードの summary を返す"""
        last = self.get_last(1)
        return last[0].summary if last else None

    def trait_trend(self, n: int = 5) -> Dict[str, float]:
        """
        直近 n 件の平均的 Trait 傾向を算出。
        calm / empathy / curiosity の平均値を返す。
        """
        eps = self.get_last(n)
        if not eps:
            return {"calm": 0.0, "empathy": 0.0, "curiosity": 0.0}

        c = sum(ep.traits_hint.get("calm", 0.0) for ep in eps) / len(eps)
        e = sum(ep.traits_hint.get("empathy", 0.0) for ep in eps) / len(eps)
        u = sum(ep.traits_hint.get("curiosity", 0.0) for ep in eps) / len(eps)

        return {
            "calm": round(c, 4),
            "empathy": round(e, 4),
            "curiosity": round(u, 4),
        }

    # --------------------------------------------------------
    # Persona Core（SelectiveRecall / EpisodeMerger）必須 API
    # --------------------------------------------------------

    def fetch_recent(self, limit: int = 5) -> List[Episode]:
        """
        SelectiveRecall が first-stage recall に使う入口。
        新しい順（timestamp降順）で返す。
        """
        eps = self.load_all()
        eps.sort(key=lambda e: e.timestamp, reverse=True)
        return eps[:limit] if eps else []

    def fetch_by_ids(self, ids: List[str]) -> List[Episode]:
        """
        EpisodeMerger が pointer → episode に変換する際に使う。
        pointer の順序に合わせて返却することが重要。
        """
        table = {ep.episode_id: ep for ep in self.load_all()}
        return [table[eid] for eid in ids if eid in table]

    def search_embedding(self, vector: List[float], limit: int = 5) -> List[Episode]:
        """
        将来のベクトル検索 API（現段階では fallback）。
        ここでは最新 limit 件を返す。
        """
        return self.fetch_recent(limit=limit)