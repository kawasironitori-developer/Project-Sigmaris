# sigmaris_persona_core/persona_modules/silence_manager.py
from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any

from ..config import SilenceConfig


@dataclass
class SilenceManager:
    """
    主体的沈黙モジュール（PersonaOS 完全版 v0.2 対応）

    PersonaOS.process() 内で使われる想定：
        silence_info = silence.decide(
            abstraction_score=...,
            loop_suspect_score=...,
            user_insists=...
        )

    返却形式:
        {
            "silence": bool,
            "reason": str,
        }
    """

    config: SilenceConfig

    # ============================================================
    # DECISION CORE
    # ============================================================
    def decide(
        self,
        *,
        abstraction_score: float,
        loop_suspect_score: float,
        user_insists: bool,
    ) -> Dict[str, Any]:
        """
        主体的沈黙ロジック。

        方針（完全版 v0.2）:
          - abstraction_score / loop_suspect_score が閾値を超えると沈黙候補
          - user が強く要求している場合 allow_when_user_insists が True なら返答可能
          - 返答理由は全てタグ化して debug に渡す
        """

        # ---- 0. 安全クリップ ---------------------------------
        a = max(0.0, min(1.0, float(abstraction_score)))
        l = max(0.0, min(1.0, float(loop_suspect_score)))

        # ---- 1. 閾値判定 --------------------------------------
        too_abstract = a >= float(self.config.max_abstraction)
        too_loopy = l >= float(self.config.max_loop_suspect)

        silence_candidate = bool(too_abstract or too_loopy)

        # ---- 2. user insist -----------------------------------
        if user_insists and bool(self.config.allow_when_user_insists):
            return {
                "silence": False,
                "reason": self._build_reason(
                    silence=False,
                    too_abstract=too_abstract,
                    too_loopy=too_loopy,
                    user_insists=True,
                ),
            }

        # ---- 3. 沈黙発動 --------------------------------------
        if silence_candidate:
            return {
                "silence": True,
                "reason": self._build_reason(
                    silence=True,
                    too_abstract=too_abstract,
                    too_loopy=too_loopy,
                    user_insists=False,
                ),
            }

        # ---- 4. 通常返信 --------------------------------------
        return {
            "silence": False,
            "reason": "reply_selected:threshold_not_reached",
        }

    # ============================================================
    # REASON BUILDER
    # ============================================================
    def _build_reason(
        self,
        *,
        silence: bool,
        too_abstract: bool,
        too_loopy: bool,
        user_insists: bool,
    ) -> str:
        """
        PersonaOS.debug に入るタグ生成器。
        """
        tags: list[str] = []

        if too_abstract:
            tags.append("abstract_overload")
        if too_loopy:
            tags.append("loop_suspect")
        if user_insists:
            tags.append("user_insists")

        base = "silence_selected" if silence else "reply_selected"

        if tags:
            return f"{base}:" + ",".join(tags)
        return base