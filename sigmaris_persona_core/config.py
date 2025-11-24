# sigmaris_persona_core/config.py
from __future__ import annotations
from dataclasses import dataclass, field

# ============================================================
# Silence / Contradiction / State Machine
# ============================================================


@dataclass
class SilenceConfig:
    """主体的沈黙の設定（完全版仕様）"""

    # 「抽象化が強すぎる」と沈黙候補とみなす閾値（0.0〜1.0）
    max_abstraction: float = 0.8
    # 同一トピック反復など「ループ疑い」の閾値（0.0〜1.0）
    max_loop_suspect: float = 0.7
    # ユーザーが明示的に「教えて」「どう思う？」と求めたとき、
    # 閾値超えでも沈黙せず軽めの返答を許可するか
    allow_when_user_insists: bool = True
    # 将来的に「沈黙を選ぶ総合スコア」のしきい値として利用予定
    silence_threshold: float = 0.6


@dataclass
class ContradictionConfig:
    """矛盾保持（Contradiction-Hold）の閾値設定"""

    # どれくらい矛盾を「内部に保持したまま」動作するか（0.0〜1.0）
    max_conflict_ratio: float = 0.65
    # ユーザー側が混乱しているときは矛盾を和らげる方向に動くか
    soften_when_user_confusion: bool = True


@dataclass
class StateMachineConfig:
    """
    PersonaOS 内部ステートマシン v0.3
    StateMachine クラスと 1:1 対応。
    """

    # 直近1分間に処理してよいメッセージ数の上限
    overload_limit_per_min: int = 20
    # reflect ステートのクールダウン秒数
    reflect_cooldown_sec: float = 30.0
    # introspect ステートのクールダウン秒数
    introspect_cooldown_sec: float = 60.0

    # 高次ステートの有効 / 無効フラグ（現状ロジックには未使用だが将来拡張用）
    allow_contradiction_hold: bool = True
    allow_silence_mode: bool = True


# ============================================================
# Value Drift / Intuition / Memory
# ============================================================


@dataclass
class ValueDriftConfig:
    """自律的価値変動（Value Drift）の設定"""

    # 1 ステップあたりの最大変動幅
    max_step: float = 0.02
    # 1 ステップあたりの最小変動幅
    min_step: float = 0.001
    # 中心値 0.5 に向かう減衰係数（0.0〜1.0）
    decay: float = 0.995


@dataclass
class IntuitionConfig:
    """疑似直観（Pseudo-Intuition）のトリガー条件"""

    # 直近コンテキストに必要なメッセージ数
    min_context_size: int = 5
    # 「流れ」を読むために必要な最低時間スパン（秒）
    min_time_span_sec: float = 60.0
    # 直観に基づく結論をどれくらい強く押すか（0〜1）
    # （v0.2 では未使用だが、将来 Emotion / Reward へのバイアスに利用予定）
    strength: float = 0.4


@dataclass
class MemoryConfig:
    """短期 / 中期 / 長期メモリの境界値"""

    # short メモリとして保持する時間窓（秒）
    short_window_sec: float = 15 * 60        # 15分
    # mid メモリとして保持する時間窓（秒）
    mid_window_sec: float = 48 * 3600        # 2日
    # 同一テーマが long_min_count 回以上出たら long-term 候補
    long_min_count: int = 5
    # 長期記憶クラスタリング時の類似度閾値（将来の persona_db 拡張用）
    cluster_threshold: float = 0.65


# ============================================================
# Emotion / Decoding / Sampling
# ============================================================


@dataclass
class EmotionConfig:
    """感情レイヤ（Emotion-Synthesis）"""

    base_temperature: float = 0.6
    min_temperature: float = 0.3
    max_temperature: float = 0.9

    # LLM decoding parameters（EmotionCore から任意に利用）
    base_top_p: float = 0.92
    emotion_bias: float = 0.15

    def clamp_temp(self, t: float) -> float:
        """temperature を [min_temperature, max_temperature] にクリップ"""
        if t < self.min_temperature:
            return self.min_temperature
        if t > self.max_temperature:
            return self.max_temperature
        return t

    def clamp_top_p(self, p: float) -> float:
        """top_p を [0.1, 1.0] にクリップ"""
        if p < 0.1:
            return 0.1
        if p > 1.0:
            return 1.0
        return p


# ============================================================
# Meta Reward
# ============================================================


@dataclass
class MetaRewardConfig:
    """MetaRewardEngine 用の設定"""

    # 評価対象とする時間窓（秒）
    window_sec: float = 5 * 60.0
    # 各スコアの重み（MetaRewardEngine 内部の raw 合成と対応）
    depth_weight: float = 0.4
    openness_weight: float = 0.3
    stability_weight: float = 0.3
    negativity_weight: float = -0.5


# ============================================================
# PersonaOS 全体設定
# ============================================================


@dataclass
class PersonaOSConfig:
    """
    完全版 PersonaOS のグローバル設定束ね。
    sigmaris_persona_core の各モジュールがこれを参照する。
    """

    silence: SilenceConfig = field(default_factory=SilenceConfig)
    contradiction: ContradictionConfig = field(default_factory=ContradictionConfig)
    value_drift: ValueDriftConfig = field(default_factory=ValueDriftConfig)
    intuition: IntuitionConfig = field(default_factory=IntuitionConfig)
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    state: StateMachineConfig = field(default_factory=StateMachineConfig)
    emotion: EmotionConfig = field(default_factory=EmotionConfig)
    meta_reward: MetaRewardConfig = field(default_factory=MetaRewardConfig)