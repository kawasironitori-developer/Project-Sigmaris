# sigmaris_persona_core/persona_modules/meta_reward_engine.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Dict, Any
import time

from ..types import Message, RewardSignal, TraitVector


@dataclass
class MetaRewardEngine:
    """
    MetaRewardEngine（メタ報酬エンジン / PersonaOS 完全版）

    役割:
      - 直近のメッセージ履歴から
          ・depth（どれだけ本質や理由に踏み込んでいるか）
          ・openness（どれだけ本音・内面を開示しているか）
          ・stability（感情表現の極端さ・安定度）
          ・negativity（ネガティブ度）
        を評価する。
      - RewardSignal を新仕様で返す：
          - global_reward（= value としても参照可）: -1.0〜1.0
          - trait_reward: calm / empathy / curiosity への軸別報酬（-1.0〜1.0 想定）
          - meta: 指標と trait_reward の dict 版
          - detail: 必要なら将来の可視化用の内訳を積む（v0.2では軽め）

    PersonaOS / ValueDriftEngine からは主に:

      reward.value                … 全体報酬
      reward.meta["trait_reward"] … 軸別報酬（dict形式）
      reward.trait_reward         … TraitVector としての軸別報酬

    を読み取る想定。
    """

    # 評価対象とする時間窓（秒）
    window_sec: float = 5 * 60.0  # 直近5分

    # ローカル履歴
    history: List[Message] = field(default_factory=list)

    # ============================================================
    # Feed
    # ============================================================
    def feed(self, message: Message) -> None:
        """
        直近 window_sec 秒分だけを保持する簡易バッファ。
        """
        now = time.time()
        self.history.append(message)

        # 古いものは削除
        trimmed: List[Message] = []
        for m in self.history:
            ts = getattr(m, "timestamp", None)
            if ts is None:
                trimmed.append(m)
                continue
            if (now - ts) <= self.window_sec:
                trimmed.append(m)
        self.history = trimmed

    # ============================================================
    # Main
    # ============================================================
    def compute(self) -> RewardSignal:
        """
        現在の履歴から RewardSignal を1つ生成する。

        戻り値:
          RewardSignal(
            global_reward = float,         # -1.0〜1.0
            trait_reward  = TraitVector,   # calm/empathy/curiosityへの軸別報酬
            reason        = "meta_reward:...",
            meta          = {..., "trait_reward": {...}},
            detail        = {...}          # 今後の可視化用に拡張可能
          )
        """

        # 0件ならニュートラル
        if not self.history:
            return RewardSignal(
                global_reward=0.0,
                trait_reward=None,
                reason="meta_reward:no_history",
                meta={
                    "depth": 0.0,
                    "openness": 0.0,
                    "stability": 0.0,
                    "negativity": 0.0,
                    "sample_size": 0,
                    "trait_reward": {
                        "calm": 0.0,
                        "empathy": 0.0,
                        "curiosity": 0.0,
                    },
                },
                detail={},
            )

        # user 発話のみ評価
        user_msgs = [
            m for m in self.history
            if getattr(m, "role", "") in ("user", "system_user")
        ]

        if not user_msgs:
            return RewardSignal(
                global_reward=0.0,
                trait_reward=None,
                reason="meta_reward:no_user_messages",
                meta={
                    "depth": 0.0,
                    "openness": 0.0,
                    "stability": 0.0,
                    "negativity": 0.0,
                    "sample_size": 0,
                    "trait_reward": {
                        "calm": 0.0,
                        "empathy": 0.0,
                        "curiosity": 0.0,
                    },
                },
                detail={},
            )

        # -----------------------------
        # スコア計算
        # -----------------------------
        depth = self._measure_depth(user_msgs)
        openness = self._measure_openness(user_msgs)
        stability = self._measure_stability(user_msgs)
        negativity = self._measure_negativity(user_msgs)

        # -----------------------------
        # 全体報酬の合成
        # -----------------------------
        raw = (
            + 0.4 * depth
            + 0.3 * openness
            + 0.3 * stability
            - 0.5 * negativity
        )
        global_reward = self._clip(raw, -1.0, 1.0)

        # -----------------------------
        # 軸別報酬の設計
        # -----------------------------
        # calm     : 安定度 - ネガティブ度
        # empathy  : 開示度 - ネガティブ度の一部
        # curiosity: 深さ   - ネガティブ度の一部
        calm_axis = self._clip(stability - negativity, -1.0, 1.0)
        empathy_axis = self._clip(openness - negativity * 0.5, -1.0, 1.0)
        curiosity_axis = self._clip(depth - negativity * 0.3, -1.0, 1.0)

        trait_vec = TraitVector(
            calm=calm_axis,
            empathy=empathy_axis,
            curiosity=curiosity_axis,
        )

        # reason タグ
        tags = []
        if depth > 0.6:
            tags.append("deep")
        if openness > 0.6:
            tags.append("open")
        if stability > 0.6:
            tags.append("stable")
        if negativity > 0.4:
            tags.append("negative")

        reason = "meta_reward"
        if tags:
            reason += ":" + ",".join(tags)

        # meta / detail には UI / デバッグが欲しがる情報をまとめておく
        meta: Dict[str, Any] = {
            "depth": depth,
            "openness": openness,
            "stability": stability,
            "negativity": negativity,
            "sample_size": len(user_msgs),
            # ValueDriftEngine v0.3 が参照する dict 形式の trait_reward
            "trait_reward": {
                "calm": calm_axis,
                "empathy": empathy_axis,
                "curiosity": curiosity_axis,
            },
        }

        detail: Dict[str, Any] = {
            "weights": {
                "depth": 0.4,
                "openness": 0.3,
                "stability": 0.3,
                "negativity": -0.5,
            },
            "raw_score": raw,
        }

        return RewardSignal(
            global_reward=global_reward,
            trait_reward=trait_vec,
            reason=reason,
            meta=meta,
            detail=detail,
        )

    # ============================================================
    # 内部スコアリング
    # ============================================================
    def _measure_depth(self, messages: List[Message]) -> float:
        deep_keywords = [
            "なぜ", "なんで", "どうして", "意味", "理由", "本質",
            "方向", "変わった", "どう思う",
            "what does", "why", "meaning",
        ]
        if not messages:
            return 0.0
        hits = sum(
            1
            for m in messages
            if any(k in (m.content or "").lower() for k in deep_keywords)
        )
        return self._clip(hits / len(messages), 0.0, 1.0)

    def _measure_openness(self, messages: List[Message]) -> float:
        keys = [
            "疲れ", "しんど", "つら", "悩", "不安", "正直", "本音",
            "私は", "俺は", "気持ち", "感情", "怖",
        ]
        if not messages:
            return 0.0
        hits = sum(
            1
            for m in messages
            if any(k in (m.content or "").lower() for k in keys)
        )
        return self._clip(hits / len(messages), 0.0, 1.0)

    def _measure_stability(self, messages: List[Message]) -> float:
        extreme_pos = ["最高", "完璧", "神", "最強"]
        extreme_neg = ["最悪", "無理", "死にたい", "消えたい"]
        if not messages:
            # 中庸とみなして 0.5
            return 0.5
        hits = sum(
            1
            for m in messages
            if any(k in (m.content or "").lower() for k in extreme_pos)
            or any(k in (m.content or "").lower() for k in extreme_neg)
        )
        ratio = hits / len(messages)
        # 極端表現が多いほど安定度を下げる
        return self._clip(1.0 - ratio, 0.0, 1.0)

    def _measure_negativity(self, messages: List[Message]) -> float:
        neg = [
            "無理", "だめ", "嫌", "いや", "疲れた", "しんどい",
            "つらい", "終わり", "価値がない", "どうでもいい",
        ]
        if not messages:
            return 0.0
        hits = sum(
            1
            for m in messages
            if any(k in (m.content or "").lower() for k in neg)
        )
        return self._clip(hits / len(messages), 0.0, 1.0)

    # ============================================================
    # 共通ユーティリティ
    # ============================================================
    @staticmethod
    def _clip(v: float, v_min: float, v_max: float) -> float:
        if v < v_min:
            return v_min
        if v > v_max:
            return v_max
        return v