# aei/identity/trait_vector.py
from __future__ import annotations
from dataclasses import dataclass
from math import sqrt
from typing import Dict


@dataclass
class TraitVector:
    """
    AEI (Sigmaris OS) の人格ベクトル基礎。

    calm / empathy / curiosity の 3 次元。
    すべて 0.0〜1.0 に clamp される。
    """

    calm: float = 0.7
    empathy: float = 0.7
    curiosity: float = 0.7

    # ----------------------------------------------------------------------
    # 安全な clamp 系
    # ----------------------------------------------------------------------

    def clamp(self) -> "TraitVector":
        """自身を書き換える clamp（副作用あり）。"""
        self.calm = max(0.0, min(1.0, float(self.calm)))
        self.empathy = max(0.0, min(1.0, float(self.empathy)))
        self.curiosity = max(0.0, min(1.0, float(self.curiosity)))
        return self

    def clamped(self) -> "TraitVector":
        """自身を書き換えず、新しい clamp 版を返す（副作用なし）。"""
        return TraitVector(
            calm=max(0.0, min(1.0, float(self.calm))),
            empathy=max(0.0, min(1.0, float(self.empathy))),
            curiosity=max(0.0, min(1.0, float(self.curiosity))),
        )

    # ----------------------------------------------------------------------
    # 距離計算（副作用なし）
    # ----------------------------------------------------------------------

    def distance_to(self, other: "TraitVector") -> float:
        """
        二つのベクトルのユークリッド距離。
        drift 検知・過剰変化チェック用。

        ※ clamp による副作用を避けるため clamped() を使う。
        """
        a = self.clamped()
        b = other.clamped()
        return sqrt(
            (a.calm - b.calm) ** 2
            + (a.empathy - b.empathy) ** 2
            + (a.curiosity - b.curiosity) ** 2
        )

    # ----------------------------------------------------------------------
    # 現ベクトルを target へ寄せる（副作用あり）
    # ----------------------------------------------------------------------

    def blend(self, target: "TraitVector", weight: float = 0.3) -> "TraitVector":
        w = max(0.0, min(1.0, float(weight)))

        self.calm = self.calm * (1 - w) + target.calm * w
        self.empathy = self.empathy * (1 - w) + target.empathy * w
        self.curiosity = self.curiosity * (1 - w) + target.curiosity * w

        return self.clamp()

    # ----------------------------------------------------------------------
    # 新しいベクトルを返す安全版 blend（副作用なし）
    # ----------------------------------------------------------------------

    def blended(self, target: "TraitVector", weight: float = 0.3) -> "TraitVector":
        w = max(0.0, min(1.0, float(weight)))

        return TraitVector(
            calm=self.calm * (1 - w) + target.calm * w,
            empathy=self.empathy * (1 - w) + target.empathy * w,
            curiosity=self.curiosity * (1 - w) + target.curiosity * w,
        ).clamped()

    # ----------------------------------------------------------------------
    # Serialization
    # ----------------------------------------------------------------------

    def as_dict(self) -> Dict[str, float]:
        return {
            "calm": float(self.calm),
            "empathy": float(self.empathy),
            "curiosity": float(self.curiosity),
        }

    def as_tuple(self) -> tuple:
        return (float(self.calm), float(self.empathy), float(self.curiosity))

    @staticmethod
    def from_dict(data: Dict[str, float]) -> "TraitVector":
        if not data:
            return TraitVector().clamp()

        return TraitVector(
            calm=float(data.get("calm", 0.7)),
            empathy=float(data.get("empathy", 0.7)),
            curiosity=float(data.get("curiosity", 0.7)),
        ).clamp()