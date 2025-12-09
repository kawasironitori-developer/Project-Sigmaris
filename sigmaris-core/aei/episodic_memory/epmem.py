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

    - episode_id: 一意なID
    - timestamp: UTCベースの時刻
    - summary: 内省または出来事の要約
    - emotion_hint: AEI の情動ラベル（任意文字列）
    - traits_hint: calm / empathy / curiosity などの観測値
    - raw_context: 元ログ（会話全文など）
    - embedding: 完全版 Persona OS 用ベクトル（任意。無い場合は None）
    """

    episode_id: str
    timestamp: datetime
    summary: str
    emotion_hint: str
    traits_hint: Dict[str, float]
    raw_context: str
    embedding: Optional[List[float]] = None  # ← 完全版 Persona OS 互換フィールド

    def as_dict(self) -> Dict[str, Any]:
        """
        Episode → JSON（安全形式）
        timestamp は常に ISO8601 + UTC 文字列に変換する。
        """
        d = asdict(self)
        d["timestamp"] = self.timestamp.astimezone(timezone.utc).isoformat()
        return d

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "Episode":
        """
        JSON → Episode（破損救済込み）

        - timestamp が無い / 壊れている場合は「今のUTC」で復旧
        - traits_hint が無い場合は {} で復旧
        - embedding は存在すればそのまま、無ければ None
        """
        ts_raw = d.get("timestamp")
        if not ts_raw:
            ts = datetime.now(timezone.utc)
        else:
            try:
                ts = datetime.fromisoformat(ts_raw)
            except Exception:
                ts = datetime.now(timezone.utc)

        # naive → UTC
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        return Episode(
            episode_id=d.get("episode_id", ""),
            timestamp=ts,
            summary=d.get("summary", "") or "",
            emotion_hint=d.get("emotion_hint", "") or "",
            traits_hint=d.get("traits_hint", {}) or {},
            raw_context=d.get("raw_context", "") or "",
            embedding=d.get("embedding"),  # JSON に embedding があれば読み込む
        )


# =====================================================================
# EpisodeStore — JSON backend（完全版 Persona OS 互換）
# =====================================================================

class EpisodeStore:
    """
    Sigmaris OS — Episodic Memory Store

    Persona Core v2 に必要な API:
      - fetch_recent(n=None, limit=None)
      - fetch_by_ids(ids)
      - search_embedding(vec, limit)

    ここでは JSON ファイルを単純な永続層として利用する。
    """

    DEFAULT_PATH = "./sigmaris-data/episodes.json"

    def __init__(self, path: Optional[str] = None) -> None:
        self.path = path or self.DEFAULT_PATH

        # ディレクトリ準備
        os.makedirs(os.path.dirname(self.path), exist_ok=True)

        # episodes.json が無い場合 → 自動生成
        if not os.path.exists(self.path):
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump([], f, ensure_ascii=False, indent=2)

    # ------------------------------------------------------------ #
    # Low-level I/O
    # ------------------------------------------------------------ #

    def _load_json(self) -> List[Dict[str, Any]]:
        """
        生の JSON 配列を読み込む。
        壊れている場合は初期化して空リストに戻す。
        """
        if not os.path.exists(self.path):
            self._save_json([])
            return []

        try:
            with open(self.path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            # 壊れている場合は初期化
            self._save_json([])
            return []

    def _save_json(self, raw_list: List[Dict[str, Any]]) -> None:
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(raw_list, f, ensure_ascii=False, indent=2)

    # ------------------------------------------------------------ #
    # CRUD
    # ------------------------------------------------------------ #

    def add(self, episode: Episode) -> None:
        """
        Episode を追加し、timestamp 昇順でソートして保存。
        """
        raw = self._load_json()
        raw.append(episode.as_dict())
        raw.sort(key=lambda x: x.get("timestamp", ""))
        self._save_json(raw)

    def load_all(self) -> List[Episode]:
        """
        全 Episode を読み込み、Episode モデルに復元する。
        """
        raw = self._load_json()
        return [Episode.from_dict(d) for d in raw]

    def get_last(self, n: int = 1) -> List[Episode]:
        eps = self.load_all()
        return eps[-n:] if eps else []

    def get_range(self, start: datetime, end: datetime) -> List[Episode]:
        eps = self.load_all()
        return [ep for ep in eps if start <= ep.timestamp <= end]

    def count(self) -> int:
        return len(self._load_json())

    # ------------------------------------------------------------ #
    # Analytics
    # ------------------------------------------------------------ #

    def last_summary(self) -> Optional[str]:
        last = self.get_last(1)
        return last[0].summary if last else None

    def trait_trend(self, n: int = 5) -> Dict[str, float]:
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
    # Export
    # ------------------------------------------------------------ #

    def export_state(self) -> Dict[str, Any]:
        eps = self.load_all()
        return {
            "count": len(eps),
            "episodes": [ep.as_dict() for ep in eps],
            "trait_trend": self.trait_trend(n=10),
        }

    # ============================================================
    # Persona Core v2 必須 API
    # ============================================================

    def fetch_recent(
        self,
        n: Optional[int] = None,
        *,
        limit: Optional[int] = None,
    ) -> List[Episode]:
        """
        Persona Core v2（SelectiveRecall）が limit=◯ を渡すため、
        両方を受け取れるようにする互換レイヤ。

        - n が指定されていれば n を優先
        - n が None かつ limit があれば limit を使用
        - 両方 None の場合は 5 件にフォールバック
        """
        if n is None:
            n = limit if limit is not None else 5

        eps = self.load_all()
        return eps[-n:] if eps else []

    def fetch_by_ids(self, ids: List[str]) -> List[Episode]:
        """
        episode_id リストに対応する Episode を返す。
        存在しない ID は無視する。
        """
        all_eps = self.load_all()
        table = {ep.episode_id: ep for ep in all_eps}
        return [table[eid] for eid in ids if eid in table]

    def search_embedding(self, vector: List[float], limit: int = 5) -> List[Episode]:
        """
        本来はベクトル検索だが、現時点では未実装。
        完全版 Persona OS の API 互換のために、
        一旦「最新 limit 件」を返すダミー実装としている。
        """
        return self.fetch_recent(limit=limit)