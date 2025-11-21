# aei/emotion_core.py
from __future__ import annotations

import json
from datetime import datetime, timezone
from textwrap import dedent
from typing import Callable, Dict, Any, Optional

from aei.identity import IdentityCore, TraitVector
from aei.episodic_memory import EpisodeStore
from aei.episodic_memory.epmem import Episode

# LLM インターフェース: prompt (str) -> JSON文字列 (str)
LLMFn = Callable[[str], str]


# ============================================================
# プロンプト生成（深層 Emotion 解析）
# ============================================================

def build_emotion_prompt(raw_log: str, identity_snapshot: Dict[str, Any]) -> str:
    identity_json = json.dumps(identity_snapshot, ensure_ascii=False, indent=2)

    prompt = f"""
    You are the **EMOTION CORE** of an AEI system named Sigmaris.

    Your task is to perform a **deep emotional analysis** of the given text,
    taking into account the current identity state.

    INPUT:
      - interaction_log: free-form text or thought log from the user
      - identity_snapshot: baseline/current trait vectors

    From this, infer:

      1. A concise emotion label (e.g., "quiet-focus", "soft-curiosity")
      2. Intensity of this emotion (0.0 - 1.0)
      3. A short natural-language reason
      4. A trait_shift object for:
           - calm
           - empathy
           - curiosity
         (each -0.05 to +0.05)
      5. meta:
           - energy    (0.0 - 1.0)
           - stability (0.0 - 1.0)
           - valence   (-1.0 - +1.0)

    Return ONLY JSON:
    {{
      "emotion": "quiet-focus",
      "intensity": 0.62,
      "reason": "...",
      "trait_shift": {{
        "calm": 0.03,
        "empathy": -0.01,
        "curiosity": 0.04
      }},
      "meta": {{
        "energy": 0.67,
        "stability": 0.91,
        "valence": 0.12
      }}
    }}

    --- INTERACTION LOG ---
    {raw_log}

    --- IDENTITY SNAPSHOT ---
    {identity_json}
    """
    return dedent(prompt).strip()


# ============================================================
# EmotionCore（深層・感情解析レイヤ）
# ============================================================

class EmotionCore:
    def __init__(
        self,
        identity_core: IdentityCore,
        episode_store: EpisodeStore,
        llm_fn: LLMFn,
        max_trait_shift: float = 0.05,
    ) -> None:
        self.identity_core = identity_core
        self.episode_store = episode_store
        self.llm_fn = llm_fn
        self.max_trait_shift = float(max_trait_shift)

    # --------------------------------------------------------
    # 内部ユーティリティ
    # --------------------------------------------------------

    def _clamp_shift(self, x: float) -> float:
        m = self.max_trait_shift
        return max(-m, min(m, float(x)))

    def _call_llm(self, raw_log: str) -> Dict[str, Any]:
        snapshot = self.identity_core.export_state()
        prompt = build_emotion_prompt(raw_log, snapshot)
        raw = self.llm_fn(prompt)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            raise RuntimeError(
                f"Invalid JSON from EmotionCore LLM: {e}\nRAW={raw[:300]}"
            ) from e

        for key in ("emotion", "intensity", "reason", "trait_shift", "meta"):
            if key not in data:
                raise RuntimeError(f"Missing key in EmotionCore result: {key}")

        return data

    # --------------------------------------------------------
    # 公開 API
    # --------------------------------------------------------

    def analyze(
        self,
        raw_log: str,
        episode_id: Optional[str] = None,
    ) -> Dict[str, Any]:

        # 1) LLM による推定
        data = self._call_llm(raw_log)

        emotion_label = str(data.get("emotion") or "unknown")
        intensity_raw = float(data.get("intensity") or 0.0)
        reason = str(data.get("reason") or "").strip()

        trait_shift_raw = data.get("trait_shift") or {}
        meta_raw = data.get("meta") or {}

        # 2) shift を clamp
        dc = self._clamp_shift(trait_shift_raw.get("calm", 0.0))
        de = self._clamp_shift(trait_shift_raw.get("empathy", 0.0))
        du = self._clamp_shift(trait_shift_raw.get("curiosity", 0.0))

        # 3) 新しい current（揺れ）生成
        cur = self.identity_core.current
        observed = TraitVector(
            calm=cur.calm + dc,
            empathy=cur.empathy + de,
            curiosity=cur.curiosity + du,
        ).clamp()

        # 4) 反映
        self.identity_core.apply_observed_traits(observed, weight=0.6)

        if not self.identity_core.is_stable():
            self.identity_core.gently_correct(weight=0.25)

        # 5) Episode 化
        now = datetime.now(timezone.utc)
        eid = episode_id or f"em-{now.strftime('%Y%m%d-%H%M%S')}"

        summary = reason or raw_log[:120]

        episode = Episode(
            episode_id=eid,
            timestamp=now,
            summary=summary,
            emotion_hint=emotion_label,
            traits_hint=self.identity_core.current.as_dict(),
            raw_context=raw_log,
        )

        self.episode_store.add(episode)

        # 6) meta clamp
        meta = {
            "energy": max(0.0, min(1.0, float(meta_raw.get("energy", 0.5)))),
            "stability": max(0.0, min(1.0, float(meta_raw.get("stability", 0.5)))),
            "valence": max(-1.0, min(1.0, float(meta_raw.get("valence", 0.0)))),
        }

        return {
            "emotion": {
                "label": emotion_label,
                "intensity": max(0.0, min(1.0, intensity_raw)),
                "reason": reason,
                "applied_trait_shift": {
                    "calm": dc,
                    "empathy": de,
                    "curiosity": du,
                },
                "meta": meta,
            },
            "episode": episode.as_dict(),
            "identity": self.identity_core.export_state(),
        }