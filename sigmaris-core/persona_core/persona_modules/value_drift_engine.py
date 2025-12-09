# sigmaris_persona_core/persona_modules/value_drift_engine.py
from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict

from ..types import TraitVector, RewardSignal
from ..config import ValueDriftConfig


@dataclass
class ValueDriftEngine:
    """
    自律的価値変動（Value Drift）エンジン v0.3

    役割:
      - 現在の TraitVector（calm/empathy/curiosity）と RewardSignal から
        「わずかな長期ドリフト」を加える。
      - 長期的には 0.5 付近に収束させつつ、
        報酬に応じた微細なズレを蓄積させる。

    RewardSignal 仕様（types.py）:
      - global_reward: float  （-1.0〜+1.0 を想定）
      - trait_reward: Optional[TraitVector]  （軸ごとの報酬 / 使わない場合 None）
      - reason: str
      - meta: dict
      - detail: dict
      - value プロパティは global_reward の互換アクセスとして定義済み。

    本エンジンは以下の順に値を解釈する：
      - グローバル報酬:
          1) reward.global_reward
          2) reward.value
          3) dict["global_reward"]
          4) dict["value"]
      - トレイト報酬:
          1) reward.trait_reward（TraitVector 互換オブジェクト）
          2) dict["trait_reward"]
          3) dict["meta"]["trait_reward"]
    """

    config: ValueDriftConfig

    # ------------------------------------------------------------
    # public API
    # ------------------------------------------------------------
    def step(
        self,
        traits: TraitVector,
        reward: RewardSignal | Dict[str, Any],
    ) -> TraitVector:
        """
        1 ステップ分の Value Drift を適用した TraitVector を返す。

        - traits: 現在のトレイト値（0.0〜1.0 を想定）
        - reward: MetaRewardEngine 等からの RewardSignal または dict
        """
        # 現在値を float にクリップして受け取る
        calm = float(traits.calm)
        empathy = float(traits.empathy)
        curiosity = float(traits.curiosity)

        # 0.5 の中心へ弱い引き戻し（長期的に暴走しないよう減衰）
        calm = self._decay_toward_center(calm)
        empathy = self._decay_toward_center(empathy)
        curiosity = self._decay_toward_center(curiosity)

        # RewardSignal を読み取る
        global_r = self._get_global_reward(reward)
        trait_r = self._get_trait_reward(reward)

        # 報酬の大きさに応じてステップサイズを算出
        step_size = self._compute_step_size(global_r)

        # 軸ごとに微小なドリフトを加える
        calm += self._drift_for_axis(
            axis_name="calm",
            axis_value=calm,
            global_reward=global_r,
            trait_reward=trait_r,
            step_size=step_size,
        )
        empathy += self._drift_for_axis(
            axis_name="empathy",
            axis_value=empathy,
            global_reward=global_r,
            trait_reward=trait_r,
            step_size=step_size,
        )
        curiosity += self._drift_for_axis(
            axis_name="curiosity",
            axis_value=curiosity,
            global_reward=global_r,
            trait_reward=trait_r,
            step_size=step_size,
        )

        # 0〜1 にクリップして返す
        return TraitVector(
            calm=self._clip01(calm),
            empathy=self._clip01(empathy),
            curiosity=self._clip01(curiosity),
        )

    # ------------------------------------------------------------
    # decay
    # ------------------------------------------------------------
    def _decay_toward_center(self, v: float) -> float:
        """
        中心 0.5 に向かって少しだけ引き戻す。

        v' = 0.5 + (v - 0.5) * decay
        """
        center = 0.5
        return center + (v - center) * float(self.config.decay)

    # ------------------------------------------------------------
    # reward getter（新仕様 / 旧仕様 両方対応）
    # ------------------------------------------------------------
    def _get_global_reward(
        self,
        reward: RewardSignal | Dict[str, Any],
    ) -> float:
        """
        グローバル報酬は以下順で探す：

          1. reward.global_reward
          2. reward.value（互換プロパティ）
          3. dict["global_reward"]
          4. dict["value"]
        """
        # dataclass / オブジェクト形式（RewardSignal）
        if hasattr(reward, "global_reward"):
            try:
                return float(getattr(reward, "global_reward"))
            except Exception:
                pass

        # 旧コードとの互換: value プロパティ
        if hasattr(reward, "value"):
            try:
                return float(getattr(reward, "value"))
            except Exception:
                pass

        # dict 形式
        if isinstance(reward, dict):
            if "global_reward" in reward:
                try:
                    return float(reward.get("global_reward", 0.0))
                except Exception:
                    pass
            if "value" in reward:
                try:
                    return float(reward.get("value", 0.0))
                except Exception:
                    pass

        # 見つからなければニュートラル
        return 0.0

    def _get_trait_reward(
        self,
        reward: RewardSignal | Dict[str, Any],
    ) -> Dict[str, float]:
        """
        trait_reward は以下順で探す：

          1. reward.trait_reward（TraitVector 互換）
          2. dict["trait_reward"]
          3. dict["meta"]["trait_reward"]
        """
        # 1. オブジェクト型: reward.trait_reward（TraitVector 想定）
        if hasattr(reward, "trait_reward"):
            try:
                tr = getattr(reward, "trait_reward")
            except Exception:
                tr = None

            if tr is not None:
                vals: Dict[str, float] = {}
                for k in ("calm", "empathy", "curiosity"):
                    try:
                        vals[k] = float(getattr(tr, k, 0.0))
                    except Exception:
                        vals[k] = 0.0
                return vals

        # 2. dict 型: reward["trait_reward"] が dict のケース
        if isinstance(reward, dict):
            tr = reward.get("trait_reward")
            if isinstance(tr, dict):
                vals_dict: Dict[str, float] = {}
                for k in ("calm", "empathy", "curiosity"):
                    try:
                        vals_dict[k] = float(tr.get(k, 0.0))
                    except Exception:
                        vals_dict[k] = 0.0
                return vals_dict

            # 3. 新仕様の直列化: reward["meta"]["trait_reward"]
            meta = reward.get("meta")
            if isinstance(meta, dict):
                tr2 = meta.get("trait_reward")
                if isinstance(tr2, dict):
                    vals_meta: Dict[str, float] = {}
                    for k in ("calm", "empathy", "curiosity"):
                        try:
                            vals_meta[k] = float(tr2.get(k, 0.0))
                        except Exception:
                            vals_meta[k] = 0.0
                    return vals_meta

        # 何もなければ0で埋める
        return {"calm": 0.0, "empathy": 0.0, "curiosity": 0.0}

    # ------------------------------------------------------------
    # step size
    # ------------------------------------------------------------
    def _compute_step_size(self, global_reward: float) -> float:
        """
        global_reward の絶対値に応じて
        min_step〜max_step の間でステップ幅を決める。

        - |global_reward| が小さい → min_step 付近
        - |global_reward| が大きい → max_step 付近
        """
        mag = abs(global_reward)
        if mag > 1.0:
            mag = 1.0

        min_s = float(self.config.min_step)
        max_s = float(self.config.max_step)

        return min_s + (max_s - min_s) * mag

    # ------------------------------------------------------------
    # axis drift
    # ------------------------------------------------------------
    def _drift_for_axis(
        self,
        axis_name: str,
        axis_value: float,
        global_reward: float,
        trait_reward: Dict[str, float],
        step_size: float,
    ) -> float:
        """
        個別軸（calm/empathy/curiosity）に対する変動量を計算。

        - global_reward は全軸に薄く効く
        - trait_reward[axis_name] があれば、その軸にやや強めに効く

        axis_value は将来的に
        「高すぎる時は抑制する」といったロジック追加用に残している。
        """
        _ = axis_value  # 未来の拡張用に保持

        # global_reward による共通ドリフト
        drift = step_size * float(global_reward) * 0.3

        # 各軸固有の評価
        axis_r = float(trait_reward.get(axis_name, 0.0))

        # 軸固有の評価は少し強めに反映
        drift += step_size * axis_r * 0.7

        return drift

    # ------------------------------------------------------------
    # clip
    # ------------------------------------------------------------
    @staticmethod
    def _clip01(v: float) -> float:
        """0.0〜1.0 にクリップ。"""
        if v < 0.0:
            return 0.0
        if v > 1.0:
            return 1.0
        return v