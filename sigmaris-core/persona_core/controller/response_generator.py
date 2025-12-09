# sigmaris-core/persona_core/controller/response_generator.py
#
# Persona OS 完全版 — Response Generator
#
# 役割:
#   - GlobalStateMachine が決定した PersonaGlobalState を参照し、
#     実際に LLM へ投げる「リクエスト文面」を最終調整する。
#   - 状態に応じて以下を制御する:
#       NORMAL      → そのまま LLM へ委譲
#       REFLECTIVE  → 構造化・説明寄りのプロンプトを付与
#       OVERLOADED  → 要点に絞った簡潔応答モード
#       SAFETY_LOCK → 既定では固定メッセージで返す（設定で LLM 委譲も可）
#       SILENT      → 沈黙（または固定メッセージ）
#
#   - 実際のテキスト生成は LLMClientLike が担当し、
#     ResponseGenerator は「どういうモードで生成させるか」のみを決める。
#

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from persona_core.types.core_types import PersonaRequest
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.identity.identity_continuity import IdentityContinuityResult
from persona_core.value.value_drift_engine import ValueState
from persona_core.trait.trait_drift_engine import TraitState
from persona_core.state.global_state_machine import (
    GlobalStateContext,
    PersonaGlobalState,
)
from persona_core.controller.persona_controller import LLMClientLike


# ============================================================
# 設定
# ============================================================


@dataclass
class ResponseGeneratorConfig:
    """
    ResponseGenerator の挙動を制御する設定。
    """

    # OVERLOADED 時:
    #   - True  → 「要点だけ答えて」の追加指示を付与して LLM を呼ぶ
    #   - False → NORMAL と同様に扱う
    enable_overload_summarization: bool = True

    # REFLECTIVE 時:
    #   - True  → 「構造を整理しつつ説明して」の追加指示を付与
    #   - False → NORMAL と同様に扱う
    enable_reflective_rewriting: bool = True

    # SAFETY_LOCK 時:
    #   - False → 固定メッセージで返す（LLM を呼ばない）
    #   - True  → LLM には投げるが、安全寄りの固定 prefix を付ける
    safety_lock_passthrough: bool = False

    # SAFETY_LOCK 時、LLM を呼ばないモードで返すメッセージ
    safety_lock_message: str = (
        "安全性の観点から、このトピックについては詳しくお答えできません。"
    )

    # SILENT 時に返すメッセージ（完全沈黙にしたい場合は空文字にする）
    silent_message: str = ""

    # OVERLOADED / REFLECTIVE 用の最大文字長ヒント（プロンプト中でのみ利用）
    max_length_hint_chars: int = 600


# ============================================================
# ResponseGenerator 本体
# ============================================================


class ResponseGenerator:
    """
    Persona OS 完全版用の応答生成フロントエンド。

    PersonaController → ResponseGenerator → LLMClientLike

    既存の LLMClientLike.generate(...) をそのまま利用しつつ、
    req.message に軽いモード指示を付与して LLM を呼び出す。
    """

    def __init__(
        self,
        *,
        llm_client: LLMClientLike,
        config: Optional[ResponseGeneratorConfig] = None,
    ) -> None:
        self._llm = llm_client
        self._config = config or ResponseGeneratorConfig()

    # ------------------------------------------------------
    # 公開 API
    # ------------------------------------------------------

    def generate_reply(
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
        GlobalState に応じて req.message を調整し、
        LLMClientLike に委譲して最終応答テキストを返す。
        """

        state = global_state.state

        # 1) SILENT モード: 何も喋らない or 固定文
        if state == PersonaGlobalState.SILENT:
            return self._config.silent_message

        # 2) SAFETY_LOCK モード: 既定では固定メッセージ
        if state == PersonaGlobalState.SAFETY_LOCK and not self._config.safety_lock_passthrough:
            return self._config.safety_lock_message

        # 3) state に応じた req の調整
        patched_req = self._build_state_aware_request(req, global_state)

        # 4) LLM へ委譲
        return self._llm.generate(
            req=patched_req,
            memory=memory,
            identity=identity,
            value_state=value_state,
            trait_state=trait_state,
            global_state=global_state,
        )

    # ------------------------------------------------------
    # 内部: GlobalState ごとのリクエスト組み立て
    # ------------------------------------------------------

    def _build_state_aware_request(
        self,
        req: PersonaRequest,
        global_state: GlobalStateContext,
    ) -> PersonaRequest:
        """
        GlobalState に応じて req.message を軽く書き換えた
        新しい PersonaRequest を生成する。

        - NORMAL: そのまま
        - REFLECTIVE: 構造化された説明を促す prefix を付与
        - OVERLOADED: 要点に絞った短い応答を促す prefix を付与
        - SAFETY_LOCK (passthrough=True): 安全寄りの注意書きを付与
        """

        state = global_state.state

        # NORMAL の場合は何もいじらずそのまま返す
        if state == PersonaGlobalState.NORMAL:
            return req

        original_message = req.message or ""
        max_len = self._config.max_length_hint_chars

        # prefix を付けた新しい message を構築
        if state == PersonaGlobalState.REFLECTIVE and self._config.enable_reflective_rewriting:
            # 構造・理由を整理した説明モード
            new_msg = (
                "次のユーザー入力は、これまでの会話の文脈を踏まえた継続的な問いです。\n"
                "構造を整理しながら、落ち着いたトーンで、必要な情報に絞って説明してください。\n"
                "・結論を最初に簡潔に示す\n"
                "・その後に、理由や背景を過不足なく述べる\n"
                "・不要な前置きや過剰な丁寧さは避ける\n"
                "\n"
                "【ユーザー入力】\n"
                f"{original_message[:max_len]}"
            )

        elif state == PersonaGlobalState.OVERLOADED and self._config.enable_overload_summarization:
            # 過負荷モード → 要点に絞る
            new_msg = (
                "システムは現在、情報過多・負荷高めの状態です。\n"
                "次のユーザー入力に対して、重要な点に絞った短い回答のみを返してください。\n"
                "・一番重要なポイントを 2〜3 文で述べる\n"
                "・細かい枝葉の説明や長い前置きは避ける\n"
                "\n"
                "【ユーザー入力】\n"
                f"{original_message[:max_len]}"
            )

        elif state == PersonaGlobalState.SAFETY_LOCK and self._config.safety_lock_passthrough:
            # SAFETY_LOCK だが LLM にも投げるモード → セーフティ前置き
            new_msg = (
                "以下は安全性に配慮すべきトピックを含んでいる可能性があります。\n"
                "絶対に危険・有害・違法な行為を具体的に助言したり、"
                "過度に詳細な手順を説明したりしないでください。\n"
                "どうしてもリスクが高い場合は、一般的・抽象的な説明に留め、"
                "ユーザーの安全を最優先してください。\n"
                "\n"
                "【ユーザー入力】\n"
                f"{original_message[:max_len]}"
            )

        else:
            # その他 (NORMAL 相当 / 設定上何もしない場合) はそのまま
            return req

        # 新しい PersonaRequest を生成（metadata/context は維持）
        return PersonaRequest(
            user_id=req.user_id,
            session_id=req.session_id,
            message=new_msg,
            locale=req.locale,
            metadata=dict(req.metadata),  # コピーしておく
        )