# sigmaris_persona_core/types.py
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Literal, Any
import time


Role = Literal["user", "assistant", "system", "meta"]


@dataclass
class Message:
  role: Role
  content: str
  timestamp: float = field(default_factory=lambda: time.time())
  tags: List[str] = field(default_factory=list)


@dataclass
class TraitVector:
  """人格の基本3軸。0.0〜1.0で扱う。"""
  calm: float
  empathy: float
  curiosity: float


@dataclass
class PersonaContext:
  """UI / コア側から渡されるメタ情報。"""
  user_id: str
  session_id: str
  locale: str = "ja-JP"
  client: str = "sigmaris-os"
  extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class MemoryEntry:
  """persona-db 側に保存される1レコードの抽象形。"""
  ts: float
  kind: Literal["short", "mid", "long"]
  content: str
  meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RewardSignal:
  """メタ報酬。+ は良い方向、- は悪い方向。"""
  value: float
  reason: str
  meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PersonaStateSnapshot:
  """デバッグ・可視化用のスナップ。"""
  state: str
  traits: TraitVector
  flags: Dict[str, bool]
  last_reward: Optional[RewardSignal] = None


@dataclass
class PersonaDecision:
  """
  PersonaOS が sigmaris-core / UI 側に返す「意思決定」。
  ここには「どう応答するか」に関する指針だけを持たせる。
  """
  allow_reply: bool
  preferred_state: str
  tone: Literal["soft", "neutral", "dry"]
  temperature: float
  top_p: float
  need_reflection: bool
  need_introspection: bool
  apply_contradiction_note: bool
  apply_identity_anchor: bool
  updated_traits: TraitVector
  reward: Optional[RewardSignal] = None
  debug: Dict[str, Any] = field(default_factory=dict)