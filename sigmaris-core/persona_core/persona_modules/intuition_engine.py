# sigmaris_persona_core/persona_modules/intuition_engine.py
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Dict, Any

from ..types import Message
from ..config import IntuitionConfig


@dataclass
class IntuitionEngine:
    """
    疑似直観（Pseudo-Intuition）エンジン — PersonaOS 完全版 v0.2 対応

    PersonaOS.process() 内の利用：
        intuition_info = self.intuition.infer(self.messages)

    戻り値：
        {
            "allow": bool,
            "reason": str,
        }
    """

    config: IntuitionConfig

    # ============================================================
    # PUBLIC API
    # ============================================================
    def infer(self, messages: List[Message]) -> Dict[str, Any]:
        """
        全メッセージ履歴から「疑似直観」を発火させるか判定する。
        Reflection / Introspection の起動条件にも関わる。
        """

        # --------------------------------------------------------
        # 0. 履歴が存在しない
        # --------------------------------------------------------
        if not messages:
            return {"allow": False, "reason": "no_messages"}

        # --------------------------------------------------------
        # 1. user メッセージの抽出
        # --------------------------------------------------------
        user_msgs = [m for m in messages if getattr(m, "role", None) == "user"]
        total = len(user_msgs)

        min_ctx = max(1, int(self.config.min_context_size))

        if total < min_ctx:
            return {
                "allow": False,
                "reason": f"context_too_small:{total}",
            }

        # --------------------------------------------------------
        # 2. timestamp の整合性チェック
        # --------------------------------------------------------
        timestamps: List[float] = []
        for m in user_msgs:
            raw = getattr(m, "timestamp", None)
            try:
                if raw is not None:
                    timestamps.append(float(raw))
            except Exception:
                continue

        if len(timestamps) < 2:
            return {
                "allow": False,
                "reason": "insufficient_timestamp",
            }

        span = max(0.0, max(timestamps) - min(timestamps))
        min_span = max(0.0, float(self.config.min_time_span_sec))

        if span < min_span:
            return {
                "allow": False,
                "reason": f"timespan_short:{span:.2f}",
            }

        # --------------------------------------------------------
        # 3. 内容ベース（深層パターン）
        # --------------------------------------------------------
        last_msg = user_msgs[-1]
        content_raw = getattr(last_msg, "content", "") or ""
        content = content_raw.lower().strip()

        # PersonaOS 側で introspection/reflect の根拠に使う深層パターン
        deep_keywords = [
            "どう思う", "なんで", "理由", "意味", "方向", "本質",
            "変わった", "内面", "深い", "正直",
            # 英語圏用
            "why", "meaning", "reason", "direction", "inner", "core",
        ]

        deep_hit = any(k in content for k in deep_keywords)

        if not deep_hit:
            return {
                "allow": False,
                "reason": "no_deep_pattern",
            }

        # --------------------------------------------------------
        # 4. 疑似直観発火
        # --------------------------------------------------------
        return {
            "allow": True,
            "reason": "intuition_triggered",
        }