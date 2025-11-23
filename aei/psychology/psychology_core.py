# aei/psychology/psychology_core.py
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Callable, Dict, Any, Optional, List

from aei.identity import IdentityCore, TraitVector
from aei.episodic_memory import EpisodeStore
from aei.episodic_memory.epmem import Episode

# LLM 呼び出しの型
LLMFn = Callable[[str], str]


# ============================================================
# プロンプトビルダー（f-string 不使用）
# ============================================================

def build_psychology_prompt(
    identity_snapshot: Dict[str, Any],
    metrics: Dict[str, Any],
    samples: List[Dict[str, Any]],
) -> str:
    identity_js = json.dumps(identity_snapshot, ensure_ascii=False, indent=2)
    metrics_js = json.dumps(metrics, ensure_ascii=False, indent=2)
    samples_js = json.dumps(samples, ensure_ascii=False, indent=2)

    prompt = (
        "You are the PSYCHOLOGY CORE of an AEI system named Sigmaris.\n\n"
        "Your job is to analyze the *current psychological state* of the system,\n"
        "based on:\n"
        "- Identity state (baseline/current/drift)\n"
        "- Aggregated trait metrics\n"
        "- Recent episodic summaries and emotion hints\n\n"
        "You must output ONLY JSON with the following keys:\n\n"
        "{\n"
        "  \"phase\": \"stable | overloaded | drifting | recovering | growing\",\n"
        "  \"confidence\": float (0.0 - 1.0),\n"
        "  \"factors\": [list of short strings explaining why],\n"
        "  \"identity_shift\": {\n"
        "    \"calm\": float (-0.03 to +0.03),\n"
        "    \"empathy\": float (-0.03 to +0.03),\n"
        "    \"curiosity\": float (-0.03 to +0.03)\n"
        "  }\n"
        "}\n\n"
        "The goal:\n"
        "- \"phase\" should describe the *overall psychological phase*.\n"
        "- \"identity_shift\" is a small suggestion for how to adjust the *current*\n"
        "  trait vector (not the long-term baseline).\n\n"
        "--- IDENTITY SNAPSHOT ---\n"
        + identity_js +
        "\n\n--- PSYCHOLOGY METRICS ---\n"
        + metrics_js +
        "\n\n--- RECENT EPISODE SAMPLES ---\n"
        + samples_js +
        "\n"
    )

    return prompt


# ============================================================
# PsychologyCore（心理状態コア）
# ============================================================

class PsychologyCore:
    """
    Sigmaris OS — Psychology Core

    ・EpisodeStore から traits / emotion の統計を出す
    ・IdentityCore の drift / stability と合わせて「心理フェーズ」を分類
    ・必要に応じて Identity.current を *微調整* する
      （baseline 成長は ValueCore / Reward System 側の仕事）
    """

    def __init__(
        self,
        identity_core: IdentityCore,
        episode_store: EpisodeStore,
        llm_fn: LLMFn,
        window: int = 12,      # 直近何件を見るか
        max_shift: float = 0.03,  # identity_shift の上限
    ) -> None:
        self.identity = identity_core
        self.episodes = episode_store
        self.llm_fn = llm_fn

        self.window = int(window)
        self.max_shift = float(max_shift)

        # export_state 用のキャッシュ
        self._last_phase: Optional[str] = None
        self._last_confidence: float = 0.0
        self._last_factors: List[str] = []
        self._last_updated: Optional[datetime] = None

    # --------------------------------------------------------
    # 内部ユーティリティ
    # --------------------------------------------------------

    def _clamp_shift(self, x: float) -> float:
        m = self.max_shift
        return max(-m, min(m, x))

    def _compute_metrics(self) -> Dict[str, Any]:
        """
        EpisodeStore から純粋に数値情報を集計する層。
        LLM には依存しない。
        """
        eps = self.episodes.get_last(self.window)

        # traits の平均（EpisodeStore に helper あるが、ここでも保険で計算）
        if eps:
            calm_vals = [e.traits_hint.get("calm", 0.0) for e in eps]
            emp_vals = [e.traits_hint.get("empathy", 0.0) for e in eps]
            cur_vals = [e.traits_hint.get("curiosity", 0.0) for e in eps]

            calm_mean = sum(calm_vals) / len(calm_vals)
            emp_mean = sum(emp_vals) / len(emp_vals)
            cur_mean = sum(cur_vals) / len(cur_vals)
        else:
            calm_mean = emp_mean = cur_mean = 0.0

        # emotion_hint の単純カウント
        emotion_count: Dict[str, int] = {}
        for e in eps:
            label = (e.emotion_hint or "").strip() or "unknown"
            emotion_count[label] = emotion_count.get(label, 0) + 1

        total_emotions = sum(emotion_count.values()) or 1
        emotion_ratio = {
            k: round(v / total_emotions, 4) for k, v in emotion_count.items()
        }

        # Identity 情報
        drift = self.identity.drift()
        stable = self.identity.is_stable()

        # 簡易的な負荷指数（load_index）
        # ・drift が大きいほど
        # ・negative / stressed 系のラベルが多いほど増える想定
        negative_keys = [k for k in emotion_ratio.keys()
                         if "stress" in k.lower()
                         or "overload" in k.lower()
                         or "tired" in k.lower()
                         or "anx" in k.lower()]

        neg_ratio = sum(emotion_ratio.get(k, 0.0) for k in negative_keys)
        load_index = min(1.0, float(drift) + float(neg_ratio))

        metrics: Dict[str, Any] = {
            "traits_mean": {
                "calm": round(calm_mean, 4),
                "empathy": round(emp_mean, 4),
                "curiosity": round(cur_mean, 4),
            },
            "emotion_ratio": emotion_ratio,
            "drift": round(float(drift), 4),
            "is_stable": bool(stable),
            "load_index": round(load_index, 4),
            "window_size": len(eps),
        }
        return metrics

    def _sample_episodes(self, limit: int = 5) -> List[Dict[str, Any]]:
        """
        LLM に渡すためのサンプルエピソード。
        summary / emotion_hint / traits_hint だけを抜き出す。
        """
        eps = self.episodes.get_last(limit)
        samples: List[Dict[str, Any]] = []
        for e in eps:
            samples.append(
                {
                    "timestamp": e.timestamp.astimezone(timezone.utc).isoformat(),
                    "summary": e.summary,
                    "emotion_hint": e.emotion_hint,
                    "traits_hint": e.traits_hint,
                }
            )
        return samples

    def _call_llm(
        self,
        identity_snapshot: Dict[str, Any],
        metrics: Dict[str, Any],
        samples: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        prompt = build_psychology_prompt(identity_snapshot, metrics, samples)
        raw = self.llm_fn(prompt)

        try:
            data = json.loads(raw)
        except Exception as e:
            raise RuntimeError(f"Invalid JSON from PsychologyCore: {raw}") from e

        # 必須キー
        for k in ["phase", "confidence", "identity_shift"]:
            if k not in data:
                raise RuntimeError(f"Missing key in PsychologyCore result: {k}")

        # 型ざっくりチェック
        if not isinstance(data.get("identity_shift"), dict):
            raise RuntimeError("PsychologyCore.identity_shift must be an object")

        return data

    # --------------------------------------------------------
    # 公開 API
    # --------------------------------------------------------

    def analyze(self, episode_id: Optional[str] = None) -> Dict[str, Any]:
        """
        エピソード + Identity から心理状態を評価し、
        ・phase / confidence / factors
        ・Identity.current の微調整
        ・Psychology Episode の追加
        を行う。
        """
        metrics = self._compute_metrics()
        ident_snapshot = self.identity.export_state()
        samples = self._sample_episodes(limit=5)

        llm_result = self._call_llm(ident_snapshot, metrics, samples)

        phase = str(llm_result.get("phase", "unknown"))
        confidence = float(llm_result.get("confidence", 0.0))
        factors = llm_result.get("factors") or []
        if not isinstance(factors, list):
            factors = [str(factors)]

        shift_raw = llm_result.get("identity_shift", {}) or {}

        # shift を clamp
        dc = self._clamp_shift(float(shift_raw.get("calm", 0.0)))
        de = self._clamp_shift(float(shift_raw.get("empathy", 0.0)))
        du = self._clamp_shift(float(shift_raw.get("curiosity", 0.0)))

        # Identity.current に対して Observed Traits として反映
        current = self.identity.current
        observed = TraitVector(
            calm=current.calm + dc,
            empathy=current.empathy + de,
            curiosity=current.curiosity + du,
        ).clamp()

        # 心理状態は「短期の姿勢」なので current に寄せるだけ
        self.identity.apply_observed_traits(observed, weight=0.35)

        # Episode 追加
        now = datetime.now(timezone.utc)
        eid = episode_id or f"psychology-{now.strftime('%Y%m%d-%H%M%S')}"

        episode = Episode(
            episode_id=eid,
            timestamp=now,
            summary=f"Psychology phase: {phase}",
            emotion_hint=phase,
            traits_hint=observed.as_dict(),
            raw_context=json.dumps(
                {
                    "metrics": metrics,
                    "llm_result": llm_result,
                },
                ensure_ascii=False,
            ),
        )
        self.episodes.add(episode)

        # export_state 用キャッシュ更新
        self._last_phase = phase
        self._last_confidence = confidence
        self._last_factors = [str(x) for x in factors]
        self._last_updated = now

        return {
            "phase": phase,
            "confidence": confidence,
            "factors": factors,
            "applied_shift": {
                "calm": dc,
                "empathy": de,
                "curiosity": du,
            },
            "metrics": metrics,
            "identity": self.identity.export_state(),
            "episode": episode.as_dict(),
        }

    def export_state(self) -> Dict[str, Any]:
        """
        Next 側の UI から定期ポーリングされる想定の状態取得 API 用。
        analyze() が一度も走っていない場合でも、metrics は常に返す。
        """
        metrics = self._compute_metrics()
        ident_snapshot = self.identity.export_state()

        if self._last_updated is not None:
            last_ts = self._last_updated.astimezone(timezone.utc).isoformat()
        else:
            last_ts = None

        return {
            "phase": self._last_phase or "unknown",
            "confidence": self._last_confidence,
            "factors": self._last_factors,
            "metrics": metrics,
            "identity": ident_snapshot,
            "last_updated": last_ts,
        }