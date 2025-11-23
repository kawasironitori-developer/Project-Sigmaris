from __future__ import annotations

import json
from typing import Dict, Any, List, Optional, Callable
from textwrap import dedent

from aei.identity import IdentityCore, TraitVector
from aei.episodic_memory.epmem import EpisodeStore, Episode

# ---------------------------------------------------------
# LLMFn 型（このファイル内で定義）
# ---------------------------------------------------------
LLMFn = Callable[[str], str]   # LLM(prompt: str) -> str


# ---------------------------------------------------------
# プロンプト生成（中期内省）
# ---------------------------------------------------------

def build_introspection_prompt(episodes_dicts: List[Dict[str, Any]]) -> str:
    """
    Episode の dict リストを LLM に渡して
    中期的なパターンを抽出させるためのプロンプト。
    """
    episodes_json = json.dumps(episodes_dicts, ensure_ascii=False, indent=2)

    prompt = f"""
    You are the mid-term introspection module of an AEI system named Sigmaris.

    You will receive several recent episodes in JSON.
    Each episode contains:
      - summary
      - emotion_hint
      - traits_hint (calm / empathy / curiosity)
      - timestamp (ISO8601, timezone-aware)

    Your task:
      1. Infer the mid-term psychological pattern.
      2. Summarize the tendencies in 2–4 sentences.
      3. Propose *small* baseline adjustments:
           - each between -0.10 and +0.10
      4. Output risk indicators:
           - drift_warning: true/false
           - dependency_warning: true/false

    Output ONLY a JSON object:
    {{
      "mid_term_summary": "...",
      "pattern": "...",
      "trait_adjustment": {{
        "calm": 0.0,
        "empathy": 0.0,
        "curiosity": 0.0
      }},
      "risk": {{
        "drift_warning": false,
        "dependency_warning": false
      }}
    }}

    --- BEGIN EPISODES ---
    {episodes_json}
    --- END EPISODES ---
    """
    return dedent(prompt).strip()


# ---------------------------------------------------------
# IntrospectionCore（中期内省）
# ---------------------------------------------------------

class IntrospectionCore:
    """
    Sigmaris OS — Mid-Term Psychology Layer

    - 直近N件の Episode を読み取り
    - 中期パターンを LLM で推定
    - baseline traits を少しだけ進化させる
    - drift/dependency 警告を取得
    """

    def __init__(
        self,
        identity_core: IdentityCore,
        episode_store: EpisodeStore,
        llm_fn: LLMFn,
        window_size: int = 5,
        max_adjustment: float = 0.05,
    ) -> None:

        self.identity_core = identity_core
        self.episode_store = episode_store
        self.llm_fn = llm_fn
        self.window_size = int(window_size)
        self.max_adjustment = float(max_adjustment)

    # ----------------------------
    # 内部: clamp 調整
    # ----------------------------

    def _clamp(self, x: float) -> float:
        m = self.max_adjustment
        return max(-m, min(m, float(x)))

    # ----------------------------
    # 内部: LLM 呼び出し
    # ----------------------------

    def _call_llm(self, episodes_dicts: List[Dict[str, Any]]) -> Dict[str, Any]:
        prompt = build_introspection_prompt(episodes_dicts)
        raw = self.llm_fn(prompt)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            raise RuntimeError(
                f"Invalid JSON from introspection LLM: {e}\nRAW={raw[:200]}"
            ) from e

        for key in ("mid_term_summary", "pattern", "trait_adjustment", "risk"):
            if key not in data:
                raise RuntimeError(f"Missing key in introspection result: {key}")

        return data

    # ----------------------------
    # 公開 API
    # ----------------------------

    def introspect(self) -> Optional[Dict[str, Any]]:
        """
        中期内省を実行し、baseline を微調整する。
        エピソードが足りない場合は None を返す。
        """
        episodes: List[Episode] = self.episode_store.get_last(self.window_size)
        if not episodes:
            return None

        episodes_dicts = [ep.as_dict() for ep in episodes]
        data = self._call_llm(episodes_dicts)

        # --- 取得 ---
        adj = data.get("trait_adjustment", {})
        risk = data.get("risk", {})

        # --- 調整値 clamp ---
        dc = self._clamp(adj.get("calm", 0.0))
        de = self._clamp(adj.get("empathy", 0.0))
        du = self._clamp(adj.get("curiosity", 0.0))

        # --- baseline 反映（IdentityCore 正規ルート）---
        self.identity_core.apply_baseline_adjustment((dc, de, du))

        # baseline 更新後は current を baseline に寄せる
        self.identity_core.gently_correct()

        return {
            "mid_term_summary": data.get("mid_term_summary", ""),
            "pattern": data.get("pattern", ""),
            "trait_adjustment": {
                "calm": dc,
                "empathy": de,
                "curiosity": du,
            },
            "risk": {
                "drift_warning": bool(risk.get("drift_warning", False)),
                "dependency_warning": bool(risk.get("dependency_warning", False)),
            },
        }