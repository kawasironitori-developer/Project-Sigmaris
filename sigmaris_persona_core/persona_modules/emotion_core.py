# sigmaris_persona_core/persona_modules/emotion_core.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Any

from ..config import EmotionConfig
from ..types import TraitVector


def _clamp(value: float, min_v: float, max_v: float) -> float:
    """value を min_v〜max_v にクリップする小ユーティリティ。"""
    if value < min_v:
        return min_v
    if value > max_v:
        return max_v
    return value


@dataclass
class EmotionCore:
    """
    Sampling 戦略と「語りトーン」を決めるレイヤ。

    - PersonaOS からは decide_tone_and_sampling() だけを呼べばよい。
    - 入力: TraitVector（calm / empathy / curiosity）
    - 出力: LLM 呼び出し用の tone / temperature / top_p
    """

    config: EmotionConfig

    # ------------------------------------------------------------
    # public API
    # ------------------------------------------------------------
    def decide_tone_and_sampling(self, traits: TraitVector) -> Dict[str, Any]:
        """
        現在のトレイトから、応答の「トーン」と sampling パラメータを決定する。
        PersonaOS 側では以下のキーを参照することを前提にする:

        - tone: str                 … 文章スタイルのヒント
        - temperature: float        … LLM 温度
        - top_p: float              … nucleus sampling
        - meta: Dict[str, Any]      … デバッグ用の内部値
        """

        # TraitVector → float に安全変換
        calm = float(traits.calm)
        empathy = float(traits.empathy)
        curiosity = float(traits.curiosity)

        # -------------------------
        # 1. 内部スコア算出
        # -------------------------
        # 「覚醒度」: 落ち着きが低い + 好奇心が高いほど高めに
        arousal = (1.0 - calm) * 0.6 + curiosity * 0.4
        arousal = _clamp(arousal, 0.0, 1.0)

        # 「温かさ」: 共感性が高いほど warm 寄り（現状は meta 用）
        warmth = _clamp(empathy, 0.0, 1.0)

        # -------------------------
        # 2. temperature 決定
        # -------------------------
        base_t = float(self.config.base_temperature)

        # arousal が 0.5 より高いなら温度を上げ、低ければ下げる
        raw_temperature = base_t + (arousal - 0.5) * 0.4
        # 実際のクリップは EmotionConfig.clamp を通す
        temperature = self.config.clamp(raw_temperature)

        # -------------------------
        # 3. top_p 決定
        # -------------------------
        # 好奇心が高いほど「広く」サンプルするイメージ
        # calm が高いと少しだけ絞る方向
        base_top_p = 0.90
        top_p = base_top_p + (curiosity - 0.5) * 0.12 - (calm - 0.5) * 0.08
        top_p = _clamp(top_p, 0.60, 0.98)

        # -------------------------
        # 4. tone（スタイルラベル）
        # -------------------------
        tone = self._decide_tone(calm=calm, empathy=empathy, curiosity=curiosity)

        return {
            "tone": tone,
            "temperature": temperature,
            "top_p": top_p,
            "meta": {
                "arousal": arousal,
                "warmth": warmth,
                "traits": {
                    "calm": calm,
                    "empathy": empathy,
                    "curiosity": curiosity,
                },
            },
        }

    # ------------------------------------------------------------
    # internal helpers
    # ------------------------------------------------------------
    def _decide_tone(self, *, calm: float, empathy: float, curiosity: float) -> str:
        """
        トレイトから人間が読めるラベルを決める。
        （実際の LLM プロンプト側で利用しても良いし、UI 表示用でも良い）
        """

        # かなり落ち着いていて、共感性も高い
        if calm >= 0.7 and empathy >= 0.6:
            if curiosity >= 0.6:
                return "warm-curious"
            return "warm-calm"

        # 好奇心優位
        if curiosity >= 0.7:
            if calm >= 0.5:
                return "curious-balanced"
            return "curious-intense"

        # 落ち着きが低く、やや不安定
        if calm <= 0.3:
            if empathy >= 0.6:
                return "gentle-tense"
            return "tense-direct"

        # 共感性が高めで、他は中庸
        if empathy >= 0.7:
            return "soft-supportive"

        # どれも中庸 → ニュートラル
        return "neutral-analytic"