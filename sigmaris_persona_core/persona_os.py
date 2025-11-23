# sigmaris_persona_core/persona_os.py
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Literal

from .types import (
  Message,
  TraitVector,
  PersonaContext,
  PersonaDecision,
  RewardSignal,
  MemoryEntry
)
from .config import PersonaOSConfig
from .state_machine import StateMachine
from .persona_modules import (
  ContradictionManager,
  SilenceManager,
  IntuitionEngine,
  ValueDriftEngine,
  MemoryIntegrator,
  IdentityContinuityEngine,
  MetaRewardEngine,
  EmotionCore,
  SnapshotBuilder,
)


DepthPref = Literal["shallow", "normal", "deep"]


@dataclass
class PersonaOS:
  """
  Sigmaris Persona Core 完全版の「最小稼働ユニット」。
  - LLM本体はここでは持たず、
    「どう応答するかの方針（Decision）」を返す。
  """
  config: PersonaOSConfig
  traits: TraitVector = field(
    default_factory=lambda: TraitVector(calm=0.5, empathy=0.5, curiosity=0.5)
  )

  # 内部モジュール
  state_machine: StateMachine = field(init=False)
  contradiction: ContradictionManager = field(init=False)
  silence: SilenceManager = field(init=False)
  intuition: IntuitionEngine = field(init=False)
  value_drift: ValueDriftEngine = field(init=False)
  memory: MemoryIntegrator = field(init=False)
  identity: IdentityContinuityEngine = field(init=False)
  meta_reward: MetaRewardEngine = field(init=False)
  emotion: EmotionCore = field(init=False)
  snapshot_builder: SnapshotBuilder = field(init=False)

  # ローカル履歴
  messages: List[Message] = field(default_factory=list)

  def __post_init__(self) -> None:
    self.state_machine = StateMachine(self.config.state)
    self.contradiction = ContradictionManager()
    self.silence = SilenceManager(self.config.silence)
    self.intuition = IntuitionEngine(self.config.intuition)
    self.value_drift = ValueDriftEngine(self.config.value_drift)
    self.memory = MemoryIntegrator(self.config.memory)
    self.identity = IdentityContinuityEngine()
    self.meta_reward = MetaRewardEngine()
    self.emotion = EmotionCore(self.config.emotion)
    self.snapshot_builder = SnapshotBuilder()

  # ====== パブリックAPI ======

  def process(
    self,
    *,
    incoming: Message,
    context: PersonaContext,
    depth_pref: DepthPref = "normal",
    safety_flagged: bool = False,
    abstraction_score: float = 0.0,
    loop_suspect_score: float = 0.0,
  ) -> PersonaDecision:
    """
    UI / sigmaris-core 側から呼び出される1ステップ処理。
    - incoming: 今回のユーザ or assistant メッセージ
    - context: ユーザ・セッション情報
    - depth_pref: ユーザが望んでいる深さ（推定値）
    - safety_flagged: 既存 SafetyLayer が危険とみなしたか
    """
    self.messages.append(incoming)

    # --- 1. ローカルモジュールへ feed ---
    self.contradiction.feed(incoming)
    self.identity.update(incoming)
    self.meta_reward.feed(incoming)

    # MemoryEntry はここでは抽象的に一つ作って渡すだけ
    self.memory.feed(
      MemoryEntry(
        ts=incoming.timestamp,
        kind="short",
        content=incoming.content,
        meta={"role": incoming.role},
      )
    )

    # --- 2. 矛盾検出 ---
    contradiction_info = self.contradiction.detect(incoming)
    contradiction_flags = contradiction_info["flags"]
    contradiction_note = contradiction_info["note"]

    # --- 3. 疑似直観 判定 ---
    intuition_info = self.intuition.infer(self.messages)

    # --- 4. 主体的沈黙 判定 ---
    user_insists = "教えて" in incoming.content or "どう思う" in incoming.content
    silence_info = self.silence.decide(
      abstraction_score=abstraction_score,
      loop_suspect_score=loop_suspect_score,
      user_insists=user_insists,
    )

    # --- 5. 状態遷移 ---
    state = self.state_machine.step(
      user_requested_depth=depth_pref,
      safety_flagged=safety_flagged,
      reflection_candidate=(intuition_info["allow"] and depth_pref == "deep"),
      introspection_candidate=(not intuition_info["allow"] and depth_pref == "deep"),
    )

    # --- 6. メタ報酬・Value Drift ---
    reward = self.meta_reward.compute()
    new_traits = self.value_drift.step(self.traits, reward)
    self.traits = new_traits

    # --- 7. 感情レイヤでトーン・サンプリングを決定 ---
    emo = self.emotion.decide_tone_and_sampling(self.traits)

    # --- 8. Identity Continuity の anchor 取得 ---
    identity_hint = self.identity.get_hint()

    # --- 9. flags / debug 構築 ---
    flags: Dict[str, bool] = {
      "safety_flagged": safety_flagged,
      "silence": silence_info["silence"],
      "contradiction": contradiction_flags.get("contradiction", False),
      "intuition_allow": intuition_info["allow"],
    }

    snapshot = self.snapshot_builder.build(
      state=state,
      traits=self.traits,
      flags=flags,
      reward=reward,
    )

    debug: Dict[str, Any] = {
      "state": state,
      "silence_reason": silence_info["reason"],
      "intuition_reason": intuition_info["reason"],
      "contradiction_note": contradiction_note,
      "identity_hint": identity_hint,
      "snapshot": snapshot,
      "context": {
        "user_id": context.user_id,
        "session_id": context.session_id,
        "client": context.client,
      },
    }

    # --- 10. PersonaDecision を返す ---
    allow_reply = not silence_info["silence"] and not safety_flagged

    decision = PersonaDecision(
      allow_reply=allow_reply,
      preferred_state=state,
      tone=emo["tone"],
      temperature=emo["temperature"],
      top_p=emo["top_p"],
      need_reflection=(state == "reflect"),
      need_introspection=(state == "introspect"),
      apply_contradiction_note=flags["contradiction"],
      apply_identity_anchor=identity_hint is not None,
      updated_traits=self.traits,
      reward=reward,
      debug=debug,
    )

    return decision