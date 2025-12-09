# sigmaris-core/persona_core/memory/episode_merger.py
# ----------------------------------------------------
# Persona OS 完全版 — EpisodeMerger
#
# SelectiveRecall → AmbiguityResolver によって選択された
# MemoryPointer を EpisodeStore に引き当て、
# LLM に渡す “merged summary” を生成する中核レイヤー。

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Dict, Optional

from persona_core.types.core_types import PersonaRequest, MemoryPointer


# ============================================================
# EpisodeMergeResult
# ============================================================

@dataclass
class EpisodeMergeResult:
    summary: Optional[str]
    used_pointers: List[MemoryPointer] = field(default_factory=list)
    raw_segments: List[str] = field(default_factory=list)
    notes: Dict[str, Any] = field(default_factory=dict)


# ============================================================
# EpisodeMerger（完全版）
# ============================================================

class EpisodeMerger:
    """
    Persona OS 完全版 — 過去文脈統合レイヤ。

    役割：
      - MemoryPointer → EpisodeStore.fetch_by_ids → summary/raw_context 抽出
      - pointer の順序を維持したまま LLM へ渡す merged summary を構築

    memory_backend 要件：
      - fetch_by_ids(ids: List[str]) -> List[Episode]
        （Episode は episode_id / summary / raw_context を持つこと）
    """

    def __init__(
        self,
        *,
        memory_backend: Any,
        max_segments: int = 5,
        max_chars_per_segment: int = 200,
        header: str = "【関連する過去文脈】",
    ) -> None:

        self._backend = memory_backend
        self._max_segments = int(max_segments)
        self._max_chars = int(max_chars_per_segment)
        self._header = str(header)

    # ---------------------------------------------------------
    # (1) Episode から summary/raw_context 抽出
    # ---------------------------------------------------------

    def _fetch_texts(self, pointers: List[MemoryPointer]) -> List[str]:
        """
        MemoryPointer → EpisodeStore.fetch_by_ids(ids)
        完全版 Episode モデル仕様に基づき summary/raw_context を抽出。
        pointer 順序を保持して返す。
        """

        if not pointers:
            return []

        backend = self._backend
        if backend is None or not hasattr(backend, "fetch_by_ids"):
            return []

        ids = [p.episode_id for p in pointers if p.episode_id]
        if not ids:
            return []

        try:
            episodes = backend.fetch_by_ids(ids)  # type: ignore[attr-defined]
        except Exception:
            # EpisodeStore 障害は OS 全体へ伝搬させない
            return []

        # Episode 一覧を辞書化（episode_id -> text）
        extracted: Dict[str, str] = {}
        for ep in episodes:
            ep_id = getattr(ep, "episode_id", None)
            if not ep_id:
                continue

            summary = getattr(ep, "summary", None)
            raw = getattr(ep, "raw_context", None)

            text = None
            if isinstance(summary, str) and summary.strip():
                text = summary.strip()
            elif isinstance(raw, str) and raw.strip():
                text = raw.strip()
            else:
                text = ""

            extracted[ep_id] = text

        # pointer の順序に従ってセグメントを構築
        segments: List[str] = []
        for p in pointers:
            t = extracted.get(p.episode_id, "")
            if not t:
                continue
            # 1 セグメントの最大長を抑制（プロンプト暴走防止）
            segments.append(t[: self._max_chars])

        return segments

    # ---------------------------------------------------------
    # (2) merged summary 構築（完全版）
    # ---------------------------------------------------------

    def merge(
        self,
        *,
        req: PersonaRequest,
        pointers: List[MemoryPointer],
    ) -> EpisodeMergeResult:
        """
        上位（MemoryOrchestrator）から渡された pointers を統合し、
        LLM プロンプト向けの安定した merged summary を返す。
        """

        # pointer が空 → summary なし
        if not pointers:
            return EpisodeMergeResult(
                summary=None,
                used_pointers=[],
                raw_segments=[],
                notes={
                    "info": "no memory pointers provided",
                    "request_preview": (req.message or "")[:80],
                },
            )

        # pointer の最大数を絞る（score 降順は上流で保証済み）
        limited = pointers[: self._max_segments]

        # EpisodeStore から summary/raw_context 抽出
        raw_segments = self._fetch_texts(limited)

        if not raw_segments:
            return EpisodeMergeResult(
                summary=None,
                used_pointers=limited,
                raw_segments=[],
                notes={
                    "info": "no summary/raw_context extracted",
                    "request_preview": (req.message or "")[:80],
                    "pointer_count": len(limited),
                },
            )

        # -----------------------------------------------------
        # 完全版 merged summary の構造
        #
        #   【関連する過去文脈】
        #   [1] text
        #   [2] text
        #   ...
        #
        # LLM 側で安定動作するように、フォーマットを固定。
        # -----------------------------------------------------
        lines = [f"[{i+1}] {seg}" for i, seg in enumerate(raw_segments)]
        merged_summary = f"{self._header}\n" + "\n".join(lines)

        return EpisodeMergeResult(
            summary=merged_summary,
            used_pointers=limited,
            raw_segments=raw_segments,
            notes={
                "episode_count": len(limited),
                "used_episode_ids": [p.episode_id for p in limited],
                "request_preview": (req.message or "")[:80],
                "segment_preview": raw_segments[:3],
                "max_segments": self._max_segments,
                "max_chars_per_segment": self._max_chars,
            },
        )