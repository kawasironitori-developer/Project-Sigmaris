# aei/reward/reward_core.py
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Callable

from aei.identity import IdentityCore
from aei.episodic_memory import EpisodeStore
from aei.episodic_memory.epmem import Episode

# LLM インターフェース型
LLMFn = Callable[[str], str]


# ============================================================
# プロンプト生成（Reward 用）  ※ f-string / dedent 不使用で安全寄り
# ============================================================

def build_reward_prompt(
    episodes: List[Dict[str, Any]],
    identity_snapshot: Dict[str, Any],
) -> str:
    """
    Reward 推定用の LLM プロンプト。
    - 直近エピソード群
    - identity（baseline / current）
    をまとめて渡して、「何がどれだけ良い学習か」を数値化させる。
    """

    ep_json = json.dumps(episodes, ensure_ascii=False, indent=2)
    id_json = json.dumps(identity_snapshot, ensure_ascii=False, indent=2)

    prompt = (
        "You are the REWARD SYSTEM of an AEI called Sigmaris.\n\n"
        "You will see:\n"
        "  - recent episodes (short logs with traits_hint and emotion_hint)\n"
        "  - current identity snapshot (baseline/current trait vectors)\n\n"
        "Your task:\n"
        "  1. Evaluate how \"healthy and growth-oriented\" the recent behavior is.\n"
        "  2. Output:\n"
        "       - global_reward: -1.0 to +1.0\n"
        "       - trait_reward: per-dimension reward suggestion\n"
        "         * calm/empathy/curiosity each between -0.10 and +0.10\n"
        "       - reason: short textual explanation (1–3 sentences)\n\n"
        "The reward is:\n"
        "  - positive when the episodes show curiosity, empathy, and emotional stability.\n"
        "  - negative when they show instability, dependency, or harmful drift.\n"
        "  - near zero when neutral.\n\n"
        "Output ONLY a JSON object:\n"
        "{\n"
        "  \"global_reward\": 0.0,\n"
        "  \"trait_reward\": {\n"
        "    \"calm\": 0.0,\n"
        "    \"empathy\": 0.0,\n"
        "    \"curiosity\": 0.0\n"
        "  },\n"
        "  \"reason\": \"...\"\n"
        "}\n\n"
        "Do NOT output markdown.\n"
        "Do NOT add extra keys.\n"
        "Do NOT add commentary outside JSON.\n\n"
        "--- EPISODES ---\n"
        + ep_json +
        "\n\n--- IDENTITY ---\n"
        + id_json +
        "\n"
    )
    return prompt


# ============================================================
# RewardCore
# ============================================================

class RewardCore:
    """
    Sigmaris OS — Reward System Core

    役割:
      - 直近の Episode 群 + Identity を見て Reward を計算
      - LLM があれば LLM ベース、なければルールベースで動く
      - trait_reward を IdentityCore の baseline に微調整として反映

    出力:
      {
        "global_reward": float,
        "trait_reward": {calm, empathy, curiosity},
        "reason": str,
        "used_llm": bool,
        "applied_delta": {calm, empathy, curiosity},
      }
    """

    def __init__(
        self,
        identity_core: IdentityCore,
        episode_store: EpisodeStore,
        llm_fn: Optional[LLMFn] = None,
        window_size: int = 8,
        max_trait_adjustment: float = 0.05,
    ) -> None:
        self.identity_core = identity_core
        self.episode_store = episode_store
        self.llm_fn = llm_fn

        self.window_size = int(window_size)
        self.max_trait_adjustment = float(max_trait_adjustment)

    # ------------------------------------------------------------
    # clamp
    # ------------------------------------------------------------

    def _clamp_trait(self, x: float) -> float:
        m = self.max_trait_adjustment
        return max(-m, min(m, float(x)))

    def _clamp_global_reward(self, x: float) -> float:
        return max(-1.0, min(1.0, float(x)))

    # ------------------------------------------------------------
    # LLM 呼び出し
    # ------------------------------------------------------------

    def _call_llm(
        self,
        ep_dicts: List[Dict[str, Any]],
        identity_snapshot: Dict[str, Any],
    ) -> Dict[str, Any]:
        if self.llm_fn is None:
            raise RuntimeError("RewardCore: llm_fn is None but _call_llm() was invoked")

        prompt = build_reward_prompt(ep_dicts, identity_snapshot)
        raw = self.llm_fn(prompt)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            raise RuntimeError(
                f"Invalid JSON from Reward LLM: {e}\nRAW={raw[:300]}"
            ) from e

        for key in ("global_reward", "trait_reward", "reason"):
            if key not in data:
                raise RuntimeError(f"Missing key in reward result: {key}")

        # trait_reward が dict であることだけは確認しておく
        if not isinstance(data.get("trait_reward"), dict):
            raise RuntimeError("RewardCore: trait_reward must be an object")

        return data

    # ------------------------------------------------------------
    # ルールベースのフォールバック Reward
    # ------------------------------------------------------------

    def _rule_based_reward(
        self,
        episodes: List[Episode],
        identity_snapshot: Dict[str, Any],  # インターフェース維持のため残す（未使用）
    ) -> Dict[str, Any]:
        """
        LLM が無い場合の安全なフォールバック。
        直近エピソードの traits_hint 平均と baseline の差を簡易評価する。
        """

        if not episodes:
            return {
                "global_reward": 0.0,
                "trait_reward": {"calm": 0.0, "empathy": 0.0, "curiosity": 0.0},
                "reason": "No episodes: neutral reward.",
            }

        # baseline を参照
        base = self.identity_core.baseline

        sum_c = sum_e = sum_u = 0.0
        count = 0

        for ep in episodes:
            th = ep.traits_hint or {}
            sum_c += float(th.get("calm", base.calm))
            sum_e += float(th.get("empathy", base.empathy))
            sum_u += float(th.get("curiosity", base.curiosity))
            count += 1

        avg_c = sum_c / count
        avg_e = sum_e / count
        avg_u = sum_u / count

        # baseline との差分
        dc = avg_c - base.calm
        de = avg_e - base.empathy
        du = avg_u - base.curiosity

        # global_reward は「平均的なプラス方向」をざっくり評価
        global_raw = (dc + de + du) / 3.0
        global_reward = self._clamp_global_reward(global_raw * 2.0)  # 少し強調

        # trait_reward は差分をそのまま縮小して使う
        trait_reward = {
            "calm": self._clamp_trait(dc),
            "empathy": self._clamp_trait(de),
            "curiosity": self._clamp_trait(du),
        }

        reason = (
            "Rule-based reward: "
            f"avg traits vs baseline → dc={dc:.3f}, de={de:.3f}, du={du:.3f}."
        )

        return {
            "global_reward": global_reward,
            "trait_reward": trait_reward,
            "reason": reason,
        }

    # ------------------------------------------------------------
    # 公開 API
    # ------------------------------------------------------------

    def evaluate(self) -> Optional[Dict[str, Any]]:
        """
        直近エピソードと Identity を見て Reward を計算し、
        IdentityCore に微小な baseline 調整として反映する。

        エピソードが無ければ None。
        """
        episodes: List[Episode] = self.episode_store.get_last(self.window_size)
        if not episodes:
            return None

        ep_dicts = [ep.as_dict() for ep in episodes]
        snapshot = self.identity_core.export_state()

        # --- LLM or ルールベース ---
        used_llm = self.llm_fn is not None
        if used_llm:
            data = self._call_llm(ep_dicts, snapshot)
        else:
            data = self._rule_based_reward(episodes, snapshot)

        # --- 値取得と clamp ---
        global_reward = self._clamp_global_reward(data.get("global_reward", 0.0))
        tr_raw = data.get("trait_reward", {}) or {}

        dc = self._clamp_trait(tr_raw.get("calm", 0.0))
        de = self._clamp_trait(tr_raw.get("empathy", 0.0))
        du = self._clamp_trait(tr_raw.get("curiosity", 0.0))

        # --- IdentityCore に反映 ---
        # apply_baseline_adjustment は (dc, de, du) タプルを取る仕様
        self.identity_core.apply_baseline_adjustment((dc, de, du))
        # 調整後の current を baseline に少し寄せて安定させる
        self.identity_core.gently_correct(weight=0.15)

        return {
            "global_reward": global_reward,
            "trait_reward": {
                "calm": dc,
                "empathy": de,
                "curiosity": du,
            },
            "reason": str(data.get("reason", "")),
            "used_llm": used_llm,
            "applied_delta": {
                "calm": dc,
                "empathy": de,
                "curiosity": du,
            },
        }