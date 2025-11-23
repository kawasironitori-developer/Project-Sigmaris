# aei/psychology/meta_reflection.py
from __future__ import annotations

import json
from textwrap import dedent
from typing import Dict, Any, List, Optional, Callable

from aei.identity import IdentityCore
from aei.episodic_memory.epmem import EpisodeStore, Episode


# ------------------------------------------------------------
# LLM 関数型の統一定義
# ------------------------------------------------------------
LLMFn = Callable[[str], str]   # (prompt: str) -> JSON_str


# ------------------------------------------------------------
# プロンプト生成
# ------------------------------------------------------------

def build_meta_prompt(episodes: List[Dict[str, Any]], identity_snapshot: Dict[str, Any]) -> str:
    """
    Meta-Reflection は心理の“全階層”を俯瞰する。
    episodes + identity（baseline/current/drift）を LLM に渡す。
    """
    episodes_json = json.dumps(episodes, ensure_ascii=False, indent=2)
    identity_json = json.dumps(identity_snapshot, ensure_ascii=False, indent=2)

    prompt = f"""
    You are the META-REFLECTION module of an AEI system named Sigmaris.

    Your task is to analyze the *entire psychological timeline*:
      - recent episodes (short-term)
      - mid-term tendencies
      - long-term psychological drift
      - identity baseline / current vectors

    From this, infer:
      1. The deep psychological pattern (meta-level)
      2. The structural root cause for drift
      3. A safe long-term baseline correction:
           - calm/empathy/curiosity each between -0.05 and +0.05
      4. Risk profile:
           - identity_drift_risk
           - emotional_collapse_risk
           - over_dependency_risk

    Output ONLY JSON:
    {{
      "meta_summary": "...",
      "root_cause": "...",
      "adjustment": {{
        "calm": 0.0,
        "empathy": 0.0,
        "curiosity": 0.0
      }},
      "risk": {{
        "identity_drift_risk": false,
        "emotional_collapse_risk": false,
        "over_dependency_risk": false
      }}
    }}

    --- EPISODES ---
    {episodes_json}

    --- IDENTITY ---
    {identity_json}
    """
    return dedent(prompt).strip()


# ------------------------------------------------------------
# MetaReflectionCore
# ------------------------------------------------------------

class MetaReflectionCore:
    """
    Sigmaris OS — Meta-Reflection Layer（最終統合層）

    Reflection → Introspection → LongTerm の全層を統合し、
    “深層心理の傾向・root cause・安全な baseline 修正” を行う。
    """

    def __init__(
        self,
        identity_core: IdentityCore,
        episode_store: EpisodeStore,
        llm_fn: LLMFn,
        window_size: int = 12,
        max_adjustment: float = 0.05,
    ) -> None:
        self.identity_core = identity_core
        self.episode_store = episode_store
        self.llm_fn = llm_fn

        self.window_size = int(window_size)
        self.max_adjustment = float(max_adjustment)

    # ------------------------------------------------------------
    # clamp（安全な調整幅）
    # ------------------------------------------------------------

    def _clamp(self, x: float) -> float:
        m = self.max_adjustment
        return max(-m, min(m, float(x)))

    # ------------------------------------------------------------
    # LLM 呼び出し
    # ------------------------------------------------------------

    def _call_llm(self, ep_dicts: List[Dict[str, Any]]) -> Dict[str, Any]:
        snapshot = self.identity_core.export_state()
        prompt = build_meta_prompt(ep_dicts, snapshot)

        raw = self.llm_fn(prompt)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Invalid JSON from Meta-Reflection LLM: {e}\nRAW={raw[:300]}") from e

        for key in ("meta_summary", "root_cause", "adjustment", "risk"):
            if key not in data:
                raise RuntimeError(f"Missing key in meta-reflection result: {key}")

        return data

    # ------------------------------------------------------------
    # 公開 API
    # ------------------------------------------------------------

    def meta_reflect(self) -> Optional[Dict[str, Any]]:
        """
        Meta-Reflection を実行し、深層レベルの baseline 調整を行う。
        Episodes が不足する場合は None を返す。
        """
        episodes: List[Episode] = self.episode_store.get_last(self.window_size)
        if not episodes:
            return None

        ep_dicts = [ep.as_dict() for ep in episodes]
        data = self._call_llm(ep_dicts)

        adj_raw = data.get("adjustment", {})
        risk_raw = data.get("risk", {})

        # clamp
        dc = self._clamp(adj_raw.get("calm", 0.0))
        de = self._clamp(adj_raw.get("empathy", 0.0))
        du = self._clamp(adj_raw.get("curiosity", 0.0))

        # IdentityCore 標準ルートで更新
        self.identity_core.apply_baseline_adjustment((dc, de, du))

        # baseline が動いたので current も安定化
        self.identity_core.gently_correct(weight=0.20)

        return {
            "meta_summary": data.get("meta_summary", ""),
            "root_cause": data.get("root_cause", ""),
            "adjustment": {"calm": dc, "empathy": de, "curiosity": du},
            "risk": {
                "identity_drift_risk": bool(risk_raw.get("identity_drift_risk", False)),
                "emotional_collapse_risk": bool(risk_raw.get("emotional_collapse_risk", False)),
                "over_dependency_risk": bool(risk_raw.get("over_dependency_risk", False)),
            },
        }