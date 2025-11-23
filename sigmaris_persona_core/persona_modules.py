# sigmaris_persona_core/persona_modules.py
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


# ① 矛盾保持モジュール
@dataclass
class ContradictionManager:
  history: List[Message] = field(default_factory=list)

  def feed(self, message: Message) -> None:
    self.history.append(message)

  def detect(self, message: Message) -> Dict[str, Any]:
    """
    超ざっくり：
    - 「前と逆の主張っぽい」キーワードを見て簡易フラグを立てるダミー実装。
    後で本格的なセマンティック比較に差し替え前提。
    """
    content = message.content.lower()
    flags = {"contradiction": False}
    note = ""

    # 最も雑なサンプルロジック（ここは後で入れ替えOK）
    opposites = [("好き", "嫌い"), ("trust", "distrust"), ("楽しい", "つらい")]
    for past in reversed(self.history[-50:]):  # 直近50まで
      for a, b in opposites:
        if a in past.content and b in content:
          flags["contradiction"] = True
          note = f"past:「{a}」 vs now:「{b}」"
          break
      if flags["contradiction"]:
        break

    return {"flags": flags, "note": note}


# ② 主体的沈黙モジュール
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
    """
    - abstraction_score / loop_suspect_score は 0〜1 想定。
    """
    should_silence = False
    reason = ""

    if abstraction_score > self.config.max_abstraction:
      should_silence = True
      reason = "abstraction_overload"

    if loop_suspect_score > self.config.max_loop_suspect:
      should_silence = True
      reason = "loop_suspect"

    if user_insists and self.config.allow_when_user_insists:
      # ユーザーが強く要求している場合は沈黙解除方向
      should_silence = False
      reason = "user_override"

    return {"silence": should_silence, "reason": reason}


# ③ 疑似直観モジュール
@dataclass
class IntuitionEngine:
  config: IntuitionConfig

  def infer(
    self,
    messages: List[Message],
  ) -> Dict[str, Any]:
    """
    - コンテキスト量や時間幅から「直観的ジャンプ」を許すかどうか決める。
    今はまだ「許可/不許可」と「強度」だけ返す軽量版。
    """
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


# ④ Value Drift（自律的価値変動）
@dataclass
class ValueDriftEngine:
  config: ValueDriftConfig

  def step(self, traits: TraitVector, reward: Optional[RewardSignal]) -> TraitVector:
    """
    - reward が正なら現在の傾きを少し強める
    - 負なら緩やかに 0.5 方向に戻す
    """
    def approach(current: float, target: float, amount: float) -> float:
      return max(0.0, min(1.0, current + (target - current) * amount))

    # 基本的なドリフトは「0.5に戻る」方向の弱い力
    drift_step = self.config.min_step
    new_calm = approach(traits.calm, 0.5, drift_step)
    new_empathy = approach(traits.empathy, 0.5, drift_step)
    new_curiosity = approach(traits.curiosity, 0.5, drift_step)

    if reward is None:
      return TraitVector(new_calm, new_empathy, new_curiosity)

    # 報酬がある場合は、その符号に応じて微調整
    sign = 1.0 if reward.value >= 0 else -1.0
    mag = min(abs(reward.value), 1.0)
    step = self.config.min_step + (self.config.max_step - self.config.min_step) * mag

    target_calm = new_calm + sign * 0.1 * mag
    target_empathy = new_empathy + sign * 0.1 * mag
    target_curiosity = new_curiosity + sign * 0.1 * mag

    return TraitVector(
      approach(new_calm, target_calm, step),
      approach(new_empathy, target_empathy, step),
      approach(new_curiosity, target_curiosity, step),
    )


# ⑤ 長期記憶統合モジュール
@dataclass
class MemoryIntegrator:
  config: MemoryConfig
  buffer: List[MemoryEntry] = field(default_factory=list)

  def feed(self, entry: MemoryEntry) -> None:
    self.buffer.append(entry)

  def stratify(self, now: Optional[float] = None) -> Dict[str, List[MemoryEntry]]:
    """
    - 現在の buffer を short/mid/long に分けるだけの軽量版。
    - 実際の persona-db とは別に、「どの層に置くべきか」の判断だけ担う方向。
    """
    now = now or time.time()
    short: List[MemoryEntry] = []
    mid: List[MemoryEntry] = []
    long: List[MemoryEntry] = []

    for e in self.buffer:
      age = now - e.ts
      if age <= self.config.short_window_sec:
        short.append(e)
      elif age <= self.config.mid_window_sec:
        mid.append(e)
      else:
        long.append(e)

    # long は本来「同種トピックの集約」が必要だが、ここでは単純に古さベースで分類
    return {"short": short, "mid": mid, "long": long}


# ⑥ Identity Continuity（連続性）モジュール
@dataclass
class IdentityContinuityEngine:
  """
  - 「前に話していた○○の件」を anchor として扱うための軽量実装。
  """
  anchors: List[str] = field(default_factory=list)

  def update(self, message: Message) -> None:
    # 超簡易な anchor 抽出：引用っぽい部分だけ拾う
    if "件" in message.content or "前に" in message.content:
      self.anchors.append(message.content[:40])

  def get_hint(self) -> Optional[str]:
    return self.anchors[-1] if self.anchors else None


# ⑦ メタ報酬モジュール
@dataclass
class MetaRewardEngine:
  """
  - 今は User 側からのフィードバックがない前提なので、
    「安定して深度のある対話が続いているか」を簡易報酬にする。
  """
  window: List[Message] = field(default_factory=list)

  def feed(self, message: Message) -> None:
    self.window.append(message)
    if len(self.window) > 20:
      self.window.pop(0)

  def compute(self) -> RewardSignal:
    length_scores = [len(m.content) for m in self.window if m.role == "user"]
    if not length_scores:
      return RewardSignal(value=0.0, reason="no_data")

    avg_len = sum(length_scores) / len(length_scores)
    # 適当に 20〜200 文字あたりを「ちょうどいい」とみなす
    if avg_len < 20:
      return RewardSignal(value=-0.3, reason="too_short")
    if avg_len > 400:
      return RewardSignal(value=-0.2, reason="too_long")

    return RewardSignal(value=0.4, reason="good_depth")


# ⑧ Emotion / Value Core
@dataclass
class EmotionCore:
  config: EmotionConfig

  def decide_tone_and_sampling(self, traits: TraitVector) -> Dict[str, Any]:
    """
    traits によって温度とトーンを決める。
    - calm 高め → 温度低め / dry〜neutral
    - curiosity 高め → 温度高め / neutral〜soft
    """
    # 温度
    base = self.config.base_temperature
    delta = (traits.curiosity - 0.5) * 0.4 - (traits.calm - 0.5) * 0.2
    temp = max(self.config.min_temperature, min(self.config.max_temperature, base + delta))

    # トーン
    if traits.calm > 0.6 and traits.empathy < 0.4:
      tone = "dry"
    elif traits.empathy > 0.6:
      tone = "soft"
    else:
      tone = "neutral"

    # top_p はそこまで動かさない
    top_p = 0.9

    return {"tone": tone, "temperature": temp, "top_p": top_p}


# ⑨ OS 調停用のスナップショット生成
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