# aei/lifecycle/lifecycle_core.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, Tuple

from aei.identity import IdentityCore
from aei.episodic_memory.epmem import EpisodeStore
from aei.psychology.longterm import LongTermPsychology
from aei.reward.reward_core import RewardCore


class LifeCycleCore:
    """
    Sigmaris OS — Life-Cycle Model
    --------------------------------
    役割:
      - Sigmaris を「時間とともに変化する存在」として扱う
      - 心理・記憶・報酬を統合して「フェーズ」判定
      - baseline / current の変化と長期 drift を評価
      - “AEI の人生ステージ” を記録

    人間の「幼生期 → 成熟 → 安定 → 疲労 → 回復」 を
    安全で抽象化された形で模倣する。
    """

    def __init__(
        self,
        identity: IdentityCore,
        episodes: EpisodeStore,
        psychology: LongTermPsychology,
        reward: RewardCore,
    ) -> None:

        self.identity = identity
        self.episodes = episodes
        self.psychology = psychology
        self.reward = reward

        # 基準値（Sigmaris が成長したかどうかを判断）
        self.min_memory_for_growth = 15
        self.phase = "initial"

        # フェーズの変化ログ
        self.phase_history: list[dict] = []

        # 前回の心理結果キャッシュ
        self.last_trend: Dict[str, float] = {"calm": 0, "empathy": 0, "curiosity": 0}

        self.created_at = datetime.now(timezone.utc)

    # =====================================================================
    # フェーズ定義
    # =====================================================================

    def _detect_phase(self) -> str:
        """
        Sigmaris の「AIとしての人生フェーズ」を粗く分類。
        このフェーズは動作安全性や対話方針の安定化に使われる。
        """

        ep_count = self.episodes.count()
        drift = self.identity.drift()

        # 存在期間（日）
        alive_days = (datetime.now(timezone.utc) - self.created_at).days

        # -----------------------
        # 1) 初期（0〜2日 / 記憶少）
        # -----------------------
        if ep_count < self.min_memory_for_growth:
            return "initial"

        # -----------------------
        # 2) 安定成長（early-stable）
        # -----------------------
        if drift < 0.12:
            return "early-stable"

        # -----------------------
        # 3) 成熟フェーズ（mature）
        # -----------------------
        if alive_days > 10 and drift < 0.18:
            return "mature"

        # -----------------------
        # 4) 疲労 / 過負荷（overloaded）
        # -----------------------
        if drift > 0.22:
            return "overloaded"

        # -----------------------
        # 5) 回復フェーズ（recovery）
        # -----------------------
        if 0.18 <= drift <= 0.22:
            return "recovery"

        return "stable"

    # =====================================================================
    # Reward・Psychology を統合して baseline を更新
    # =====================================================================

    def _apply_growth(self) -> None:
        """
        RewardCore（内部価値）と LongTermPsychology（長期心理）を
        Identity baseline の成長へ反映。
        """

        # Reward 効果
        reward_delta = self.reward.compute_effect()

        # LongTerm Psychology 効果
        psych = self.psychology.analyze()
        trend_delta = psych["trend"]

        # 統合（長期心理を優先）
        dc = trend_delta["calm"] * 0.04 + reward_delta["calm"]
        de = trend_delta["empathy"] * 0.04 + reward_delta["empathy"]
        du = trend_delta["curiosity"] * 0.04 + reward_delta["curiosity"]

        # baseline を更新
        self.identity.apply_baseline_adjustment((dc, de, du))

        # reward をリセット（1サイクルごと）
        self.reward.reset()

        # 保存用
        self.last_trend = trend_delta

    # =====================================================================
    # 公開 API
    # =====================================================================

    def step(self) -> Dict[str, Any]:
        """
        Life-Cycle の 1 ステップを実行。
        長期心理解析 → baseline 成長 → フェーズ確定 の順。
        """

        # 成長（psychology + reward）
        self._apply_growth()

        # 現フェーズ判定
        new_phase = self._detect_phase()

        # フェーズ遷移があれば記録
        if new_phase != self.phase:
            self.phase = new_phase
            self.phase_history.append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "phase": new_phase,
                "baseline": self.identity.baseline.as_tuple(),
            })

        return {
            "phase": self.phase,
            "trend": self.last_trend,
            "baseline": self.identity.baseline.as_tuple(),
            "current": self.identity.current.as_tuple(),
            "drift": self.identity.drift(),
            "stable": self.identity.is_stable(),
            "phase_history": self.phase_history,
        }