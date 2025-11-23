# aei/reflection/reflection_core.py
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Callable, Dict, Any, Optional
from textwrap import dedent

from aei.identity import IdentityCore, TraitVector
from aei.episodic_memory import EpisodeStore, Episode


# =====================================================================
# LLM 関数型
# =====================================================================

# prompt: str → JSON文字列: str
LLMFn = Callable[[str], str]


# =====================================================================
# プロンプト生成（Reflection 用）
# =====================================================================

def build_reflection_prompt(raw_log: str) -> str:
    """
    raw_log（テキスト or 会話ログ）から Episode を生成するための
    LLM プロンプトを生成する。
    """
    prompt = f"""
    You are the reflection module of an AEI system named Sigmaris.

    Read the following interaction log or daily text.
    Extract a structured reflection with:
      - summary (2–4 sentences)
      - emotion_hint (e.g., "calm-positive", "tired-but-focused")
      - traits_hint: {{
          "calm": 0.0–1.0,
          "empathy": 0.0–1.0,
          "curiosity": 0.0–1.0
        }}

    Return ONLY a JSON object:
    {{
      "summary": "...",
      "emotion_hint": "...",
      "traits_hint": {{
        "calm": 0.0,
        "empathy": 0.0,
        "curiosity": 0.0
      }}
    }}

    Do NOT output markdown.
    Do NOT include explanations.
    Do NOT include extra keys.

    --- BEGIN LOG ---
    {raw_log}
    --- END LOG ---
    """
    return dedent(prompt).strip()


# =====================================================================
# ReflectionCore（短期内省 → Episode生成）
# =====================================================================

class ReflectionCore:
    """
    Sigmaris の短期内省層（Reflection Layer）。

    役割:
      1. raw_log を LLM に渡す
      2. summary / emotion_hint / traits_hint を抽出
      3. traits_hint → TraitVector として current に反映
      4. drift が大きければ gentle correct
      5. EpisodeStore に保存
    """

    def __init__(
        self,
        identity_core: IdentityCore,
        episode_store: EpisodeStore,
        llm_fn: LLMFn,
    ) -> None:
        self.identity_core = identity_core
        self.episode_store = episode_store
        self.llm_fn = llm_fn

    # -----------------------------------------------------
    # 内部: LLM 呼び出し
    # -----------------------------------------------------

    def _call_llm(self, raw_log: str) -> Dict[str, Any]:
        """
        LLM から構造化 Reflection を取得して dict にする。
        """
        prompt = build_reflection_prompt(raw_log)
        raw = self.llm_fn(prompt)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Invalid JSON from LLM: {e}\nRAW={raw[:200]}") from e

        required = ("summary", "emotion_hint", "traits_hint")
        for key in required:
            if key not in data:
                raise RuntimeError(f"Missing key in LLM reflection: {key}")

        return data

    # -----------------------------------------------------
    # 内部: traits_hint → TraitVector
    # -----------------------------------------------------

    def _hint_to_traits(self, hint: Dict[str, Any]) -> TraitVector:
        """
        LLM の traits_hint を TraitVector に変換。
        欠損は current の値で補完。
        """
        if not hint:
            return self.identity_core.current

        return TraitVector(
            calm=float(hint.get("calm", self.identity_core.current.calm)),
            empathy=float(hint.get("empathy", self.identity_core.current.empathy)),
            curiosity=float(hint.get("curiosity", self.identity_core.current.curiosity)),
        ).clamp()

    # -----------------------------------------------------
    # 公開 API
    # -----------------------------------------------------

    def reflect(
        self,
        raw_log: str,
        episode_id: Optional[str] = None,
        emotion_fallback: str = "unknown",
    ) -> Episode:
        """
        Reflection → Episode 作成 → Identity 更新 → 保存。
        """

        # 1. LLM 呼び出し
        data = self._call_llm(raw_log)

        summary = str(data.get("summary", "")).strip()
        emotion_hint = str(data.get("emotion_hint") or emotion_fallback)
        traits_hint_raw = data.get("traits_hint") or {}

        # 2. TraitVector 構築
        observed = self._hint_to_traits(traits_hint_raw)

        # 3. IdentityCore に反映（短期）
        self.identity_core.apply_observed_traits(observed, weight=0.4)

        # drift が大きければ baseline に寄せる
        if not self.identity_core.is_stable():
            self.identity_core.gently_correct()

        # 4. Episode 生成
        now = datetime.now(timezone.utc)
        eid = episode_id or f"ep-{now.strftime('%Y%m%d-%H%M%S')}"

        episode = Episode(
            episode_id=eid,
            timestamp=now,
            summary=summary or raw_log[:120],
            emotion_hint=emotion_hint,
            traits_hint=observed.as_dict(),
            raw_context=raw_log,
        )

        # 5. 保存
        self.episode_store.add(episode)

        return episode