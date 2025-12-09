# sigmaris-core/persona_core/memory/selective_recall.py
# ----------------------------------------------------------
# Persona OS 完全版 — Selective Recall（整合性フル修正版）
# ----------------------------------------------------------

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from persona_core.types.core_types import PersonaRequest, MemoryPointer


# ======================================================
# RecallCandidate — 内部候補
# ======================================================

@dataclass
class RecallCandidate:
    """Selective Recall 内部候補（Episode.summary を semantic source とする）"""
    episode_id: str
    text: str
    score: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


# ======================================================
# SelectiveRecall（Persona OS 完全版）
# ======================================================

class SelectiveRecall:
    """
    Persona OS 完全版 SelectiveRecall。

    memory_backend:
        - fetch_recent(limit: int) -> List[Episode]
          Episode.summary / Episode.timestamp を持つこと

    embedding_model:
        - encode(text) -> List[float]
        - similarity(v1, v2) -> float
    """

    def __init__(
        self,
        *,
        memory_backend: Any,
        embedding_model: Any,
        similarity_top_k: int = 5,
        min_score_threshold: float = 0.12,
        use_recency_bias: bool = True,
        recency_weight: float = 0.03,
    ) -> None:

        self._backend = memory_backend
        self._embed = embedding_model

        self._top_k = similarity_top_k
        self._min_score = min_score_threshold

        self._use_recency = use_recency_bias
        self._recency_weight = recency_weight

        # embedding fallback dim（encode失敗時のゼロベクトル長を確定させる）
        self._fallback_dim = 384

    # ------------------------------------------------------
    # (1) 候補収集
    # ------------------------------------------------------
    def collect_candidates(self, req: PersonaRequest) -> List[RecallCandidate]:
        """
        EpisodeStore から最大50件取得し、summary から RecallCandidate を生成する。
        """

        # EpisodeStoreの障害は OS 全体へ伝搬させない
        try:
            episodes = self._backend.fetch_recent(limit=50)
        except Exception:
            return []

        # ---- Query ベクトル化（失敗時はゼロベクトル） ----
        text = req.message or ""
        try:
            req_vec = self._embed.encode(text)
            self._fallback_dim = len(req_vec)
        except Exception:
            req_vec = [0.0] * self._fallback_dim

        candidates: List[RecallCandidate] = []
        total = len(episodes) or 1

        for idx, ep in enumerate(episodes):
            summary = getattr(ep, "summary", "") or ""
            timestamp = getattr(ep, "timestamp", None)

            # ---- 類似度 ----
            try:
                ep_vec = self._embed.encode(summary)
                score = float(self._embed.similarity(req_vec, ep_vec))
            except Exception:
                score = 0.0

            # ---- Recency Bias ----
            if self._use_recency:
                # 新しいものを少しだけ優遇
                recency_factor = (total - idx) / float(total)
                score += self._recency_weight * recency_factor

            # Episode ID 抽出（SQLite/JSON両対応）
            ep_id = getattr(ep, "episode_id", None) or getattr(ep, "id", None)
            if not ep_id:
                continue

            # timestamp の安全処理
            ts_str: Optional[str] = None
            try:
                ts_str = timestamp.isoformat() if timestamp else None
            except Exception:
                ts_str = None

            candidates.append(
                RecallCandidate(
                    episode_id=str(ep_id),
                    text=summary,
                    score=score,
                    metadata={"timestamp": ts_str},
                )
            )

        return candidates

    # ------------------------------------------------------
    # (2) スコアリング → MemoryPointer 変換
    # ------------------------------------------------------
    def rank_and_select(
        self,
        req: PersonaRequest,
        candidates: List[RecallCandidate],
    ) -> List[MemoryPointer]:

        if not candidates:
            return []

        # ---- スコア高い順 ----
        sorted_items = sorted(candidates, key=lambda c: c.score, reverse=True)

        # ---- 閾値以下を捨てる ----
        filtered = [c for c in sorted_items if c.score >= self._min_score]
        if not filtered:
            return []

        # ---- Top-K ----
        selected = filtered[: self._top_k]

        # ---- MemoryPointer 化 ----
        pointers = [
            MemoryPointer(
                episode_id=c.episode_id,
                source="episodic",
                score=float(c.score),
                summary=c.text[:200],  # EpisodeMerger と整合
            )
            for c in selected
        ]

        return pointers

    # ------------------------------------------------------
    # (3) 公開 API
    # ------------------------------------------------------
    def recall(self, req: PersonaRequest) -> List[MemoryPointer]:
        """
        MemoryOrchestrator → persona_controller が利用する入口。
        """
        candidates = self.collect_candidates(req)
        return self.rank_and_select(req, candidates)