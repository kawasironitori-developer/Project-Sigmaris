from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import math
import time

from .types import (
    Message,
    TraitVector,
    MemoryEntry,
    RewardSignal,
    PersonaStateSnapshot,
)
from .config import (
    SilenceConfig,
    ValueDriftConfig,
    IntuitionConfig,
    MemoryConfig,
    EmotionConfig,
)

# ============================================================
# ① 矛盾保持モジュール（軽量版）
# ============================================================

@dataclass
class ContradictionManager:
    history: List[Message] = field(default_factory=list)

    def feed(self, message: Message) -> None:
        self.history.append(message)

    def detect(self, message: Message) -> Dict[str, Any]:
        """
        - 最小限の「簡易矛盾検出」
        - 後で Embedding ＆ semantic conflict 判定に差し替える前提
        """
        content = message.content.lower()
        flags = {"contradiction": False}
        note = ""

        opposites = [
            ("好き", "嫌い"),
            ("trust", "distrust"),
            ("楽しい", "つらい")
        ]

        for past in reversed(self.history[-50:]):
            for a, b in opposites:
                if a in past.content and b in content:
                    flags["contradiction"] = True
                    note = f"past:「{a}」 vs now:「{b}」"
                    break
            if flags["contradiction"]:
                break

        return {"flags": flags, "note": note}


# ============================================================
# ② 主体的沈黙モジュール
# ============================================================

@dataclass
class SilenceManager:
    config: SilenceConfig

    def decide(
        self,
        *,
        abstraction_score: float,
        loop_suspect_score: float,
        user_insists: bool,
    ) -> Dict[str, Any]:

        should_silence = False
        reason = ""

        # 抽象度オーバー
        if abstraction_score > self.config.max_abstraction:
            should_silence = True
            reason = "abstraction_overload"

        # ループ疑惑
        if loop_suspect_score > self.config.max_loop_suspect:
            should_silence = True
            reason = "loop_suspect"

        # ユーザーが強く求めている場合は解除
        if user_insists and self.config.allow_when_user_insists:
            should_silence = False
            reason = "user_override"

        return {"silence": should_silence, "reason": reason}


# ============================================================
# ③ 疑似直観エンジン
# ============================================================

@dataclass
class IntuitionEngine:
    config: IntuitionConfig

    def infer(self, messages: List[Message]) -> Dict[str, Any]:

        if len(messages) < self.config.min_context_size:
            return {"allow": False, "strength": 0.0, "reason": "not_enough_context"}

        times = [m.timestamp for m in messages]
        if not times:
            return {"allow": False, "strength": 0.0, "reason": "no_time_info"}

        span = max(times) - min(times)
        if span < self.config.min_time_span_sec:
            return {"allow": False, "strength": 0.0, "reason": "span_too_short"}

        return {
            "allow": True,
            "strength": self.config.strength,
            "reason": "ok",
        }


# ============================================================
# ④ Value Drift（自律価値変動）
# ============================================================

@dataclass
class ValueDriftEngine:
    config: ValueDriftConfig

    def step(self, traits: TraitVector, reward: Optional[RewardSignal]) -> TraitVector:

        def approach(cur: float, target: float, amount: float) -> float:
            return max(0.0, min(1.0, cur + (target - cur) * amount))

        # 通常ドリフト：常に 0.5 に引き寄せる弱い力
        drift_step = self.config.min_step
        calm = approach(traits.calm, 0.5, drift_step)
        emp = approach(traits.empathy, 0.5, drift_step)
        cur = approach(traits.curiosity, 0.5, drift_step)

        if reward is None:
            return TraitVector(calm, emp, cur)

        # 報酬の符号による drift 振幅
        sign = 1 if reward.value >= 0 else -1
        mag = min(abs(reward.value), 1.0)

        step = drift_step + (self.config.max_step - drift_step) * mag

        target_calm = calm + sign * 0.1 * mag
        target_emp = emp + sign * 0.1 * mag
        target_cur = cur + sign * 0.1 * mag

        return TraitVector(
            approach(calm, target_calm, step),
            approach(emp, target_emp, step),
            approach(cur, target_cur, step),
        )


# ============================================================
# ⑤ MemoryIntegrator（軽量層）
# ============================================================

@dataclass
class MemoryIntegrator:
    config: MemoryConfig
    buffer: List[MemoryEntry] = field(default_factory=list)

    def feed(self, entry: MemoryEntry) -> None:
        self.buffer.append(entry)

    def stratify(self, now: Optional[float] = None) -> Dict[str, List[MemoryEntry]]:
        now = now or time.time()

        short, mid, long = [], [], []

        for e in self.buffer:
            age = now - e.ts
            if age <= self.config.short_window_sec:
                short.append(e)
            elif age <= self.config.mid_window_sec:
                mid.append(e)
            else:
                long.append(e)

        return {"short": short, "mid": mid, "long": long}


# ============================================================
# ⑥ Identity Continuity Engine（完全版）
# ============================================================

@dataclass
class IdentityContinuityEngine:
    """
    PersonaOS 完全版の Identity Continuity モジュール。
    - 「話題の連続性」「過去のトピック」「参照すべき anchor」などを扱う
    - persona-db を利用して長期的な anchor を保持する
    """

    anchors: List[str] = field(default_factory=list)

    def update(self, msg: Message) -> None:
        """
        anchor 候補の抽出（軽量版）
        """
        text = msg.content
        if any(key in text for key in ["件", "前に", "続き", "前回", "前の話"]):
            self.anchors.append(text[:40])

    def get_hint(self) -> Optional[str]:
        if not self.anchors:
            return None
        return self.anchors[-1]


# ============================================================
# ⑦ Meta Reward Engine（完全版）
# ============================================================

@dataclass
class MetaRewardEngine:
    """
    「深度」「安定性」「流れの連続性」を報酬信号として返す簡易モデル。
    PersonaOS 完全版では、
    - RewardCore（sigmaris-core）とは独立した “会話構造” 報酬
    """
    window: List[Message] = field(default_factory=list)

    def feed(self, message: Message) -> None:
        self.window.append(message)
        if len(self.window) > 30:
            self.window.pop(0)

    def compute(self) -> RewardSignal:

        # ユーザ発話だけ見る
        user_msgs = [m for m in self.window if m.role == "user"]
        if not user_msgs:
            return RewardSignal(value=0.0, reason="no_data")

        lengths = [len(m.content) for m in user_msgs]
        avg_len = sum(lengths) / len(lengths)

        # depth-based reward
        if avg_len < 20:
            return RewardSignal(value=-0.3, reason="too_short")
        if avg_len > 400:
            return RewardSignal(value=-0.2, reason="too_long")

        # ここは “ちょうどよい深さ”
        return RewardSignal(value=0.4, reason="good_depth")


# ============================================================
# ⑧ Emotion Core
# ============================================================

@dataclass
class EmotionCore:
    config: EmotionConfig

    def decide_tone_and_sampling(self, traits: TraitVector) -> Dict[str, Any]:

        base = self.config.base_temperature

        delta = (
            (traits.curiosity - 0.5) * 0.35 -
            (traits.calm - 0.5) * 0.25
        )

        temp = max(
            self.config.min_temperature,
            min(self.config.max_temperature, base + delta),
        )

        # tone decision
        if traits.empathy > 0.65:
            tone = "soft"
        elif traits.calm > 0.6 and traits.empathy < 0.45:
            tone = "dry"
        else:
            tone = "neutral"

        return {
            "tone": tone,
            "temperature": temp,
            "top_p": 0.9,
        }


# ============================================================
# ⑨ Snapshot Builder（OS 調停）
# ============================================================

@dataclass
class SnapshotBuilder:
    def build(
        self,
        *,
        state: str,
        traits: TraitVector,
        flags: Dict[str, bool],
        reward: Optional[RewardSignal],
    ) -> PersonaStateSnapshot:

        return PersonaStateSnapshot(
            state=state,
            traits=traits,
            flags=flags,
            last_reward=reward,
        )