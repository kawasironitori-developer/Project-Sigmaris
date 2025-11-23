from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Tuple, Optional

from .trait_vector import TraitVector


@dataclass
class IdentityState:
    """
    Sigmaris Identity の中核データ構造。

    baseline : 長期的人格の核
    current  : 現在の心的状態（短期）
    last_updated : drift計算・時間推移に使用

    このクラスは「状態と計算」
    IdentityCore が「制御・安全性」を担当する。
    """

    # ---------------------------------------------------------------
    # Python 3.13 の Mutable Default 制約に対応するため default_factory を使用
    # ---------------------------------------------------------------
    baseline: TraitVector = field(default_factory=TraitVector)
    current: TraitVector = field(default_factory=TraitVector)

    last_updated: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    # ------------------------------------------------------------------ #
    # 基本ユーティリティ
    # ------------------------------------------------------------------ #

    def drift(self) -> float:
        """baseline と current の距離（人格 drift の強さ）。"""
        return self.baseline.distance_to(self.current)

    def is_stable(self, threshold: float = 0.18) -> bool:
        """
        drift が threshold 以下なら「人格の安定性維持」と判定。
        """
        return self.drift() <= threshold

    def gently_correct(self, weight: float = 0.25) -> None:
        """
        current → baseline に漸近的に寄せる。
        """
        self.current = self.current.blend(self.baseline, weight).clamp()
        self.last_updated = datetime.now(timezone.utc)

    # ------------------------------------------------------------------ #
    # 観察値の反映（Reflection：短期）
    # ------------------------------------------------------------------ #

    def apply_observed(self, observed: TraitVector, weight: float = 0.35) -> None:
        """
        LLM 由来の観測された traits を current に反映。
        baseline は変えない（短期層）。
        """
        self.current = self.current.blend(observed, weight).clamp()
        self.last_updated = datetime.now(timezone.utc)

    # ------------------------------------------------------------------ #
    # 長期補正（Introspection / Meta-Reflection / LongTerm）
    # ------------------------------------------------------------------ #

    def adjust_baseline(self, delta: Tuple[float, float, float]) -> None:
        """
        baseline を長期的に成長させる。
        delta = (dc, de, du)
        """
        dc, de, du = delta

        self.baseline = TraitVector(
            calm=self.baseline.calm + dc,
            empathy=self.baseline.empathy + de,
            curiosity=self.baseline.curiosity + du,
        ).clamp()

        # baseline 変更後は current を少し寄せて安定化
        self.gently_correct(weight=0.15)

    # ------------------------------------------------------------------ #
    # シリアライズ / 復元
    # ------------------------------------------------------------------ #

    def as_dict(self) -> dict:
        return {
            "baseline": self.baseline.as_dict(),
            "current": self.current.as_dict(),
            "last_updated": self.last_updated.isoformat(),
        }

    @staticmethod
    def from_dict(data: dict) -> "IdentityState":
        if not data:
            return IdentityState()

        baseline = TraitVector.from_dict(data.get("baseline"))
        current = TraitVector.from_dict(data.get("current"))

        ts_raw: Optional[str] = data.get("last_updated")
        try:
            ts = datetime.fromisoformat(ts_raw) if ts_raw else datetime.now(timezone.utc)
        except Exception:
            ts = datetime.now(timezone.utc)

        return IdentityState(
            baseline=baseline,
            current=current,
            last_updated=ts,
        )