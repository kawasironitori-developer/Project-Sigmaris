from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any, Optional

from ..types import TraitVector
from ..config import EmotionConfig


@dataclass
class SnapshotBuilder:
    """
    PersonaOS の内部状態を 1 スナップショットとしてまとめるモジュール（完全版）

    PersonaOS.process() からは：
        snapshot = self.snapshot_builder.build(
            state=state,
            traits=self.traits,
            flags=flags,
            reward=reward,
        )

    Snapshot の目的：
        - UI 表示
        - デバッグ（LLM 応答と内部状態の整合性確認）
        - ロギング
        - AEI Core との内部同期
    """

    emotion_config: Optional[EmotionConfig] = None

    # ============================================================
    # PUBLIC API — Snapshot Build
    # ============================================================
    def build(
        self,
        *,
        state: str,
        traits: TraitVector,
        flags: Dict[str, bool],
        reward: Any,
    ) -> Dict[str, Any]:
        """
        PersonaOS 内部状態を snapshot としてまとめて返す。
        """
        return {
            "state": state,
            "traits": self._traits_block(traits),
            "flags": flags,
            "reward": self._reward_block(reward),
            "meta": {
                "version": "persona_snapshot_v0.3",
                "emotion_config": self._emotion_cfg_view(),
            },
        }

    # ============================================================
    # INTERNAL — Traits
    # ============================================================
    def _traits_block(self, traits: TraitVector) -> Dict[str, float]:
        """
        TraitVector → dict（0.0〜1.0）
        """
        try:
            return {
                "calm": float(traits.calm),
                "empathy": float(traits.empathy),
                "curiosity": float(traits.curiosity),
            }
        except Exception:
            # 防御的 fallback
            return {
                "calm": float(getattr(traits, "calm", 0.5)),
                "empathy": float(getattr(traits, "empathy", 0.5)),
                "curiosity": float(getattr(traits, "curiosity", 0.5)),
            }

    # ============================================================
    # INTERNAL — Reward
    # ============================================================
    def _reward_block(self, reward: Any) -> Dict[str, Any]:
        """
        RewardSignal（クラス）/ dict の両方に対応する統一フォーマット。

        出力形式:
            {
              "global_reward": float,
              "trait_reward": {calm, empathy, curiosity},
              "reason": str,
              "meta": {...}
            }
        """

        # ---- global_reward ----
        if hasattr(reward, "global_reward"):
            try:
                global_r = float(getattr(reward, "global_reward"))
            except Exception:
                global_r = 0.0
        else:
            try:
                global_r = float(reward.get("global_reward", 0.0))
            except Exception:
                global_r = 0.0

        # ---- reason ----
        if hasattr(reward, "reason"):
            reason = getattr(reward, "reason", None)
        else:
            reason = reward.get("reason")

        # ---- trait_reward ----
        if hasattr(reward, "trait_reward"):
            tr_raw = getattr(reward, "trait_reward", None)
        else:
            tr_raw = reward.get("trait_reward")

        trait_reward = {}
        for k in ("calm", "empathy", "curiosity"):
            try:
                if isinstance(tr_raw, dict):
                    trait_reward[k] = float(tr_raw.get(k, 0.0))
                else:
                    trait_reward[k] = float(getattr(tr_raw, k, 0.0))
            except Exception:
                trait_reward[k] = 0.0

        # ---- meta ----
        if hasattr(reward, "meta"):
            meta_raw = getattr(reward, "meta", None)
        else:
            meta_raw = reward.get("meta")

        meta = meta_raw if isinstance(meta_raw, dict) else {}

        return {
            "global_reward": global_r,
            "trait_reward": trait_reward,
            "reason": reason,
            "meta": meta,
        }

    # ============================================================
    # INTERNAL — Emotion Config Preview
    # ============================================================
    def _emotion_cfg_view(self) -> Dict[str, float] | None:
        """EmotionConfig の必要最小限ビュー（UI / デバッグ向け）"""
        cfg = self.emotion_config
        if cfg is None:
            return None
        try:
            return {
                "base_temperature": float(cfg.base_temperature),
                "min_temperature": float(cfg.min_temperature),
                "max_temperature": float(cfg.max_temperature),
                "base_top_p": float(cfg.base_top_p),
                "emotion_bias": float(cfg.emotion_bias),
            }
        except Exception:
            return None 