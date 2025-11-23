from __future__ import annotations

from typing import Optional, Tuple, Union

from .trait_vector import TraitVector
from .identity_state import IdentityState


class IdentityCore:
    """
    Sigmaris OS — Identity Core (人格核)
    current（短期人格）と baseline（長期人格）の2層構造を扱う。
    """

    def __init__(self, state: Optional[IdentityState] = None) -> None:
        self.state: IdentityState = state if state else IdentityState()

        self.max_delta_baseline: float = 0.10
        self.max_delta_current: float = 0.40
        self.stability_threshold: float = 0.18

    # ------------------------------------------------------------------ #
    # 基本アクセス
    # ------------------------------------------------------------------ #

    @property
    def baseline(self) -> TraitVector:
        return self.state.baseline

    @baseline.setter
    def baseline(self, vec: TraitVector) -> None:
        self.state.baseline = vec.clamp()

    @property
    def current(self) -> TraitVector:
        return self.state.current

    @current.setter
    def current(self, vec: TraitVector) -> None:
        self.state.current = vec.clamp()

    # ------------------------------------------------------------------ #
    # 安定性
    # ------------------------------------------------------------------ #

    def drift(self) -> float:
        return self.state.drift()

    def is_stable(self) -> bool:
        return self.state.is_stable(self.stability_threshold)

    def gently_correct(self, weight: float = 0.25) -> None:
        self.state.gently_correct(weight)

    # ------------------------------------------------------------------ #
    # Next.js StateMachine → Python /sync から traits を受け取る
    # ------------------------------------------------------------------ #

    def update_traits(self, calm=None, empathy=None, curiosity=None) -> None:
        """
        Web版 Sigmaris OS の StateMachine が計算した traits を
        Python 側の current に反映するための統合メソッド。

        baseline は変更しない。（長期成長は ValueCore 側が担当）
        """

        # 現 current を取得
        curr = self.current

        # 値が None の場合は現状維持
        new_vec = TraitVector(
            calm=float(calm) if calm is not None else curr.calm,
            empathy=float(empathy) if empathy is not None else curr.empathy,
            curiosity=float(curiosity) if curiosity is not None else curr.curiosity,
        )

        # clamp + そのまま現在値として採用（即時置き換え）
        self.current = new_vec.clamp()

        # 安定性が低ければ軽い correction
        if not self.is_stable():
            self.gently_correct()

    # ------------------------------------------------------------------ #
    # 観察された traits を current へ反映
    # ------------------------------------------------------------------ #

    def apply_observed_traits(self, observed: TraitVector, weight: float = 0.35) -> None:
        diff = self.current.distance_to(observed)

        if diff > self.max_delta_current:
            ratio = self.max_delta_current / diff
            observed = self.current.blend(observed, ratio)

        self.state.apply_observed(observed, weight)

        if not self.is_stable():
            self.gently_correct()

    # ------------------------------------------------------------------ #
    # baseline 成長
    # ------------------------------------------------------------------ #

    def apply_baseline_adjustment(
        self,
        delta: Union[Tuple[float, float, float], TraitVector],
        weight: float = 1.0,
    ) -> None:
        if isinstance(delta, TraitVector):
            dc, de, du = delta.calm, delta.empathy, delta.curiosity
        else:
            dc, de, du = delta

        dc = max(-self.max_delta_baseline, min(self.max_delta_baseline, dc))
        de = max(-self.max_delta_baseline, min(self.max_delta_baseline, de))
        du = max(-self.max_delta_baseline, min(self.max_delta_baseline, du))

        base = self.state.baseline

        new_baseline = TraitVector(
            calm=base.calm + dc * weight,
            empathy=base.empathy + de * weight,
            curiosity=base.curiosity + du * weight,
        ).clamp()

        self.state.baseline = new_baseline

    # ------------------------------------------------------------------ #
    # 保存 / 復元
    # ------------------------------------------------------------------ #

    def export_state(self) -> dict:
        return self.state.as_dict()

    @staticmethod
    def load_state(data: dict) -> "IdentityCore":
        state = IdentityState.from_dict(data)
        return IdentityCore(state)

    # ------------------------------------------------------------------ #
    # デバッグ
    # ------------------------------------------------------------------ #

    def debug_summary(self) -> str:
        return (
            "[IdentityCore]\n"
            f"baseline={self.baseline.as_tuple()}\n"
            f"current={self.current.as_tuple()}\n"
            f"drift={self.drift():.4f}\n"
            f"stable={self.is_stable()}\n"
            f"last_updated={self.state.last_updated}"
        )