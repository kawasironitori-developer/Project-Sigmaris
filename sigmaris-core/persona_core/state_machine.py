# sigmaris_persona_core/state_machine.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Dict, Any, Optional
import time

from .config import StateMachineConfig

"""
PersonaOS 完全版対応 StateMachine

【役割】
- PersonaOS 内部の「状態レイヤ」を管理する小さなステートマシン
- Safety / Overload / Reflect / Introspect / Intuition / Identity Anchor を統合
- depth_pref（shallow / normal / deep）の3層モードに対応

【主なステート】
- idle             : 待機（初期状態）
- dialogue         : 通常対話
- reflect          : 反省（短期）
- introspect       : 内省（中期）
- intuition-deep   : 疑似直観による自発的 deep
- identity-anchor  : Identity Continuity 回復フェーズ
- overload-prevent : メッセージ過多による一時ブレーキ
- safety           : セーフティ優先モード
"""

StateName = Literal[
    "idle",
    "dialogue",
    "reflect",
    "introspect",
    "intuition-deep",
    "identity-anchor",
    "overload-prevent",
    "safety",
]


@dataclass
class StateMachine:
    """
    PersonaOS 内部ステートマシン v0.3（完全版）

    - StateMachineConfig と 1:1 で対応するフィールドのみ参照する
    - PersonaOS からは step() / info() / load_hint() を使用
    """

    config: StateMachineConfig

    # 現在ステート
    current: StateName = "idle"

    # 直近の発火時刻
    last_reflection_ts: float = field(default_factory=lambda: 0.0)
    last_introspection_ts: float = field(default_factory=lambda: 0.0)

    # 過負荷管理
    last_activity_ts: float = field(default_factory=time.time)
    messages_last_minute: int = 0

    # Debug用: 前ステート
    prev_state: Optional[StateName] = None

    # ============================================================
    # 負荷管理
    # ============================================================
    def _update_load(self) -> None:
        """
        直近60秒のメッセージ数をざっくりカウント。
        60秒以上空いた場合はカウンタをリセットする。
        """
        now = time.time()

        # 1分以上空いたら完全リセット
        if now - self.last_activity_ts > 60.0:
            self.messages_last_minute = 0

        self.messages_last_minute += 1
        self.last_activity_ts = now

    # ============================================================
    # Main step
    # ============================================================
    def step(
        self,
        *,
        user_requested_depth: Literal["shallow", "normal", "deep"],
        safety_flagged: bool,
        reflection_candidate: bool,
        introspection_candidate: bool,
        contradiction_flag: bool = False,
        intuition_allow: bool = False,
        identity_anchor: bool = False,
        abstraction_score: float = 0.0,
        loop_suspect_score: float = 0.0,
    ) -> StateName:
        """
        PersonaOS 完全版：状態遷移ロジック

        Parameters
        ----------
        user_requested_depth : {"shallow","normal","deep"}
            ユーザー／フロント側からの深度要求。
        safety_flagged : bool
            SafetyLayer による危険判定フラグ。
        reflection_candidate : bool
            deep 時に Reflection を走らせる候補か。
        introspection_candidate : bool
            deep 時に Introspection を走らせる候補か。
        contradiction_flag : bool, optional
            矛盾検出モジュールからのフラグ。
        intuition_allow : bool, optional
            疑似直観エンジンからの「直観で踏み込んでよい」フラグ。
        identity_anchor : bool, optional
            Identity Continuity エンジンからの「一度アンカー回復を優先したい」フラグ。
        abstraction_score : float, optional
            抽象度の高さ（将来の overthinking 判定に利用予定）。
        loop_suspect_score : float, optional
            自己ループ感の強さ（将来の沈黙トリガーに利用予定）。

        Returns
        -------
        StateName
            次の状態名。
        """

        now = time.time()
        self.prev_state = self.current
        self._update_load()

        # --------------------------------------------------------
        # 1. SafetyLayer 優先
        # --------------------------------------------------------
        if safety_flagged:
            self.current = "safety"
            return self.current

        # --------------------------------------------------------
        # 2. 過負荷制御
        # --------------------------------------------------------
        try:
            overload_limit = int(self.config.overload_limit_per_min)
        except Exception:
            overload_limit = 20  # フォールバック

        if overload_limit > 0 and self.messages_last_minute > overload_limit:
            # 一旦ブレーキ。ここでは応答自体は抑えめにする想定。
            self.current = "overload-prevent"
            return self.current

        # --------------------------------------------------------
        # 3. Identity Continuity の回復要求
        # --------------------------------------------------------
        if identity_anchor:
            # 直観や deep よりも「自己の連続性の回復」を優先
            self.current = "identity-anchor"
            return self.current

        # --------------------------------------------------------
        # 4. 直観（intuition）による自発的 deep
        # --------------------------------------------------------
        if intuition_allow:
            # 疑似直観はクールダウンをあまりかけず、
            # 「今だけ深く踏み込む価値がある」と判断された場合に使う。
            self.current = "intuition-deep"
            return self.current

        # --------------------------------------------------------
        # 5. 矛盾（contradiction）→ reflect 優先
        # --------------------------------------------------------
        try:
            reflect_cd = float(self.config.reflect_cooldown_sec)
        except Exception:
            reflect_cd = 30.0

        if contradiction_flag:
            if now - self.last_reflection_ts > reflect_cd:
                self.current = "reflect"
                self.last_reflection_ts = now
                return self.current

        # --------------------------------------------------------
        # 6. 深度要求 deep の場合
        # --------------------------------------------------------
        if user_requested_depth == "deep":
            # 6-1 Reflect（短期反省）
            if reflection_candidate and (now - self.last_reflection_ts > reflect_cd):
                self.current = "reflect"
                self.last_reflection_ts = now
                return self.current

            # 6-2 Introspect（中期内省）
            try:
                introspect_cd = float(self.config.introspect_cooldown_sec)
            except Exception:
                introspect_cd = 60.0

            if introspection_candidate and (
                now - self.last_introspection_ts > introspect_cd
            ):
                self.current = "introspect"
                self.last_introspection_ts = now
                return self.current

        # abstraction_score / loop_suspect_score は将来の拡張用に残しておく
        _ = abstraction_score
        _ = loop_suspect_score

        # --------------------------------------------------------
        # 7. shallow / normal → 通常ダイアログ
        # --------------------------------------------------------
        self.current = "dialogue"
        return self.current

    # ============================================================
    # Debug info
    # ============================================================
    def info(self) -> Dict[str, Any]:
        """
        現在の状態と負荷状況を返す（可視化・デバッグ用）。
        """
        return {
            "state": self.current,
            "previous": self.prev_state,
            "messages_last_minute": self.messages_last_minute,
            "last_reflection_ts": self.last_reflection_ts,
            "last_introspection_ts": self.last_introspection_ts,
        }

    # ============================================================
    # 追加: 軽量ロード指標（UI用）
    # ============================================================
    def load_hint(self) -> Dict[str, Any]:
        """
        フロント側で「今どれくらい負荷か」を表示するための簡易指標。
        """
        try:
            limit = float(self.config.overload_limit_per_min or 1)
        except Exception:
            limit = 1.0

        ratio = min(1.0, self.messages_last_minute / limit)

        return {
            "messages_last_minute": self.messages_last_minute,
            "overload_limit_per_min": self.config.overload_limit_per_min,
            "load_ratio": ratio,
        }