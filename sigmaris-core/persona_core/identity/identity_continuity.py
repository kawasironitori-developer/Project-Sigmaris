# sigmaris-core/persona_core/identity/identity_continuity.py
#
# Persona OS 完全版における「Identity Continuity」の上位エンジン。
# 役割：
#   - MemoryOrchestrator の結果（MemorySelectionResult）を受け取る
#   - 旧 IdentityContinuityEngine（アンカー抽出）の hint を参照する（任意）
#   - 「今回の応答は、過去のどの文脈の“続き”なのか」をラベリングする
#   - PersonaController が LLM に渡す identity_context を組み立てる
#
# ここでは「Identity の完全定義」は行わず、
#   - topic_label（何の話か）
#   - has_past_context（過去文脈があるか）
#   - anchor_hint（アンカー抽出のラベル）
#   - memory_preview（過去文脈サマリの短縮版）
# をひとまとめにした identity_context を返す。
#
# 実際の「人格の長期変化」「Value/Trait Drift」は別モジュールが担当し、
# 本エンジンは「一貫した話題連結」の側に専念する。

from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from persona_core.types.core_types import PersonaRequest
from persona_core.memory.memory_orchestrator import MemorySelectionResult


# 旧 sigmaris_persona_core.identity_continuity.IdentityContinuityEngine を
# オプションで注入して使えるようにする（アンカー抽出サブ層）。
# 実装側で import 済みのものを渡してもらう想定なので、
# ここでは型は Any にして依存を緩く保つ。
LegacyAnchorEngine = Any


# ============================================================
# IdentityContinuityResult
# ============================================================

@dataclass
class IdentityContinuityResult:
    """
    IdentityContinuityEngineV3 が PersonaController に返す結果。

    - identity_context:
        LLM に渡せる「今回の identity に関するコンテキスト」。

        例:
          {
            "topic_label": "Sigmaris OS 設計の続き",
            "has_past_context": True,
            "anchor_hint": "前に話していた Sigmaris OS 設計の続き…",
            "memory_preview": "【関連する過去の文脈】[1] ...",
          }

    - used_anchors:
        使用したアンカーラベルのリスト（あれば）
    - notes:
        デバッグやログ用のメタ情報
    """

    identity_context: Dict[str, Any] = field(default_factory=dict)
    used_anchors: List[str] = field(default_factory=list)
    notes: Dict[str, Any] = field(default_factory=dict)


# ============================================================
# IdentityContinuityEngineV3 本体
# ============================================================

class IdentityContinuityEngineV3:
    """
    Persona OS 完全版用 Identity Continuity 上位エンジン。

    - MemoryOrchestrator から MemorySelectionResult を受け取る
    - （任意で）旧アンカーエンジンから hint を取得する
    - 「今回の応答が、過去のどの文脈の続きなのか」を identity_context としてまとめる

    ここでは「ラベル付け」「フラグ付け」「軽いプレビュー生成」に留める。
    実際の「返答本文」は別レイヤ（LLM 側）が担当する。
    """

    def __init__(
        self,
        *,
        anchor_engine: Optional[LegacyAnchorEngine] = None,
        max_memory_preview_chars: int = 240,
    ) -> None:
        """
        :param anchor_engine:
            旧 IdentityContinuityEngine（アンカー抽出）インスタンス。
            無くても動作はするが、あればより良いラベリングが可能。
        :param max_memory_preview_chars:
            memory.merged_summary を identity_context に埋め込む際の最大文字数。
        """
        self._anchor_engine = anchor_engine
        self._max_preview = max_memory_preview_chars

    # ------------------------------------------------------------------
    # パブリック API
    # ------------------------------------------------------------------

    def build_identity_context(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
    ) -> IdentityContinuityResult:
        """
        PersonaController から呼ばれるメインエントリ。

        - req: 今回のユーザーからのリクエスト
        - memory: MemoryOrchestrator の結果（過去文脈）

        戻り値として IdentityContinuityResult を返し、
        PersonaController は identity_result.identity_context を
        LLM へのシステムプロンプトや meta 情報として利用できる。
        """

        notes: Dict[str, Any] = {}

        # 1) アンカーエンジンがあれば、hint を取得
        anchor_hint = self._get_anchor_hint_safe(req=req, memory=memory, notes=notes)

        # 2) 過去文脈の有無
        has_past_context = bool(memory.pointers)

        # 3) メモリ側からの preview（長すぎるときはカット）
        memory_preview = self._build_memory_preview(memory)

        # 4) topic_label を推定
        topic_label = self._infer_topic_label(
            req=req,
            anchor_hint=anchor_hint,
            has_past_context=has_past_context,
            memory_preview=memory_preview,
        )

        identity_context: Dict[str, Any] = {
            "topic_label": topic_label,
            "has_past_context": has_past_context,
            "anchor_hint": anchor_hint,
            "memory_preview": memory_preview,
        }

        used_anchors: List[str] = []
        if anchor_hint:
            used_anchors.append(anchor_hint)

        notes.update(
            {
                "memory_pointer_count": len(memory.pointers),
                "has_merged_summary": memory.merged_summary is not None,
                "request_preview": (req.message or "")[:80],
                "topic_label": topic_label,
            }
        )

        return IdentityContinuityResult(
            identity_context=identity_context,
            used_anchors=used_anchors,
            notes=notes,
        )

    # ------------------------------------------------------------------
    # 内部ヘルパー
    # ------------------------------------------------------------------

    def _get_anchor_hint_safe(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        notes: Dict[str, Any],
    ) -> Optional[str]:
        """
        旧アンカーエンジンがあれば get_hint(...) を呼び出す。
        いくつかのシグネチャを許容する：

          - get_hint()
          - get_hint(req)
          - get_hint(req=req, memory=memory)

        例外は飲み込み、Persona OS 全体を落とさない。
        """
        if self._anchor_engine is None:
            notes["anchor_engine"] = "not_provided"
            return None

        try:
            fn = getattr(self._anchor_engine, "get_hint", None)
            if fn is None:
                notes["anchor_engine"] = "no_get_hint"
                return None

            sig = inspect.signature(fn)
            params = list(sig.parameters.values())
            hint: Optional[str]

            # 引数なし
            if len(params) == 0:
                hint = fn()

            # 位置引数1つ（req のみを期待）
            elif len(params) == 1 and params[0].kind in (
                inspect.Parameter.POSITIONAL_ONLY,
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
            ):
                hint = fn(req)

            # キーワード引数を許容する場合 → req, memory を両方渡してみる
            else:
                hint = fn(req=req, memory=memory)

            notes["anchor_engine"] = "ok"
            return hint

        except Exception as e:
            # ここで例外を飲み込み、Persona OS 全体を落とさない
            notes["anchor_engine"] = f"error: {type(e).__name__}: {e}"
            return None

    def _build_memory_preview(self, memory: MemorySelectionResult) -> Optional[str]:
        """
        MemorySelectionResult.merged_summary から、identity_context に
        埋め込みやすい軽いプレビュー文字列を作る。
        """
        if not memory.merged_summary:
            return None

        text = memory.merged_summary.strip()
        if len(text) <= self._max_preview:
            return text

        return text[: self._max_preview].rstrip() + "…"

    def _infer_topic_label(
        self,
        *,
        req: PersonaRequest,
        anchor_hint: Optional[str],
        has_past_context: bool,
        memory_preview: Optional[str],
    ) -> str:
        """
        identity_context に載せる topic_label を決める。

        優先順位：
          1) anchor_hint があればそれをベースにする
          2) has_past_context が True なら「過去の文脈の続き」と明示
          3) それ以外は「新規トピック」として扱う
        """

        # 1) アンカーエンジンが label を出している場合はそれを尊重
        if anchor_hint:
            return anchor_hint

        # 2) 過去文脈あり → 「続き」として処理
        if has_past_context:
            return "過去の会話の続き（自動推定）"

        # 3) 過去文脈もアンカーも無い場合 → 新規トピック
        text = (req.message or "").strip()
        if text:
            head = text.splitlines()[0].strip()
            if len(head) > 24:
                head = head[:24].rstrip() + "…"
            return f"新規トピック: {head}"

        return "新規トピック"