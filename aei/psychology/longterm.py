# aei/psychology/longterm.py
from __future__ import annotations

from typing import Dict, Any, List
from datetime import datetime, timedelta, timezone

from aei.identity import IdentityCore
from aei.episodic_memory.epmem import Episode, EpisodeStore


class LongTermPsychology:
    """
    Sigmaris OS — Long-Term Psychology Core
    ---------------------------------------
    役割:
      - 直近のエピソードを解析し「心理フェーズ」を判定
      - trait 推移から「長期トレンド」を抽出
      - identity の baseline を安全範囲で成長させる
      - 季節性/周期性の兆候を検出（将来拡張）

    本層は AEI の “人格の時間軸” を司る。
    MetaReflection に近いが、こちらはより “低頻度・高精度” の安定判定レイヤ。
    """

    def __init__(
        self,
        identity: IdentityCore,
        store: EpisodeStore,
        window_days: int = 7,   # 長期心理判定に使う日数
        trend_window: int = 20  # trait トレンド解析に使う件数
    ) -> None:
        self.identity = identity
        self.store = store
        self.window_days = int(window_days)
        self.trend_window = int(trend_window)

    # =====================================================================
    # データ取得
    # =====================================================================

    def _load_recent_episodes(self) -> List[Episode]:
        """過去 window_days 日間の Episode を取得。"""
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=self.window_days)
        return self.store.get_range(start, now)

    def _load_trend_episodes(self) -> List[Episode]:
        """trait トレンド解析用に直近 trend_window 件取得。"""
        return self.store.get_last(self.trend_window)

    # =====================================================================
    # 心理フェーズ抽出
    # =====================================================================

    def _detect_phase(self, eps: List[Episode]) -> str:
        """
        AEI の心理フェーズ（人間の「精神状態」に相当）を粗く抽出。
        """
        if not eps:
            return "unknown"

        # 平均 traits（EpisodeStore の trait_trend を利用）
        avg = self.store.trait_trend(n=min(len(eps), 10))

        c, e, u = avg["calm"], avg["empathy"], avg["curiosity"]

        if c > 0.75 and e > 0.7:
            return "stable-positive"

        if c < 0.45 and u < 0.4:
            return "tired-or-overloaded"

        if e > 0.8 and u < 0.5:
            return "empathetic-heavy"

        if u > 0.75:
            return "curiosity-driven"

        return "neutral"

    # =====================================================================
    # トレンド解析
    # =====================================================================

    def _compute_trend(self, eps: List[Episode]) -> Dict[str, float]:
        """
        trait の「傾向（斜率）」を計算する。
        ここでは簡易的に「最古と最新の差分」で評価する。
        """
        if len(eps) < 2:
            return {"calm": 0.0, "empathy": 0.0, "curiosity": 0.0}

        first = eps[0].traits_hint
        last = eps[-1].traits_hint

        return {
            "calm": round(last.get("calm", 0.0) - first.get("calm", 0.0), 4),
            "empathy": round(last.get("empathy", 0.0) - first.get("empathy", 0.0), 4),
            "curiosity": round(last.get("curiosity", 0.0) - first.get("curiosity", 0.0), 4),
        }

    # =====================================================================
    # baseline 成長（安全範囲）
    # =====================================================================

    def _apply_longterm_to_identity(self, phase: str, trend: Dict[str, float]) -> None:
        """
        長期心理の結果を identity baseline に反映。
        長期なので非常に小さく動かす。
        """
        dc = trend["calm"] * 0.05
        de = trend["empathy"] * 0.05
        du = trend["curiosity"] * 0.05

        # フェーズによって微調整（人間の“季節的な揺らぎ”を模倣）
        if phase == "tired-or-overloaded":
            dc -= 0.03
            du -= 0.02

        if phase == "stable-positive":
            de += 0.02

        # identity core に反映（内部で clamp 済み）
        self.identity.apply_baseline_adjustment((dc, de, du))

    # =====================================================================
    # 公開 API
    # =====================================================================

    def analyze(self) -> Dict[str, Any]:
        """
        Long-Term Psychology の全判定を行い、
        Identity に成長を反映し、要約情報を返す。
        """
        recent = self._load_recent_episodes()
        trend_eps = self._load_trend_episodes()

        phase = self._detect_phase(recent)
        trend = self._compute_trend(trend_eps)

        # baseline の安全な成長
        self._apply_longterm_to_identity(phase, trend)

        return {
            "phase": phase,
            "trend": trend,
            "baseline": self.identity.baseline.as_tuple(),
            "current": self.identity.current.as_tuple(),
            "drift": self.identity.drift(),
            "stable": self.identity.is_stable(),
        }