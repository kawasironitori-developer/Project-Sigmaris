# aei/episodic_memory/epmem.py
from __future__ import annotations

import json
import os
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, asdict
from datetime import datetime, timezone


# =====================================================================
# Episode Model
# =====================================================================

@dataclass
class Episode:
    """
    AEI Episodic Memory Unit
    - summary: 内省または出来事の要約
    - emotion_hint: AEI の情動ラベル
    - traits_hint: calm/empathy/curiosity の観測値
    - raw_context: 元ログ（会話全文など）
    """

    episode_id: str
    timestamp: datetime
    summary: str
    emotion_hint: str
    traits_hint: Dict[str, float]
    raw_context: str

    # ---------------------------- #
    # Serialization
    # ---------------------------- #

    def as_dict(self) -> Dict[str, Any]:
        """
        Episode → JSON へ安全に変換。
        timestamp は timezone-aware で isoformat 化。
        """
        d = asdict(self)
        d["timestamp"] = self.timestamp.astimezone(timezone.utc).isoformat()
        return d

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "Episode":
        """
        JSON → Episode へ復元。
        - timestamp は timezone-aware へ統一する。
        - 過去の naive datetime データも救済。
        """

        ts_raw = d.get("timestamp")
        if not ts_raw:
            # 異常値救済
            ts = datetime.now(timezone.utc)
        else:
            try:
                ts = datetime.fromisoformat(ts_raw)
            except Exception:
                # 壊れた ISO8601 救済
                ts = datetime.now(timezone.utc)

        # tzinfo が無ければ強制 UTC 付与
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        return Episode(
            episode_id=d.get("episode_id", ""),
            timestamp=ts,
            summary=d.get("summary", ""),
            emotion_hint=d.get("emotion_hint", ""),
            traits_hint=d.get("traits_hint", {}) or {},
            raw_context=d.get("raw_context", ""),
        )


# =====================================================================
# Episode Store
# =====================================================================

class EpisodeStore:
    """
    Sigmaris OS — Episodic Memory Store

    - Episode の JSON 管理
    - 時系列ソート
    - 直近 N 件の取得
    - 日付範囲の取得
    - trait 平均値などの解析

    Psychology（長期心理）・MetaReflection（長期内省）の
    すべてが依存する最重要レイヤ。
    """

    DEFAULT_PATH = "./sigmaris-data/episodes.json"

    def __init__(self, path: str = None) -> None:
        self.path = path or self.DEFAULT_PATH

        # ディレクトリ準備
        os.makedirs(os.path.dirname(self.path), exist_ok=True)

        # 初期ファイル作成
        if not os.path.exists(self.path):
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump([], f, ensure_ascii=False, indent=2)

    # ------------------------------------------------------------ #
    # Low-level I/O
    # ------------------------------------------------------------ #

    def _load_json(self) -> List[Dict[str, Any]]:
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            # 壊れた JSON の救済
            return []
        except FileNotFoundError:
            return []

    def _save_json(self, raw_list: List[Dict[str, Any]]) -> None:
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(raw_list, f, ensure_ascii=False, indent=2)

    # ------------------------------------------------------------ #
    # CRUD
    # ------------------------------------------------------------ #

    def add(self, episode: Episode) -> None:
        """
        Episode を追加し、timestamp でソートして保存。
        """
        raw = self._load_json()
        raw.append(episode.as_dict())

        # timestamp キーで時系列ソート（ISO8601 は文字列比較で OK）
        raw.sort(key=lambda x: x.get("timestamp", ""))

        self._save_json(raw)

    def load_all(self) -> List[Episode]:
        """
        JSON → Episode の完全復元
        （timestamp は always timezone-aware）
        """
        raw = self._load_json()
        return [Episode.from_dict(d) for d in raw]

    def get_last(self, n: int = 1) -> List[Episode]:
        eps = self.load_all()
        return eps[-n:] if eps else []

    def get_range(self, start: datetime, end: datetime) -> List[Episode]:
        eps = self.load_all()
        return [
            ep
            for ep in eps
            if start <= ep.timestamp <= end
        ]

    def count(self) -> int:
        return len(self._load_json())

    # ------------------------------------------------------------ #
    # Analytics helpers（Psychology / MetaReflection 用）
    # ------------------------------------------------------------ #

    def last_summary(self) -> Optional[str]:
        last = self.get_last(1)
        return last[0].summary if last else None

    def trait_trend(self, n: int = 5) -> Dict[str, float]:
        """
        直近 n 件の traits_hint の平均。

        Psychology が心理フェーズ推定に、
        MetaReflection が drift 要因分析に用いる。
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

    # ------------------------------------------------------------ #
    # Export for ValueCore / API
    # ------------------------------------------------------------ #

    def export_state(self) -> Dict[str, Any]:
        """
        ValueCore や API から参照されるためのシリアライズビュー。
        既存のメソッド構造は一切壊さず、「読み出し専用」の追加。
        """
        episodes = self.load_all()
        return {
            "count": len(episodes),
            "episodes": [ep.as_dict() for ep in episodes],
            "trait_trend": self.trait_trend(n=10),
        }