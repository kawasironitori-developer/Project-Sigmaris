# sigmaris_persona_core/inner_loop.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Literal

from .types import (
    PersonaDecision,
    PersonaContext,
    TraitVector,
    RewardSignal,
)

# ============================================================
# 型定義
# ============================================================

InnerActionType = Literal[
    "none",
    "request_reflection",
    "request_introspection",
    "request_meta_reflection",
    "request_reward_update",
    "request_emotion_update",
    "request_value_update",
    "memory_snapshot",
]


@dataclass
class InnerAction:
    """
    InnerLoopEngine が外側（AEI Core / UI）に伝える「次にやるべき内面処理」。

    - type: 何をしたいか
    - reason: なぜそれを提案しているか（簡潔な文字列）
    - meta: 閾値や内部状態など、補助情報
    """

    type: InnerActionType
    reason: str
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class InnerLoopConfig:
    """
    PersonaOS の「自己循環ループ」のパラメータ。

    - reflection_turn_interval:
        何ターンごとに reflection を候補にするか（深めの対話前提）
    - introspection_turn_interval:
        何ターンごとに introspection を候補にするか
    - meta_reflection_turn_interval:
        何ターンごとに meta reflection を候補にするか
    - reward_interval:
        何ターンごとに RewardCore を叩くか
    - emotion_interval:
        何ターンごとに EmotionCore を更新するか
    - value_interval:
        何ターンごとに ValueCore を更新するか
    - min_reward_samples:
        meta 報酬が安定するまでに必要な最小ターン数
    """

    reflection_turn_interval: int = 6
    introspection_turn_interval: int = 12
    meta_reflection_turn_interval: int = 24

    reward_interval: int = 5
    emotion_interval: int = 3
    value_interval: int = 10

    min_reward_samples: int = 3


@dataclass
class InnerLoopState:
    """
    InnerLoopEngine 内部で持つ状態。

    - turn: この Persona インスタンスでの累計ターン数
    - last_*_turn: 各種処理を最後に行ったターン
    - cumulative_reward: meta reward の累積（簡易統計用）
    - reward_samples: meta reward を何回観測したか
    """

    turn: int = 0

    last_reflection_turn: int = 0
    last_introspection_turn: int = 0
    last_meta_reflection_turn: int = 0

    last_reward_turn: int = 0
    last_emotion_turn: int = 0
    last_value_turn: int = 0

    cumulative_reward: float = 0.0
    reward_samples: int = 0

    last_traits: TraitVector = field(
        default_factory=lambda: TraitVector(calm=0.5, empathy=0.5, curiosity=0.5)
    )


# ============================================================
# InnerLoopEngine 本体
# ============================================================


@dataclass
class InnerLoopEngine:
    """
    InnerLoopEngine
    ----------------

    PersonaOS が 1 ステップ応答したあと、
    「次にどの内面処理（Reflection / Reward / Value / Emotion 等）を走らせるべきか」
    を決める OS 内部のループ・コントローラ。

    ここでは実際の LLM コールや DB アクセスは行わず、
    あくまで「やるべきことのリスト (List[InnerAction])」を返す。
    AEI Core / UI 層がそれを見て、必要なエンドポイントを叩く想定。
    """

    config: InnerLoopConfig = field(default_factory=InnerLoopConfig)
    state: InnerLoopState = field(default_factory=InnerLoopState)

    # ========================================================
    # メインエントリ
    # ========================================================

    def step(
        self,
        *,
        decision: PersonaDecision,
        context: PersonaContext,
        traits: TraitVector,
        reward: Optional[RewardSignal],
    ) -> List[InnerAction]:
        """
        PersonaOS.process() 呼び出し後に 1 回叩かれることを想定。

        - decision: 今回の PersonaDecision
        - context: ユーザ / セッションコンテキスト
        - traits: 現在のトレイト値
        - reward: MetaRewardEngine からの報酬（なければ None）
        """

        self.state.turn += 1
        t = self.state.turn
        actions: List[InnerAction] = []

        # ---- Reward 統計更新 ----
        if reward is not None:
            self._update_reward_stat(reward)

        # ---- 1. PersonaDecision による優先行動 ----
        primary = self._plan_from_decision(decision)
        if primary.type != "none":
            actions.append(primary)
            self._update_last_turn(primary.type, t)

        # ---- 2. 周期的な Reward / Emotion / Value 更新 ----
        periodic = self._plan_periodic_updates(t)
        for act in periodic:
            actions.append(act)
            self._update_last_turn(act.type, t)

        # ---- 3. 長期的なメタ反省（meta_reflection）候補 ----
        meta_act = self._plan_meta_reflection(decision, traits)
        if meta_act is not None and meta_act.type != "none":
            actions.append(meta_act)
            self._update_last_turn(meta_act.type, t)

        # ---- 4. 内部状態のスナップショット（UI 可視化用の候補） ----
        snapshot_act = self._maybe_snapshot(context, traits)
        if snapshot_act is not None:
            actions.append(snapshot_act)

        # ---- 最後に traits を記録 ----
        self.state.last_traits = traits

        return actions

    # ========================================================
    # 個別ロジック
    # ========================================================

    def _update_reward_stat(self, reward: RewardSignal) -> None:
        self.state.cumulative_reward += float(reward.value)
        self.state.reward_samples += 1

    # --- 1. PersonaDecision ベースの行動計画 ---

    def _plan_from_decision(self, decision: PersonaDecision) -> InnerAction:
        """
        PersonaOS が「reflect した方がいい / introspect した方がいい」と
        判定した場合、それを最優先で尊重する。
        """
        if decision.need_reflection:
            return InnerAction(
                type="request_reflection",
                reason="persona_decision_need_reflection",
                meta={"preferred_state": decision.preferred_state},
            )

        if decision.need_introspection:
            return InnerAction(
                type="request_introspection",
                reason="persona_decision_need_introspection",
                meta={"preferred_state": decision.preferred_state},
            )

        # それ以外は特に「即時の優先リクエスト」はない
        return InnerAction(type="none", reason="no_primary_request", meta={})

    # --- 2. 周期的更新ロジック ---

    def _plan_periodic_updates(self, turn: int) -> List[InnerAction]:
        cfg = self.config
        st = self.state
        actions: List[InnerAction] = []

        # Reward 更新
        if (
            turn - st.last_reward_turn >= cfg.reward_interval
            and st.reward_samples >= cfg.min_reward_samples
        ):
            actions.append(
                InnerAction(
                    type="request_reward_update",
                    reason="periodic_reward_update",
                    meta={"turn": turn, "since_last": turn - st.last_reward_turn},
                )
            )

        # Emotion 更新
        if turn - st.last_emotion_turn >= cfg.emotion_interval:
            actions.append(
                InnerAction(
                    type="request_emotion_update",
                    reason="periodic_emotion_update",
                    meta={"turn": turn, "since_last": turn - st.last_emotion_turn},
                )
            )

        # Value 更新
        if turn - st.last_value_turn >= cfg.value_interval:
            actions.append(
                InnerAction(
                    type="request_value_update",
                    reason="periodic_value_update",
                    meta={"turn": turn, "since_last": turn - st.last_value_turn},
                )
            )

        return actions

    # --- 3. 長期メタ反省 ---

    def _plan_meta_reflection(
        self,
        decision: PersonaDecision,
        traits: TraitVector,
    ) -> Optional[InnerAction]:
        """
        - 特定のターン間隔で meta_reflection を候補にする
        - reward がマイナスに偏り続けている場合などもトリガー候補
        """
        cfg = self.config
        st = self.state
        turn = st.turn

        # ターンベースでの周期
        if turn - st.last_meta_reflection_turn >= cfg.meta_reflection_turn_interval:
            return InnerAction(
                type="request_meta_reflection",
                reason="periodic_meta_reflection",
                meta={
                    "turn": turn,
                    "since_last": turn - st.last_meta_reflection_turn,
                    "avg_reward": self._avg_reward(),
                    "traits": {
                        "calm": traits.calm,
                        "empathy": traits.empathy,
                        "curiosity": traits.curiosity,
                    },
                },
            )

        # 平均報酬が一定以下に落ち込んでいる場合は早めにトリガー
        avg_reward = self._avg_reward()
        if st.reward_samples >= cfg.min_reward_samples and avg_reward < -0.15:
            return InnerAction(
                type="request_meta_reflection",
                reason="negative_reward_trend",
                meta={
                    "turn": turn,
                    "avg_reward": avg_reward,
                    "reward_samples": st.reward_samples,
                },
            )

        return None

    def _avg_reward(self) -> float:
        st = self.state
        if st.reward_samples == 0:
            return 0.0
        return st.cumulative_reward / float(st.reward_samples)

    # --- 4. UI 可視化用のスナップショット候補 ---

    def _maybe_snapshot(
        self,
        context: PersonaContext,
        traits: TraitVector,
    ) -> Optional[InnerAction]:
        """
        今はかなり控えめに、
        - 10ターンに1度
        - もしくは reward_samples がちょうど min_reward_samples に達したとき
        に、UI 側での可視化用 snapshot を候補として返す。
        """
        st = self.state
        turn = st.turn
        cfg = self.config

        if turn % 10 == 0:
            return InnerAction(
                type="memory_snapshot",
                reason="periodic_snapshot",
                meta={
                    "turn": turn,
                    "user_id": context.user_id,
                    "session_id": context.session_id,
                    "traits": {
                        "calm": traits.calm,
                        "empathy": traits.empathy,
                        "curiosity": traits.curiosity,
                    },
                    "avg_reward": self._avg_reward(),
                    "reward_samples": st.reward_samples,
                },
            )

        if st.reward_samples == cfg.min_reward_samples:
            return InnerAction(
                type="memory_snapshot",
                reason="reward_samples_reached_min",
                meta={
                    "turn": turn,
                    "user_id": context.user_id,
                    "session_id": context.session_id,
                    "avg_reward": self._avg_reward(),
                    "reward_samples": st.reward_samples,
                },
            )

        return None

    # --- 5. last_*_turn の更新 ---

    def _update_last_turn(self, action_type: InnerActionType, turn: int) -> None:
        st = self.state

        if action_type == "request_reflection":
            st.last_reflection_turn = turn
        elif action_type == "request_introspection":
            st.last_introspection_turn = turn
        elif action_type == "request_meta_reflection":
            st.last_meta_reflection_turn = turn
        elif action_type == "request_reward_update":
            st.last_reward_turn = turn
        elif action_type == "request_emotion_update":
            st.last_emotion_turn = turn
        elif action_type == "request_value_update":
            st.last_value_turn = turn
        # memory_snapshot / none は last_* を更新しない