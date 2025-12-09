# sigmaris-core/persona_core/llm/llm_client_base.py
# ============================================================
# Persona OS 完全版 — LLMClient 抽象ベース
#
# 役割:
#   - PersonaController が依存する「LLM クライアント」の公式インターフェース
#   - OpenAI 実装 / ローカル LLM / テストダミー などを差し替え可能にする
#
# このモジュールを中心に:
#   - PersonaController は LLMClientLike にだけ依存する
#   - openai_llm_client.py などの実装クラスはここを継承する
# ============================================================

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Protocol, runtime_checkable

from persona_core.types.core_types import PersonaRequest
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.identity.identity_continuity import IdentityContinuityResult
from persona_core.value.value_drift_engine import ValueState
from persona_core.trait.trait_drift_engine import TraitState
from persona_core.state.global_state_machine import GlobalStateContext


# ============================================================
# LLMGenerationMeta — 追加メタ情報（任意）
# ============================================================

@dataclass
class LLMGenerationMeta:
    """
    LLM 応答に紐づく追加メタ情報。

    - raw_response:
        ベンダー固有のレスポンスオブジェクトをそのまま保持したい場合に使う。
        （JSON 変換した dict など）
    - usage:
        トークン使用量などの情報（可能なら格納）
    - model:
        実際に使用されたモデル名（router などで動的に選択される場合に便利）
    """
    raw_response: Optional[Any] = None
    usage: Dict[str, Any] = field(default_factory=dict)
    model: Optional[str] = None


# ============================================================
# LLMGenerationResult — 将来拡張用の結果コンテナ
# ============================================================

@dataclass
class LLMGenerationResult:
    """
    LLMClient 実装側が内部で扱いやすいようにするための結果コンテナ。

    PersonaController 側は当面「text」だけを使うが、
    将来的に token usage や model 情報を見たい場合、この構造を利用する。
    """
    text: str
    meta: LLMGenerationMeta = field(default_factory=LLMGenerationMeta)


# ============================================================
# LLMClientLike — PersonaController 等が依存する I/F
# ============================================================

@runtime_checkable
class LLMClientLike(Protocol):
    """
    PersonaController から見た LLM クライアントの最低限インターフェース。

    generate(...) は「テキスト（str）」を返すことが必須。
    encode/embed(...) は EpisodeStore への embedding 付与に利用されるため、
    実装側でサポートしていれば呼ばれる（任意）。
    """

    # ---- メイン推論メソッド（必須） ----
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
        ...

    # ---- Embedding API（任意） ----
    def encode(self, text: str) -> Any:  # List[float] 想定だが柔らかく保つ
        ...

    def embed(self, text: str) -> Any:
        ...


# ============================================================
# BaseLLMClient — 具体実装のためのベースクラス
# ============================================================

class BaseLLMClient(LLMClientLike):
    """
    すべての LLM クライアント実装のベースとなる抽象クラス。

    - OpenAI 実装 (OpenAILLMClient)
    - ローカル LLM 実装
    - テスト用ダミー実装
    などは、本クラスを継承して generate(...) を実装する。

    PersonaController からは LLMClientLike として扱われる。
    """

    # --------------------------------------------------------
    # 必須: generate()
    # --------------------------------------------------------
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
        1ターン分の LLM 応答を生成する。

        実装側では通常:
          1) system prompt 構築（Memory / Identity / Drift / FSM を統合）
          2) vendor API 呼び出し
          3) 応答テキスト抽出
        を行い、その結果のテキストを返す。
        """
        raise NotImplementedError("BaseLLMClient.generate() must be implemented")

    # --------------------------------------------------------
    # 任意: Embedding API
    # --------------------------------------------------------
    def encode(self, text: str) -> Any:
        """
        可能なら text → embedding ベクトルを返す。

        EpisodeStore の Episode.embedding 生成などに利用される。
        実装が提供しない場合、NotImplementedError を投げても構わないが、
        PersonaController 側は例外をキャッチして無視するため、
        デフォルト実装では None を返しておく。
        """
        return None

    def embed(self, text: str) -> Any:
        """
        encode(...) のエイリアス。
        実装側でどちらか片方だけ提供していても動作するようにしておく。
        """
        return self.encode(text)


# ============================================================
# Utility: LLM 入力のまとめ（任意利用）
# ============================================================

@dataclass
class LLMGenerationInput:
    """
    LLM に渡すべき情報を 1 つの構造体にまとめたもの。
    generate(...) の引数を整理したい場合に、実装側で任意に利用できる。

    使い方（実装例）:
        def generate(...):
            ctx = LLMGenerationInput.from_args(...)
            # ctx を元に system prompt を組み立てる
    """
    req: PersonaRequest
    memory: MemorySelectionResult
    identity: IdentityContinuityResult
    value_state: ValueState
    trait_state: TraitState
    global_state: GlobalStateContext

    @classmethod
    def from_args(
        cls,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> "LLMGenerationInput":
        return cls(
            req=req,
            memory=memory,
            identity=identity,
            value_state=value_state,
            trait_state=trait_state,
            global_state=global_state,
        )