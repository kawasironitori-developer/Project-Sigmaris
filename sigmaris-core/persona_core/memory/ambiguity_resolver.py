# sigmaris-core/persona_core/memory/ambiguity_resolver.py
# ----------------------------------------------------------
# Persona OS 完全版 — Ambiguity Resolver
#
# SelectiveRecall が返した MemoryPointer 群から、
# 曖昧参照（「それ」「前の」「続き」など）検出時のみ
# semantic re-ranking を行い、関連する pointer だけを残す。
#
# Persona OS 記憶パイプライン：
#   SelectiveRecall → AmbiguityResolver → EpisodeMerger → MemoryOrchestrator

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Optional, Dict

from persona_core.types.core_types import PersonaRequest, MemoryPointer


# ==========================================================
# AmbiguityResolution — 解決結果
# ==========================================================

@dataclass
class AmbiguityResolution:
    resolved_pointers: List[MemoryPointer] = field(default_factory=list)
    discarded_pointers: List[MemoryPointer] = field(default_factory=list)
    reason: Optional[str] = None
    notes: Dict[str, Any] = field(default_factory=dict)


# ==========================================================
# AmbiguityResolver 本体
# ==========================================================

class AmbiguityResolver:
    """
    Persona OS 完全版 曖昧性解決レイヤ。

    - 曖昧語を検出（軽量な高速チェック）
    - semantic re-ranking（類似度再計算）
    - SelectiveRecall の pointer を「本当に今回 relevant なもの」に絞る

    MemoryOrchestrator → resolver.resolve(req=req, pointers=pointers)
    """

    # 曖昧参照を示す語句（日本語/英語混在）
    AMBIGUOUS_TOKENS = [
        "それ", "前の", "続き", "あの件", "その話", "例のやつ", "あれ", "さっきの",
        "同じ話", "この前のやつ",
        "the last one", "previous one", "that thing",
    ]

    def __init__(
        self,
        *,
        embedding_model: Any,
        min_similarity: float = 0.15,
        max_resolve: int = 3,
    ) -> None:

        self._embed = embedding_model
        self._min_sim = float(min_similarity)
        self._max_resolve = int(max_resolve)

    # ------------------------------------------------------
    # (1) 曖昧語検出
    # ------------------------------------------------------

    def _detect_ambiguity(self, message: str) -> bool:
        """
        入力メッセージに曖昧参照が含まれているかの高速チェック。
        """
        if not message:
            return False
        msg = message.lower()
        return any(token in msg for token in self.AMBIGUOUS_TOKENS)

    # ------------------------------------------------------
    # (2) semantic re-ranking（pointer の精製）
    # ------------------------------------------------------

    def _rerank(
        self,
        req: PersonaRequest,
        pointers: List[MemoryPointer],
    ) -> List[MemoryPointer]:

        if not pointers:
            return []

        # クエリ側ベクトル生成
        try:
            req_vec = self._embed.encode(req.message or "")
        except Exception:
            req_vec = [0.0]

        rescored: List[MemoryPointer] = []

        for p in pointers:
            text = p.summary or ""
            try:
                ep_vec = self._embed.encode(text)
                sim = float(self._embed.similarity(req_vec, ep_vec))
            except Exception:
                sim = 0.0

            # 類似度が最低ラインを下回るものは破棄
            if sim < self._min_sim:
                continue

            rescored.append(
                MemoryPointer(
                    episode_id=p.episode_id,
                    source=p.source,
                    score=sim,      # 再スコアリング結果に置換
                    summary=p.summary,
                )
            )

        # 類似度高い順（降順）
        rescored.sort(key=lambda x: x.score, reverse=True)
        return rescored

    # ------------------------------------------------------
    # (3) 公開 API — 曖昧性の解決
    # ------------------------------------------------------

    def resolve(
        self,
        *,
        req: PersonaRequest,
        pointers: List[MemoryPointer],
    ) -> AmbiguityResolution:

        message = req.message or ""

        # --------------------------------------------------
        # 曖昧語がない → pointer をそのまま返す
        # --------------------------------------------------
        if not self._detect_ambiguity(message):
            return AmbiguityResolution(
                resolved_pointers=pointers,
                discarded_pointers=[],
                reason="no ambiguity detected",
                notes={
                    "input": message,
                    "pointer_count": len(pointers),
                    "min_similarity": self._min_sim,
                    "max_resolve": self._max_resolve,
                },
            )

        # --------------------------------------------------
        # 曖昧語あり → semantic re-ranking
        # --------------------------------------------------
        reranked = self._rerank(req, pointers)

        # semantic に一致ゼロ → 全破棄
        if not reranked:
            return AmbiguityResolution(
                resolved_pointers=[],
                discarded_pointers=pointers,
                reason="ambiguity detected but no relevant memory",
                notes={
                    "input": message,
                    "original_count": len(pointers),
                    "min_similarity": self._min_sim,
                    "max_resolve": self._max_resolve,
                },
            )

        # --------------------------------------------------
        # Top-K（max_resolve）だけ残す
        # --------------------------------------------------
        top = reranked[: self._max_resolve]

        resolved_ids = {p.episode_id for p in top}
        discarded = [p for p in pointers if p.episode_id not in resolved_ids]

        return AmbiguityResolution(
            resolved_pointers=top,
            discarded_pointers=discarded,
            reason="ambiguity resolved by semantic reranking",
            notes={
                "input": message,
                "selected_count": len(top),
                "original_count": len(pointers),
                "min_similarity": self._min_sim,
                "max_resolve": self._max_resolve,
            },
        )