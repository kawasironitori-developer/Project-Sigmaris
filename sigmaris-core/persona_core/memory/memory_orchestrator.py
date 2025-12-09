# sigmaris-core/persona_core/memory/memory_orchestrator.py
# ----------------------------------------------------------
# Persona OS 完全版 — Memory Integration Orchestrator
#
# 役割：
#   - Selective Recall（記憶候補抽出）
#   - Ambiguity Resolver（曖昧性除去）
#   - EpisodeMerger（過去文脈統合要約）
#
# PersonaController → IdentityContinuity → Value/Trait Drift →
# GlobalStateMachine → LLM Prompt の最上流レイヤー
# ----------------------------------------------------------

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from persona_core.types.core_types import PersonaRequest, MemoryPointer
from persona_core.memory.selective_recall import SelectiveRecall
from persona_core.memory.episode_merger import EpisodeMerger, EpisodeMergeResult
from persona_core.memory.ambiguity_resolver import (
    AmbiguityResolver,
    AmbiguityResolution,
)


# ==========================================================
# MemorySelectionResult — PersonaController が利用する形式
# ==========================================================

@dataclass
class MemorySelectionResult:
    """
    MemoryOrchestrator から PersonaController へ返す結果。

    - pointers:
        今回のターンで「参照すべき」と判断された MemoryPointer 群。
    - merged_summary:
        EpisodeMerger によって統合された過去文脈 summary。
        LLM の system prompt / identity_context などで利用される。
    - raw:
        デバッグ・ログ用メタ情報（SelectiveRecall / Ambiguity / Merge の中間情報）。
    """

    pointers: List[MemoryPointer] = field(default_factory=list)
    merged_summary: Optional[str] = None
    raw: Dict[str, Any] = field(default_factory=dict)


# ==========================================================
# MemoryOrchestrator — 完全版 Persona OS の中枢
# ==========================================================

class MemoryOrchestrator:
    """
    Persona OS 完全版 メモリ統合の中心レイヤ。

    Pipeline:
        1) SelectiveRecall → MemoryPointer を抽出
        2) AmbiguityResolver → 過剰文脈を削る / 優先度付け
        3) EpisodeMerger → 過去文脈 summary を生成

    この結果が IdentityContinuity / ValueDrift / TraitDrift /
    GlobalStateMachine / LLM クライアント など
    Persona OS 全体の“文脈の起点”となる。
    """

    def __init__(
        self,
        *,
        selective_recall: SelectiveRecall,
        episode_merger: EpisodeMerger,
        ambiguity_resolver: AmbiguityResolver,
    ) -> None:

        self._recall = selective_recall
        self._merger = episode_merger
        self._ambiguity = ambiguity_resolver

    # -----------------------------------------------------
    # メイン処理（完全版パイプライン）
    # -----------------------------------------------------

    def select_for_request(
        self,
        req: PersonaRequest,
        **backend_kwargs: Any,
    ) -> MemorySelectionResult:
        """
        完全版 SelectiveRecall → AmbiguityResolver → EpisodeMerger の
        フルパイプラインを実行し、MemorySelectionResult を構築する。

        backend_kwargs には PersonaController から渡される
        - user_id
        - episode_store
        - persona_db
        などのバックエンド情報が入ってくる想定。
        """

        debug_raw: Dict[str, Any] = {
            "request_preview": (req.message or "")[:120],
        }

        # ----------------------------------------------------------
        # (1) Selective Recall
        # ----------------------------------------------------------
        # SelectiveRecall 側は、追加情報を kwarg で受け取れる設計にしておく。
        pointers = self._recall.recall(req=req, **backend_kwargs)
        debug_raw["initial_pointer_count"] = len(pointers)

        if not pointers:
            debug_raw["info"] = "no memory pointers selected by SelectiveRecall"
            return MemorySelectionResult(
                pointers=[],
                merged_summary=None,
                raw=debug_raw,
            )

        # ----------------------------------------------------------
        # (2) Ambiguity Resolution
        # ----------------------------------------------------------
        ambiguity_result: AmbiguityResolution = self._ambiguity.resolve(
            req=req,
            pointers=pointers,
        )

        debug_raw["ambiguity"] = {
            "reason": ambiguity_result.reason,
            "resolved_count": len(ambiguity_result.resolved_pointers),
            "discarded_count": len(ambiguity_result.discarded_pointers),
            "notes": ambiguity_result.notes,
        }

        active_pointers = ambiguity_result.resolved_pointers

        if not active_pointers:
            debug_raw["info"] = "ambiguity resolved but no relevant memory left"
            return MemorySelectionResult(
                pointers=[],
                merged_summary=None,
                raw=debug_raw,
            )

        # ----------------------------------------------------------
        # (3) EpisodeMerger — 過去文脈 summary を構築
        # ----------------------------------------------------------
        # EpisodeMerger も backend_kwargs を受け取れる前提でフォワードする。
        merge_result: EpisodeMergeResult = self._merger.merge(
            req=req,
            pointers=active_pointers,
            **backend_kwargs,
        )

        debug_raw["merge"] = {
            "notes": merge_result.notes,
            "raw_segments_count": len(merge_result.raw_segments),
            "used_pointers_count": len(merge_result.used_pointers),
        }

        return MemorySelectionResult(
            pointers=merge_result.used_pointers,
            merged_summary=merge_result.summary,
            raw=debug_raw,
        )

    # -----------------------------------------------------
    # PersonaController legacy 互換 API
    # -----------------------------------------------------

    def select(
        self,
        req: PersonaRequest,
        **backend_kwargs: Any,
    ) -> MemorySelectionResult:
        """
        PersonaController は select(req, user_id=..., episode_store=..., persona_db=...)
        のように余分な kwarg を渡してくる。

        それらをそのまま SelectiveRecall / EpisodeMerger の backend_kwargs に
        フォワードしつつ、完全版パイプライン select_for_request を呼び出す
        互換レイヤー。
        """
        return self.select_for_request(req=req, **backend_kwargs)