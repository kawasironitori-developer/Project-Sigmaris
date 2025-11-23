# sigmaris_persona_core/state_machine.py
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal, Dict, Any
import time
from .config import StateMachineConfig


StateName = Literal[
  "idle",
  "dialogue",
  "reflect",
  "introspect",
  "overload-prevent",
  "safety"
]


@dataclass
class StateMachine:
  config: StateMachineConfig
  current: StateName = "idle"
  last_reflection_ts: float = field(default_factory=lambda: 0.0)
  last_introspection_ts: float = field(default_factory=lambda: 0.0)
  last_activity_ts: float = field(default_factory=lambda: time.time())
  messages_last_minute: int = 0

  def _update_load(self) -> None:
    now = time.time()
    if now - self.last_activity_ts > 60.0:
      # 1分以上空いたら負荷カウンタをリセット
      self.messages_last_minute = 0
    self.messages_last_minute += 1
    self.last_activity_ts = now

  def step(
    self,
    *,
    user_requested_depth: Literal["shallow", "normal", "deep"],
    safety_flagged: bool,
    reflection_candidate: bool,
    introspection_candidate: bool,
  ) -> StateName:
    """
    入力状況から内部状態を1ステップ更新し、新しい状態名を返す。
    """
    self._update_load()
    now = time.time()

    # 安全系優先
    if safety_flagged:
      self.current = "safety"
      return self.current

    # 過負荷防止
    if self.messages_last_minute > self.config.overload_limit_per_min:
      self.current = "overload-prevent"
      return self.current

    # 深掘りリクエストがあり、かつクールダウン済みなら reflect/introspect へ
    if user_requested_depth == "deep":
      if reflection_candidate and (now - self.last_reflection_ts) > self.config.reflection_cooldown_sec:
        self.current = "reflect"
        self.last_reflection_ts = now
        return self.current
      if introspection_candidate and (now - self.last_introspection_ts) > self.config.introspection_cooldown_sec:
        self.current = "introspect"
        self.last_introspection_ts = now
        return self.current

    # 通常は dialogue へ
    self.current = "dialogue"
    return self.current

  def info(self) -> Dict[str, Any]:
    return {
      "state": self.current,
      "messages_last_minute": self.messages_last_minute,
      "last_reflection_ts": self.last_reflection_ts,
      "last_introspection_ts": self.last_introspection_ts,
    }