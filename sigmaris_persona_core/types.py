# sigmaris_persona_core/types.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Literal, Any
import time

# ============================================================
# 基本ロール
# ============================================================

Role = Literal["user", "assistant", "system", "system_user", "meta"]


@dataclass
class Message:
    """
    PersonaOS / AEI コア間でやり取りするメッセージの最小単位。
    """
    role: Role
    content: str
    timestamp: float = field(default_factory=lambda: time.time())
    tags: List[str] = field(default_factory=list)


# ============================================================
# トレイト / コンテキスト
# ============================================================

@dataclass
class TraitVector:
    """
    人格の基本3軸（0.0〜1.0）。
    """
    calm: float
    empathy: float
    curiosity: float


@dataclass
class PersonaContext:
    """
    PersonaOS に渡される外部メタ情報。
    """
    user_id: str
    session_id: str
    locale: str = "ja-JP"
    client: str = "sigmaris-os"
    extra: Dict[str, Any] = field(default_factory=dict)


# ============================================================
# Memory / Reward
# ============================================================

@dataclass
class MemoryEntry:
    """
    PersonaOS 内部で扱うメモリエントリ。
    """
    ts: float
    kind: Literal["short", "mid", "long"]
    content: str
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass(init=False)
class RewardSignal:
    """
    PersonaOS 完全版のメタ報酬信号。

    MetaRewardEngine / ValueDriftEngine / PersonaOS 全体で共通利用する形。

    基本仕様（新）:
      - value: float                      — 報酬スカラー（-1.0〜+1.0 を想定）
      - trait_reward: Optional[dict|TraitVector]
          軸ごとの報酬（使わなければ None）
      - reason: str                       — なぜこの報酬が発生したか（タグ）
      - meta: dict                        — AEI 側の生データや補足情報
          - とくに meta["trait_reward"] に dict を入れてもよい（ValueDrift 互換）
      - detail: dict                      — ヒューリスティック内訳など UI 可視化用

    互換性:
      - 旧コードの `RewardSignal(global_reward=...)` も受け付ける。
      - プロパティ `global_reward` は `value` のエイリアス。
    """

    # 実フィールド（dataclass 用）
    value: float
    trait_reward: Optional[Dict[str, float] | TraitVector] = None
    reason: str = ""
    meta: Dict[str, Any] = field(default_factory=dict)
    detail: Dict[str, Any] = field(default_factory=dict)

    def __init__(
        self,
        value: Optional[float] = None,
        *,
        global_reward: Optional[float] = None,
        trait_reward: Optional[Dict[str, float] | TraitVector] = None,
        reason: str = "",
        meta: Optional[Dict[str, Any]] = None,
        detail: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        新旧両方の呼び出しに対応するコンストラクタ。

        OK:
          RewardSignal(value=0.8, reason="meta_reward")
          RewardSignal(global_reward=0.8, reason="meta_reward")
        """
        # value / global_reward のマージ
        if value is None and global_reward is None:
            v = 0.0
        elif value is not None:
            v = float(value)
        else:
            v = float(global_reward)

        object.__setattr__(self, "value", v)
        object.__setattr__(self, "trait_reward", trait_reward)
        object.__setattr__(self, "reason", reason)
        object.__setattr__(self, "meta", meta or {})
        object.__setattr__(self, "detail", detail or {})

    # 互換用プロパティ（旧コードが global_reward を参照しても動く）
    @property
    def global_reward(self) -> float:
        return self.value

    @global_reward.setter
    def global_reward(self, v: float) -> None:
        object.__setattr__(self, "value", float(v))


# ============================================================
# Snapshot / Decision
# ============================================================

@dataclass
class PersonaStateSnapshot:
    """
    PersonaOS 内部状態のスナップショット。
    """
    state: str
    traits: TraitVector
    flags: Dict[str, bool]
    last_reward: Optional[RewardSignal] = None


@dataclass
class PersonaDecision:
    """
    PersonaOS が返す応答方針（UI / システム向け）。
    """
    allow_reply: bool
    preferred_state: str
    tone: str               # EmotionCore は str ラベルを返すため Literal ではない
    temperature: float
    top_p: float

    need_reflection: bool
    need_introspection: bool

    apply_contradiction_note: bool
    apply_identity_anchor: bool

    updated_traits: TraitVector
    reward: Optional[RewardSignal] = None

    debug: Dict[str, Any] = field(default_factory=dict)