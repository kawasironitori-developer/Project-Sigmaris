# sigmaris-core/persona_core/types/core_types.py
# ============================================================
# Persona Core 共通型定義
#  - 完全版 Persona OS
#  - 旧 PersonaOS 互換レイヤ
# ============================================================

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, Dict, List, Optional, Literal


# ============================================================
# Persona Global State（旧 PersonaOS 用・レガシーレイヤ）
#   ※ 新しい FSM は
#     persona_core.state.global_state_machine.PersonaGlobalState を使用
# ============================================================

class PersonaState(Enum):
    IDLE = auto()
    FOCUSED = auto()
    DEEP_REFLECTION = auto()
    SAFETY_OVERRIDDEN = auto()
    OVERLOADED = auto()


# ============================================================
# Memory Pointer（完全版 Persona OS 共通型）
# ============================================================

@dataclass
class MemoryPointer:
    """
    Orchestrator / EpisodeMerger / IdentityContinuity / FSM が共有する
    「どのエピソードを参照したか」のトレース情報。

    - episode_id: EpisodeStore 内の一意ID
    - source: "episodic" / "long_term" / "scratch" など
    - score: semantic / policy ベースのスコア
    - summary: Episode.summary の短縮版（EpisodeMerger と整合）
    """
    episode_id: str
    source: str          # "episodic", "long_term", "scratch" など
    score: float
    summary: Optional[str] = None


# ============================================================
# Memory Entry（完全版 OS 用・補助構造）
# ============================================================

@dataclass
class MemoryEntry:
    """
    PersonaOS 内部で扱うメモリエントリ。

    kind:
        "short" → 直近の短期記憶
        "mid"   → 中期記憶（数分〜数時間）
        "long"  → 長期記憶（エピソードDBなど）
    """
    ts: float
    kind: Literal["short", "mid", "long"]
    content: str
    meta: Dict[str, Any] = field(default_factory=dict)


# ============================================================
# Trait Vector（完全版仕様）
# ============================================================

@dataclass
class TraitVector:
    """
    Persona が持つ安定した性格ベクトル。
    calm / empathy / curiosity の3軸。
    """
    calm: float = 0.0
    empathy: float = 0.0
    curiosity: float = 0.0

    def as_dict(self) -> Dict[str, float]:
        return {
            "calm": self.calm,
            "empathy": self.empathy,
            "curiosity": self.curiosity,
        }


# ============================================================
# Reward Signal（完全版仕様）
# ============================================================

@dataclass(init=False)
class RewardSignal:
    """
    PersonaOS 完全版のメタ報酬信号。

    - value: スカラー報酬（-1.0〜+1.0 想定）
    - trait_reward: 軸ごとの報酬（dict or TraitVector）
    - reason: ラベル（なぜこの報酬が発生したか）
    - meta / detail: AEI 側の生データや UI 向け内訳
    """
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
        # value / global_reward のマージ（互換用）
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

    @property
    def global_reward(self) -> float:
        """旧フィールド名との互換用エイリアス。"""
        return self.value

    @global_reward.setter
    def global_reward(self, v: float) -> None:
        object.__setattr__(self, "value", float(v))


# ============================================================
# Identity Hint / State Trace（旧 PersonaOS デバッグ用）
# ============================================================

@dataclass
class IdentityHint:
    """
    Identity Continuity が返す、
    「今回の応答がどのアイデンティティ軸と結びついたか」のヒント。
    （旧 PersonaOS レイヤ向け補助構造）
    """
    tags: List[str] = field(default_factory=list)
    confidence: float = 0.0
    note: Optional[str] = None


@dataclass
class StateTransitionTrace:
    """
    グローバルステートマシンが今回どう遷移したか。
    （旧 PersonaOS 用：新 FSM の PersonaGlobalState とは別レイヤ）
    """
    previous_state: PersonaState
    next_state: PersonaState
    reason: str
    conditions: Dict[str, Any] = field(default_factory=dict)


# ============================================================
# Drift Snapshot（完全版）
# ============================================================

@dataclass
class DriftSnapshot:
    """
    Value Drift / Trait Drift / Meta-Reward をまとめたスナップショット。
    """
    value_baseline: Dict[str, float] = field(default_factory=dict)
    trait_vector: TraitVector = field(default_factory=TraitVector)
    meta_reward_signal: Optional[float] = None


# ============================================================
# Persona Request → Persona OS 完全版 入口
# ============================================================

@dataclass(init=False)
class PersonaRequest:
    """
    PersonaOS に入る外部リクエストフォーマット。
    server.py → PersonaController → Persona OS 完全版。

    - server.py からは従来どおり `context=...` で渡してよい
    - 内部では `metadata` に正規化して保持する
    """
    user_id: str
    session_id: str
    message: str
    locale: str = "ja-JP"
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __init__(
        self,
        user_id: str,
        session_id: str,
        message: str,
        locale: str = "ja-JP",
        *,
        metadata: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> None:
        object.__setattr__(self, "user_id", user_id)
        object.__setattr__(self, "session_id", session_id)
        object.__setattr__(self, "message", message)
        object.__setattr__(self, "locale", locale)

        # metadata / context のどちらから来てもよいように正規化
        base: Dict[str, Any] = {}
        if metadata:
            base.update(metadata)
        if context:
            # context の方が後勝ち（server.py からの指定を優先）
            base.update(context)

        object.__setattr__(self, "metadata", base)

    @property
    def context(self) -> Dict[str, Any]:
        """
        外部からは .context でも .metadata でも同じ内容にアクセスできる。
        PersonaController / DriftEngine などは req.context を参照してよい。
        """
        return self.metadata


# ============================================================
# Persona Decision（旧 PersonaOS / UI / policy 用）
# ============================================================

@dataclass
class PersonaDecision:
    """
    PersonaOS が返す応答方針（UI / システム向け）。
    （旧 PersonaOS レイヤ用。新 PersonaController v2 とは独立）
    """
    allow_reply: bool
    preferred_state: str
    tone: str
    temperature: float
    top_p: float

    need_reflection: bool
    need_introspection: bool

    apply_contradiction_note: bool
    apply_identity_anchor: bool

    updated_traits: TraitVector
    reward: Optional[RewardSignal] = None

    debug: Dict[str, Any] = field(default_factory=dict)


# ============================================================
# Persona Debug Info（旧 PersonaOS 用）
# ============================================================

@dataclass
class PersonaDebugInfo:
    """
    PersonaOS が reasoning で生成した内部デバッグ情報。
    """
    memory_pointers: List[MemoryPointer] = field(default_factory=list)
    identity_hint: Optional[IdentityHint] = None
    state_trace: Optional[StateTransitionTrace] = None
    drift_snapshot: Optional[DriftSnapshot] = None
    raw_reasoning_notes: Dict[str, Any] = field(default_factory=dict)


# ============================================================
# Response（旧 PersonaOS → 外部）
# ============================================================

@dataclass
class PersonaResponse:
    """
    PersonaOS → external（server.py / Next.js）への最終出力。
    （新 PersonaController v2 は PersonaTurnResult を返すが、
      旧 PersonaOS 互換のために残しておく）
    """
    reply: str
    state: PersonaState = PersonaState.IDLE
    debug: Optional[PersonaDebugInfo] = None