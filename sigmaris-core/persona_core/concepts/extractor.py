# sigmaris_persona_core/concepts/extractor.py
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import List, Dict, Any

from aei.adapter.llm_adapter import LLMFn


@dataclass
class ConceptCandidate:
    """
    LLM が返した「概念」1つ分の表現。
    - label:   人間可読なラベル（例: "構造思考", "自己内省"）
    - score:   0〜1 想定の強度（重要度）
    - kind:    "value" / "topic" / "trait" などの分類
    - evidence: 代表となるテキスト断片
    """
    label: str
    score: float
    kind: str
    evidence: str = ""

    def as_dict(self) -> Dict[str, Any]:
        return {
            "label": self.label,
            "score": self.score,
            "kind": self.kind,
            "evidence": self.evidence,
        }


class LLMConceptExtractor:
    """
    LLM を使って episodes などのテキスト群から
    「このユーザーが大事にしている概念・テーマ」を抽出するモジュール。

    - AEI 既存の LLMAdapter.as_function() と同じ LLMFn を受け取る設計。
    """

    def __init__(self, llm_fn: LLMFn) -> None:
        self.llm_fn = llm_fn

    # ============================================================
    # パブリック API
    # ============================================================

    def extract_from_texts(self, texts: List[str], max_concepts: int = 12) -> List[ConceptCandidate]:
        """
        複数テキスト（episodes など）から概念候補を抽出する。

        返り値:
            List[ConceptCandidate] （パースに失敗した場合は []）
        """
        if not texts:
            return []

        prompt = self._build_prompt(texts=texts, max_concepts=max_concepts)
        raw = self.llm_fn(prompt)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            # LLM 側で JSON を返さなかった場合は黙って空配列
            return []

        return self._parse_concepts(data)

    # ============================================================
    # 内部: プロンプト生成
    # ============================================================

    def _build_prompt(self, texts: List[str], max_concepts: int) -> str:
        """
        LLM に渡すプロンプトを生成。
        - すべてのテキストを 1 ブロックで渡し、「概念クラスタ」にまとめさせる。
        """
        joined = "\n---\n".join(texts[:50])  # 安全のため最大50件に制限（後で調整可）

        # System メッセージは LLMAdapter 側で固定されているので、
        # ここでは user プロンプトとして JSON仕様を明示する。
        prompt = f"""
You are an analyzer for a long-term AI personality OS.

I will give you multiple text segments from one user (dialogues, reflections, notes).
From these, extract the core "concepts" that represent what this user values, cares about, or repeatedly focuses on.

Return ONLY a JSON object with the following structure:

{{
  "concepts": [
    {{
      "label": "short human-readable concept label (in Japanese if original texts are Japanese)",
      "score": 0.0-1.0 number (importance / strength),
      "kind": "one of: value | topic | trait | pattern | other",
      "evidence": "short excerpt from the texts that supports this concept"
    }},
    ...
  ]
}}

Requirements:
- Do NOT add any keys other than "concepts".
- "concepts" MUST be an array (possibly empty).
- Use at most {max_concepts} concepts.
- Keep "label" relatively short (max ~20 characters).
- If texts are mostly Japanese, prefer Japanese labels.

Here are the user's texts:

{texts_separator()}
{joined}
{texts_separator()}
"""
        return prompt.strip()

    # ============================================================
    # 内部: パース
    # ============================================================

    def _parse_concepts(self, data: Dict[str, Any]) -> List[ConceptCandidate]:
        concepts_raw = data.get("concepts")
        if not isinstance(concepts_raw, list):
            return []

        results: List[ConceptCandidate] = []
        for item in concepts_raw:
            if not isinstance(item, dict):
                continue

            label = str(item.get("label", "")).strip()
            if not label:
                continue

            # score は [0,1] にクリップ
            try:
                score = float(item.get("score", 0.5))
            except (TypeError, ValueError):
                score = 0.5
            score = max(0.0, min(1.0, score))

            kind = str(item.get("kind", "other")).strip() or "other"
            evidence = str(item.get("evidence", "")).strip()

            results.append(
                ConceptCandidate(
                    label=label,
                    score=score,
                    kind=kind,
                    evidence=evidence,
                )
            )

        return results


def texts_separator() -> str:
    """プロンプト内でテキスト群の境界として使うだけのユーティリティ。"""
    return "\n==== USER_TEXTS ====\n"