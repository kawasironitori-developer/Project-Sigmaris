from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Callable, Dict, Any, Optional

from aei.identity import IdentityCore, TraitVector
from aei.episodic_memory import EpisodeStore
from aei.episodic_memory.epmem import Episode

LLMFn = Callable[[str], str]


# ============================================================
# ValueCore 用プロンプト（安全版：f-string 非使用）
# ============================================================
def build_value_prompt(identity_snapshot: Dict[str, Any], episodes_json: str) -> str:
    identity_js = json.dumps(identity_snapshot, ensure_ascii=False, indent=2)

    prompt = (
        "You are the VALUE CORE of an AEI system named Sigmaris.\n\n"
        "Your task is to perform a **long-term value analysis** based on:\n"
        "- The current Identity baseline\n"
        "- Recent episodic memory summaries and traits\n\n"
        "You must infer:\n"
        "1. \"importance\": 3–5 value labels\n"
        "2. \"weight\": float 0.0 → 1.0\n"
        "3. \"tension\": float 0.0 → 1.0\n"
        "4. \"baseline_shift\": micro adjustments\n\n"
        "Output ONLY JSON:\n\n"
        "{\n"
        "  \"importance\": [\"clarity\", \"self-consistency\", \"curiosity-growth\"],\n"
        "  \"weight\": 0.82,\n"
        "  \"tension\": 0.14,\n"
        "  \"baseline_shift\": {\n"
        "    \"calm\": 0.01,\n"
        "    \"empathy\": -0.01,\n"
        "    \"curiosity\": 0.02\n"
        "  }\n"
        "}\n\n"
        "--- IDENTITY SNAPSHOT ---\n"
        + identity_js +
        "\n\n--- RECENT EPISODES ---\n"
        + episodes_json
    )

    return prompt


# ============================================================
# ValueCore（長期価値判断）
# ============================================================
class ValueCore:
    def __init__(
        self,
        identity_core: IdentityCore,
        episode_store: EpisodeStore,
        llm_fn: LLMFn,
        max_shift: float = 0.03,
    ) -> None:
        self.identity = identity_core
        self.episodes = episode_store
        self.llm_fn = llm_fn
        self.max_shift = float(max_shift)

    # ---------------------------
    # clamp
    # ---------------------------
    def _clamp(self, x: float) -> float:
        m = self.max_shift
        return max(-m, min(m, x))

    # ---------------------------
    # LLM 呼び出し
    # ---------------------------
    def _call_llm(self) -> Dict[str, Any]:
        ident = self.identity.export_state()
        recent = [ep.as_dict() for ep in self.episodes.get_last(10)]
        episodes_json = json.dumps(recent, ensure_ascii=False)

        prompt = build_value_prompt(ident, episodes_json)
        raw = self.llm_fn(prompt)

        try:
            data = json.loads(raw)
        except Exception as e:
            raise RuntimeError(f"Invalid JSON from ValueCore: {raw}") from e

        required = ["importance", "weight", "tension", "baseline_shift"]
        for k in required:
            if k not in data:
                raise RuntimeError(f"Missing key in ValueCore: {k}")

        return data

    # ---------------------------
    # analyze()
    # ---------------------------
    def analyze(self, episode_id: Optional[str] = None) -> Dict[str, Any]:
        data = self._call_llm()

        imp = data["importance"]
        weight = float(data["weight"])
        tension = float(data["tension"])
        shift_raw = data["baseline_shift"]

        # micro shifts
        dc = self._clamp(float(shift_raw.get("calm", 0.0)))
        de = self._clamp(float(shift_raw.get("empathy", 0.0)))
        du = self._clamp(float(shift_raw.get("curiosity", 0.0)))

        # baseline 更新前の値
        base = self.identity.baseline

        updated = TraitVector(
            calm=base.calm + dc,
            empathy=base.empathy + de,
            curiosity=base.curiosity + du,
        ).clamp()

        # ======================================================
        # IdentityCore.apply_baseline_adjustment に準拠
        # weight は apply_baseline_adjustment が受け取らないため使わない
        # ======================================================
        self.identity.apply_baseline_adjustment((dc, de, du))

        # episode 登録
        now = datetime.now(timezone.utc)
        eid = episode_id or f"value-{now.strftime('%Y%m%d-%H%M%S')}"

        episode = Episode(
            episode_id=eid,
            timestamp=now,
            summary="Value: " + ", ".join(imp),
            emotion_hint="value/tension=" + f"{tension:.2f}",
            traits_hint=updated.as_dict(),
            raw_context=json.dumps(data, ensure_ascii=False),
        )

        self.episodes.add(episode)

        return {
            "value": {
                "importance": imp,
                "weight": weight,
                "tension": tension,
                "applied_shift": {
                    "calm": dc,
                    "empathy": de,
                    "curiosity": du,
                },
            },
            "episode": episode.as_dict(),
            "identity": self.identity.export_state(),
        }

    # ---------------------------
    # export_state() 追加（必須）
    # ---------------------------
    def export_state(self) -> Dict[str, Any]:
        return {
            "identity": self.identity.export_state(),
            "episodes": self.episodes.export_state(),
            "max_shift": self.max_shift,
        }