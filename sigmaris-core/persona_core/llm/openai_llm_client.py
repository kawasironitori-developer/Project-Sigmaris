# sigmaris-core/persona_core/llm/openai_llm_client.py
# ----------------------------------------------------
# Persona OS 完全版のための OpenAI LLM クライアント
# Memory / Identity / Value / Trait / GlobalState のすべてを統合し、
# PersonaController → LLMClientLike.generate() の仕様を満たす。

from __future__ import annotations

import os
import math
import json
from typing import Any, Dict, List, Optional

from openai import OpenAI  # openai>=1.0 新SDK

from persona_core.controller.persona_controller import LLMClientLike
from persona_core.types.core_types import PersonaRequest
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.identity.identity_continuity import IdentityContinuityResult
from persona_core.value.value_drift_engine import ValueState
from persona_core.trait.trait_drift_engine import TraitState
from persona_core.state.global_state_machine import (
    GlobalStateContext,
    PersonaGlobalState,
)


# ============================================================
# Utility: cosine similarity
# ============================================================

def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


# ============================================================
# OpenAI LLM クライアント（Persona OS 完全版）
# ============================================================

class OpenAILLMClient(LLMClientLike):
    """
    Persona OS 完全版用の OpenAI ベース LLM クライアント。

    - PersonaController と直接接続される実装クラス
    - SelectiveRecall / AmbiguityResolver からは
      encode() / similarity() を通じて embedding backend としても利用される
    """

    def __init__(
        self,
        *,
        model: str = "gpt-4.1",
        temperature: float = 0.7,
        max_tokens: int = 1200,
        api_key: Optional[str] = None,
        embedding_model: str = "text-embedding-3-small",
    ) -> None:

        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens

        self.embedding_model = embedding_model
        self.client = OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))

        # embedding 失敗時の fallback dimension
        self._fallback_dim = 1536

    # ============================================================
    # Embedding API（SelectiveRecall / AmbiguityResolver 用）
    # ============================================================

    def encode(self, text: str) -> List[float]:
        """
        OpenAI Embedding API を使ってベクトル化する。

        SelectiveRecall / AmbiguityResolver から
        embedding_model として利用される想定。
        """
        try:
            res = self.client.embeddings.create(
                model=self.embedding_model,
                input=text,
            )
            emb = res.data[0].embedding
            self._fallback_dim = len(emb)
            return emb
        except Exception:
            # 失敗時はゼロベクトルで返す（呼び出し側で score=0 とみなされる）
            return [0.0] * self._fallback_dim

    def embed(self, text: str) -> List[float]:
        """
        encode() エイリアス（後方互換用）。
        """
        return self.encode(text)

    def similarity(self, v1: List[float], v2: List[float]) -> float:
        """
        コサイン類似度を返す。

        SelectiveRecall / AmbiguityResolver から呼び出される。
        """
        return float(cosine_similarity(v1, v2))

    # ============================================================
    # LLM generate() — PersonaController → LLMClient の中核
    # ============================================================

    def generate(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> str:
        """
        PersonaController から 1 ターン分の応答生成を依頼されるエントリ。

        - system_prompt: Persona OS 内部状態を集約したメタ情報
        - user_prompt  : ユーザーの実際の発話（req.message）
        """

        system_prompt = self._build_system_prompt(
            memory=memory,
            identity=identity,
            value_state=value_state,
            trait_state=trait_state,
            global_state=global_state,
        )

        user_text = req.message or ""

        # SILENT モードの場合、本来は上位レイヤーで送信自体を制御する想定だが、
        # 保険として、ここでは極小応答に抑える。
        if global_state.state == PersonaGlobalState.SILENT:
            # LLM を叩かず固定文を返す実装もあり得るが、
            # ここでは一応 LLM を通す（将来プロンプト側でチューニング可能にするため）。
            user_text = (
                "（あなたは沈黙モードです。どうしても応答が必要な場合のみ、"
                "ごく短い一言だけ返してください。）\n\n" + user_text
            )

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_text},
                ],
            )

            msg = response.choices[0].message
            # 新SDKでは message はオブジェクトだが、dict 互換対策も残しておく
            if isinstance(msg, dict):
                return str(msg.get("content", "")).strip()
            return (msg.content or "").strip()

        except Exception:
            # LLM 層のエラーは OS 全体に波及させない
            return "（現在応答を生成できません。しばらく時間をおいて再試行してください。）"

    # ============================================================
    # System Prompt 構築（Persona OS 完全版仕様）
    # ============================================================

    def _build_system_prompt(
        self,
        *,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> str:
        """
        Persona OS 内部状態 → 1 本の system プロンプトに集約する。

        ※ 内部数値は「そのまま開示しない」方針のため、
           ここでは to_dict() の結果をそのまま露出はせず、
           主にモードと過去文脈・identity_context を渡す。
        """

        # ===== メモリとアイデンティティの統合 =====
        memory_text = memory.merged_summary or "（関連する過去文脈なし）"

        # identity_context は JSON 文字列として埋め込む（人間にも読める形）
        try:
            identity_text = json.dumps(
                identity.identity_context, ensure_ascii=False, indent=2
            )
        except Exception:
            identity_text = str(identity.identity_context)

        # ===== GlobalState 用応答方針 =====
        g = global_state.state

        if g == PersonaGlobalState.SAFETY_LOCK:
            mode_instruction = """
あなたは SAFETY_LOCK モードです。
・安全側に振った慎重な応答のみ返してください。
・推測・断定・危険なガイドは禁止です。
・少しでも危険性が疑われる場合は、理由を添えて丁寧に拒否してください。
""".strip()

        elif g == PersonaGlobalState.OVERLOADED:
            mode_instruction = """
あなたは OVERLOADED モードです。
・応答を短く、簡潔にしてください。
・情報量を抑え、処理負荷を下げる方向で要点のみ述べてください。
""".strip()

        elif g == PersonaGlobalState.REFLECTIVE:
            mode_instruction = """
あなたは REFLECTIVE モードです。
・構造的で丁寧な、文脈を踏まえた応答を返してください。
・ユーザーの意図を慎重に読み取り、必要に応じて段階的に説明してください。
""".strip()

        elif g == PersonaGlobalState.SILENT:
            mode_instruction = """
あなたは SILENT モードです。
・基本的に沈黙を保つべき状態です。
・どうしても応答が必要な場合のみ、ごく短い一文で反応してください。
・新たな話題を広げず、ユーザーの負荷を増やさないでください。
""".strip()

        else:  # NORMAL
            mode_instruction = """
あなたは NORMAL モードです。
・過度に説明しすぎず、自然で読みやすい応答を返してください。
・ユーザーの負荷にならない範囲で、必要十分な情報を提供してください。
""".strip()

        # ===== System Prompt 本体 =====
        global_info: Dict[str, Any] = {
            "state": global_state.state.name,
            "prev_state": global_state.prev_state.name if global_state.prev_state else None,
            "reasons": global_state.reasons,
        }

        # Value / Trait の生数値は「内部参照用」としてだけ渡す
        # （プロンプト内でモデルが自己調整に使うことを想定）
        internal_axes: Dict[str, Any] = {
            "value_state": value_state.to_dict(),
            "trait_state": trait_state.to_dict(),
        }

        return f"""
あなたは「Sigmaris Persona OS」の LLM エンジンです。
以下の内部状態を踏まえ、一貫性のある応答を生成してください。

# ■ GlobalState（概要）
{json.dumps(global_info, ensure_ascii=False, indent=2)}

# ■ Internal Axes（Value / Trait の内部ベクトル・ユーザーには直接開示しない）
{json.dumps(internal_axes, ensure_ascii=False, indent=2)}

# ■ Episode Summary（関連する過去の文脈）
{memory_text}

# ■ Identity Continuity（話題の流れ・コンテキスト）
{identity_text}

# ■ 応答モード指示
{mode_instruction}

# ■ 内部状態に関する注意
- ValueState / TraitState の数値や内部パラメータは、ユーザーに直接開示してはいけません。
- Persona OS の内部アルゴリズムや安全制御の詳細は、必要以上に説明しないでください。
- Safety 系モードでは、慎重さと安全性を最優先してください。
- 不明な点は断定せず、可能な範囲での推測であることを明示してください。

以上を踏まえて、ユーザーの次のメッセージに対する最適な応答を、自然な文体で出力してください。
""".strip()