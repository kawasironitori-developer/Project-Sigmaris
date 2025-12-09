# sigmaris-core/persona_core/value/value_state_projection.py
# -------------------------------------------------------------
# Persona OS 完全版 — Value / Trait / Drift 可視化レイヤ
#
# 役割：
#   - ValueState / TraitState / GlobalState を
#     「UI / ログ / LLM プロンプト向けの構造」に射影する。
#   - DriftSnapshot（記憶完全版で定義済）を生成するユーティリティ。
#
# 重要：
#   - ここで扱う数値はあくまで内部表現であり、
#     ユーザーへそのまま露出しない前提（LLM 側で制御する）。
# -------------------------------------------------------------

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Dict, Optional

from persona_core.types.core_types import DriftSnapshot, TraitVector
from persona_core.value.value_drift_engine import ValueState
from persona_core.trait.trait_drift_engine import TraitState
from persona_core.state.global_state_machine import GlobalStateContext, PersonaGlobalState


# ============================================================
# プロジェクション結果構造
# ============================================================

@dataclass
class ValueTraitProjection:
    """
    ValueState / TraitState / GlobalState を
    「外部に出しても良い構造」に正規化したスナップショット。

    想定用途：
      - ログ（JSON）
      - デバッグ用 UI
      - LLM の system_prompt に埋め込むメタ情報（数値は露出制御前提）
    """
    value: Dict[str, float] = field(default_factory=dict)
    traits: Dict[str, float] = field(default_factory=dict)
    global_state: Dict[str, Any] = field(default_factory=dict)
    flags: Dict[str, Any] = field(default_factory=dict)
    notes: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "value": self.value,
            "traits": self.traits,
            "global_state": self.global_state,
            "flags": self.flags,
            "notes": self.notes,
        }


# ============================================================
# DriftSnapshot ユーティリティ
# ============================================================

def build_drift_snapshot(
    *,
    value_state: ValueState,
    trait_state: TraitState,
    meta_reward_signal: Optional[float] = None,
) -> DriftSnapshot:
    """
    ValueState / TraitState から DriftSnapshot を構築するヘルパー。

    - value_baseline: ValueState を dict で保持
    - trait_vector : TraitState → TraitVector に埋め替え
    - meta_reward_signal: メタ報酬（必要なら外部から渡す）
    """
    trait_vec = TraitVector(
        calm=trait_state.calm,
        empathy=trait_state.empathy,
        curiosity=trait_state.curiosity,
    )

    return DriftSnapshot(
        value_baseline=value_state.to_dict(),
        trait_vector=trait_vec,
        meta_reward_signal=meta_reward_signal,
    )


# ============================================================
# Projection 本体
# ============================================================

def project_internal_state(
    *,
    value_state: ValueState,
    trait_state: TraitState,
    global_state_ctx: GlobalStateContext,
    safety_flag: Optional[str] = None,
    overload_score: Optional[float] = None,
    meta_notes: Optional[Dict[str, Any]] = None,
) -> ValueTraitProjection:
    """
    Persona OS 内部状態を「外部向け構造」に射影する。
    ここでは数値そのものは隠さず持つが、
    実際にユーザーにどこまで見せるかは上位レイヤで制御する前提。

    - value: ValueState.to_dict()
    - traits: TraitState.to_dict()
    - global_state: GlobalStateContext.to_dict() をベースに、
                    state.name / prev_state.name を明示。
    - flags: safety_flag / overload_score / 追加フラグ
    """

    value_dict = value_state.to_dict()
    trait_dict = trait_state.to_dict()

    g_dict = global_state_ctx.to_dict()
    g_state: PersonaGlobalState = global_state_ctx.state

    flags: Dict[str, Any] = {
        "safety_flag": safety_flag,
        "overload_score": overload_score,
    }

    projection_notes: Dict[str, Any] = meta_notes.copy() if meta_notes else {}
    projection_notes.update(
        {
            "global_state_name": g_state.name,
            "previous_state_name": (
                global_state_ctx.prev_state.name
                if global_state_ctx.prev_state is not None
                else None
            ),
        }
    )

    return ValueTraitProjection(
        value=value_dict,
        traits=trait_dict,
        global_state=g_dict,
        flags=flags,
        notes=projection_notes,
    )


# ============================================================
# LLM 用フォーマット（任意利用）
# ============================================================

def format_internal_state_for_llm(
    projection: ValueTraitProjection,
    *,
    redact_numbers: bool = False,
) -> str:
    """
    LLM の system prompt に埋め込むことを想定したテキスト化ユーティリティ。

    redact_numbers=True の場合：
      - Value / Trait の数値は伏せて「高め / 低め / 中立」などの
        抽象ラベルに変換することを想定（現段階は簡易実装）。

    ※ この関数は「数値をどう扱うか」のポリシー層であり、
       Persona OS のコアロジックからは独立している。
    """

    def _label(v: float) -> str:
        if v > 0.4:
            return "高め"
        if v < -0.4:
            return "低め"
        return "中立"

    if redact_numbers:
        value_part = {
            k: _label(v) for k, v in projection.value.items()
        }
        trait_part = {
            k: _label(v) for k, v in projection.traits.items()
        }
    else:
        value_part = projection.value
        trait_part = projection.traits

    gs = projection.global_state.get("state")
    prev = projection.global_state.get("prev_state")

    lines = [
        "【内部状態メタ情報（Persona OS）】",
        "",
        f"- GlobalState : {gs} (prev={prev})",
        f"- ValueState  : {value_part}",
        f"- TraitState  : {trait_part}",
        f"- Flags       : {projection.flags}",
    ]

    if projection.notes:
        lines.append(f"- Notes       : {projection.notes}")

    return "\n".join(lines)


# ============================================================
# JSON 化ヘルパー（ログ / UI 用）
# ============================================================

def projection_to_json_dict(
    projection: ValueTraitProjection,
    *,
    include_notes: bool = True,
) -> Dict[str, Any]:
    """
    ログ・UI 用に ValueTraitProjection を JSON フレンドリな dict に変換。
    """
    base = {
        "value": projection.value,
        "traits": projection.traits,
        "global_state": projection.global_state,
        "flags": projection.flags,
    }
    if include_notes:
        base["notes"] = projection.notes
    return base