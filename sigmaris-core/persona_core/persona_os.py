# sigmaris_persona_core/persona_os.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Dict, Any, Literal, Optional

from .types import (
    Message,
    TraitVector,
    PersonaContext,
    PersonaDecision,
    RewardSignal,
    MemoryEntry,
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

# 🔥 Persona-DB v0.2 — Multi-User DB
from persona_db.memory_db import MemoryDB
from persona_db.growth_log import GrowthLogEntry


DepthPref = Literal["shallow", "normal", "deep"]


@dataclass
class PersonaOS:
    """
    Sigmaris PersonaOS 完全版 (core-level)

    - LLM 本体はここでは持たず、応答方針（PersonaDecision）のみを返す。
    - persona_db は user_id ごとに専用 DB を開く（v0.2）。
    - process() 内で:
        - 矛盾検出 / 主体的沈黙 / 疑似直観 / ValueDrift / Emotion を実行
        - growth_log を growth_log テーブルへ永続化
        - episodes を episodes テーブルへ永続化（＋concepts の自動更新）
    """

    config: PersonaOSConfig
    traits: TraitVector = field(
        default_factory=lambda: TraitVector(calm=0.5, empathy=0.5, curiosity=0.5)
    )

    # サブシステム
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

    # ローカルプロセス内の履歴
    messages: List[Message] = field(default_factory=list)

    # Persona-DB インスタンスキャッシュ（user_id -> MemoryDB）
    db_cache: Dict[str, MemoryDB] = field(default_factory=dict)

    def __post_init__(self) -> None:
        # ステートマシン & 基本モジュール
        self.state_machine = StateMachine(self.config.state)
        self.contradiction = ContradictionManager()
        self.silence = SilenceManager(self.config.silence)
        self.intuition = IntuitionEngine(self.config.intuition)
        self.value_drift = ValueDriftEngine(self.config.value_drift)
        self.memory = MemoryIntegrator(self.config.memory)
        self.identity = IdentityContinuityEngine()

        # MetaRewardEngine（内部で window_sec 等を扱う。ここではデフォルト構成を利用）
        self.meta_reward = MetaRewardEngine()

        # Emotion レイヤ
        self.emotion = EmotionCore(self.config.emotion)

        # SnapshotBuilder（UI / デバッグ用）
        self.snapshot_builder = SnapshotBuilder()

    # ============================================================
    # Internal utility — per-user DB
    # ============================================================

    def _db(self, user_id: Optional[str]) -> MemoryDB:
        """
        user_id ごとの DB をキャッシュして返す。
        user_id が空 or None の場合は "system" として扱う。
        """
        key = user_id or "system"
        if key not in self.db_cache:
            self.db_cache[key] = MemoryDB(user_id=key)
        return self.db_cache[key]

    # ============================================================
    # Main Entry
    # ============================================================

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
        # ローカル履歴
        self.messages.append(incoming)

        # --------------------------------------------------------
        # 0. user-specific DB を取得し、identity_events から traits を再構成
        # --------------------------------------------------------
        user_key = context.user_id or "system"

        try:
            user_db: Optional[MemoryDB] = self._db(user_key)
        except Exception:
            user_db = None

        if user_db is not None:
            try:
                latest = user_db.load_latest_traits(
                    baseline={
                        "calm": float(self.traits.calm),
                        "empathy": float(self.traits.empathy),
                        "curiosity": float(self.traits.curiosity),
                    }
                )
                self.traits = TraitVector(
                    calm=float(latest.get("calm", self.traits.calm)),
                    empathy=float(latest.get("empathy", self.traits.empathy)),
                    curiosity=float(latest.get("curiosity", self.traits.curiosity)),
                )
            except Exception:
                # DB 側の問題で人格コアを巻き込まない
                pass

        # --------------------------------------------------------
        # 1. ローカルモジュールへの feed
        # --------------------------------------------------------
        self.contradiction.feed(incoming)
        self.identity.update(incoming)
        self.meta_reward.feed(incoming)

        # MemoryIntegrator 用の短期エントリ
        self.memory.feed(
            MemoryEntry(
                ts=incoming.timestamp,
                kind="short",
                content=incoming.content,
                meta={"role": incoming.role},
            )
        )

        # --------------------------------------------------------
        # 2. episodes 永続化（＋concepts 自動更新）
        # --------------------------------------------------------
        if user_db is not None:
            try:
                # context.extra から topic_hint を拾えるなら拾う
                topic_hint = None
                extra = getattr(context, "extra", None)
                if isinstance(extra, dict):
                    topic_hint = extra.get("topic") or extra.get("topic_hint")

                # content 長から超ラフに importance を決める（0.1〜1.0）
                content_len = len(incoming.content or "")
                if content_len > 0:
                    importance = content_len / 200.0
                else:
                    importance = 0.1
                if importance < 0.1:
                    importance = 0.1
                if importance > 1.0:
                    importance = 1.0

                user_db.store_episode(
                    session_id=context.session_id,
                    role=incoming.role,
                    content=incoming.content,
                    topic_hint=topic_hint,
                    emotion_hint=None,  # v0.2 では未使用
                    importance=importance,
                    meta={
                        "client": context.client,
                        "depth_pref": depth_pref,
                    },
                )
            except Exception:
                # DB 側の問題で人格コアを巻き込まない
                pass

        # --------------------------------------------------------
        # 3. 矛盾検出
        # --------------------------------------------------------
        contradiction_info = self.contradiction.detect(incoming)
        contradiction_flags = contradiction_info.get("flags", {})
        contradiction_note = contradiction_info.get("note")

        # --------------------------------------------------------
        # 4. 疑似直観 判定
        # --------------------------------------------------------
        intuition_info = self.intuition.infer(self.messages)

        # --------------------------------------------------------
        # 5. 主体的沈黙 判定
        # --------------------------------------------------------
        content_str = incoming.content or ""
        user_insists = ("教えて" in content_str) or ("どう思う" in content_str)
        silence_info = self.silence.decide(
            abstraction_score=abstraction_score,
            loop_suspect_score=loop_spect_score,
            user_insists=user_insists,
        )

        # --------------------------------------------------------
        # 6. Identity Continuity ヒント
        # --------------------------------------------------------
        identity_hint = self.identity.get_hint()
        identity_anchor = identity_hint is not None

        # --------------------------------------------------------
        # 7. 状態遷移
        # --------------------------------------------------------
        intuition_allow = bool(intuition_info.get("allow", False))
        contradiction_flag = bool(contradiction_flags.get("contradiction", False))

        state = self.state_machine.step(
            user_requested_depth=depth_pref,
            safety_flagged=safety_flagged,
            reflection_candidate=(intuition_allow and depth_pref == "deep"),
            introspection_candidate=((not intuition_allow) and depth_pref == "deep"),
            contradiction_flag=contradiction_flag,
            intuition_allow=intuition_allow,
            identity_anchor=identity_anchor,
            abstraction_score=abstraction_score,
            loop_suspect_score=loop_suspect_score,
        )

        # --------------------------------------------------------
        # 8. メタ報酬 & Value Drift
        # --------------------------------------------------------
        raw_reward = self.meta_reward.compute()

        if isinstance(raw_reward, RewardSignal):
            reward: RewardSignal = raw_reward
        elif isinstance(raw_reward, dict):
            reward = RewardSignal(
                global_reward=raw_reward.get(
                    "global_reward", raw_reward.get("value", 0.0)
                ),
                reason=str(raw_reward.get("reason", "")),
                meta=raw_reward,
                detail=raw_reward.get("detail", {}),
            )
        else:
            # 予期しない型の場合は安全側に倒す
            reward = RewardSignal(value=0.0, reason="unsupported_reward_type")

        prev_traits = TraitVector(
            calm=self.traits.calm,
            empathy=self.traits.empathy,
            curiosity=self.traits.curiosity,
        )

        new_traits = self.value_drift.step(self.traits, reward)
        self.traits = new_traits

        # --------------------------------------------------------
        # 9. Emotion レイヤ
        # --------------------------------------------------------
        emo = self.emotion.decide_tone_and_sampling(self.traits)

        # --------------------------------------------------------
        # 10. Snapshot / Debug 構築
        # --------------------------------------------------------
        flags: Dict[str, bool] = {
            "safety_flagged": safety_flagged,
            "silence": bool(silence_info.get("silence")),
            "contradiction": contradiction_flag,
            "intuition_allow": intuition_allow,
            "identity_anchor": identity_anchor,
        }

        snapshot = self.snapshot_builder.build(
            state=state,
            traits=self.traits,
            flags=flags,
            reward=reward,
        )

        debug: Dict[str, Any] = {
            "state": state,
            "silence_reason": silence_info.get("reason"),
            "intuition_reason": intuition_info.get("reason"),
            "contradiction_note": contradiction_note,
            "identity_hint": identity_hint,
            "snapshot": snapshot,
            "context": {
                "user_id": context.user_id,
                "session_id": context.session_id,
                "client": context.client,
            },
        }

        # --------------------------------------------------------
        # 11. Persona-DB: growth_log 永続化 (v0.2)
        # --------------------------------------------------------
        if user_db is not None:
            try:
                user_db.store_growth_log(
                    GrowthLogEntry(
                        user_id=user_key,
                        session_id=context.session_id,
                        last_message=incoming.content,
                        traits_before=prev_traits,
                        traits_after=new_traits,
                        reward=reward,
                        state=state,
                        flags=flags,
                    )
                )
            except Exception:
                # DB 例外は握りつぶす
                pass

        # --------------------------------------------------------
        # 12. PersonaDecision を返す
        # --------------------------------------------------------
        allow_reply = (not bool(silence_info.get("silence"))) and (not safety_flagged)

        return PersonaDecision(
            allow_reply=allow_reply,
            preferred_state=state,
            tone=emo["tone"],
            temperature=float(emo["temperature"]),
            top_p=float(emo["top_p"]),
            need_reflection=(state == "reflect"),
            need_introspection=(state == "introspect"),
            apply_contradiction_note=flags["contradiction"],
            apply_identity_anchor=identity_anchor,
            updated_traits=self.traits,
            reward=reward,
            debug=debug,
        )

    # ============================================================
    # AEI BRIDGE — Reflection / Reward / Emotion / Value
    # ============================================================

    def feed_reflection(
        self,
        msg: Message,
        summary: Dict[str, Any],
        context: PersonaContext,
    ) -> None:
        """
        AEI Core の Reflection 結果を PersonaOS に渡すフック。
        - msg: 元のユーザ発話
        - summary: AEI 側の要約/分析
        """
        self.messages.append(msg)
        self.identity.update(msg)

        # MemoryIntegrator の mid-layer に積む
        self.memory.feed(
            MemoryEntry(
                ts=msg.timestamp,
                kind="mid",
                content=summary.get("summary", msg.content),
                meta={
                    "role": msg.role,
                    "raw_text": msg.content,
                    "summary": summary,
                },
            )
        )
        # v0.2 ではここでは episodes への追記は行わない（生ログは process 側で処理）

    def feed_reward(self, reward_res: Dict[str, Any], user_id: str = "system") -> None:
        """
        AEI Core の RewardCore 出力を PersonaOS に渡す。
        identity_events に kind='reward' として記録。
        """
        try:
            db = self._db(user_id)
            db.store_identity_event(
                kind="reward",
                reward=float(
                    reward_res.get(
                        "global_reward",
                        reward_res.get("value", 0.0),
                    )
                ),
                meta=reward_res,
            )
        except Exception:
            pass

    def feed_emotion(
        self,
        emotion_res: Dict[str, Any],
        user_id: str = "system",
    ) -> None:
        """
        AEI Core の EmotionCore 出力を PersonaOS に渡す。
        trait_shift をそのまま identity_events に delta_* として積む。
        """
        try:
            db = self._db(user_id)
            shift = emotion_res.get("trait_shift", {}) or {}
            db.store_identity_event(
                kind="emotion",
                delta_calm=float(shift.get("calm", 0.0)),
                delta_empathy=float(shift.get("empathy", 0.0)),
                delta_curiosity=float(shift.get("curiosity", 0.0)),
                meta=emotion_res,
            )
        except Exception:
            pass

    def feed_value(self, value_res: Dict[str, Any], user_id: str = "system") -> None:
        """
        AEI Core の ValueCore 出力を PersonaOS に渡す。
        importance 配列を concepts に投げ込む。
        """
        try:
            db = self._db(user_id)
            weight = float(value_res.get("weight", 0.5))
            for label in value_res.get("importance", []):
                db.store_concept(
                    label=label,
                    score=weight,
                    occurrences=1,
                    meta=value_res,
                )
        except Exception:
            pass

    # ============================================================
    # shutdown hook
    # ============================================================

    def close_all(self) -> None:
        """
        プロセス終了時などに DB コネクションをすべて閉じるためのフック。
        """
        for db in self.db_cache.values():
            try:
                db.close()
            except Exception:
                continue