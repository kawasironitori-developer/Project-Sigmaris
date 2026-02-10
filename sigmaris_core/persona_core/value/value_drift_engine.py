# sigmaris-core/persona_core/value/value_drift_engine.py
# -------------------------------------------------------------
# Persona OS 完全版 Value Drift Engine
#
# Identity / Memory / Reward / Safety の影響を受けて
# ValueState を毎ターン微小更新する。
#
# ・変動は常に小さく（learning_rate）
# ・自然減衰（decay）で長期安定
# ・Reward / Safety は強い影響を持つ
# ・DB snapshot があれば保存
# -------------------------------------------------------------

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Any, Optional

from persona_core.types.core_types import PersonaRequest
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.identity.identity_continuity import IdentityContinuityResult


# ============================================================
# ValueState（Persona の抽象的価値ベクトル）
# ============================================================

@dataclass
class ValueState:
    stability: float = 0.0        # 保守性・連続性
    openness: float = 0.0         # 新規トピックへの開放度
    safety_bias: float = 0.0      # 安全寄りの傾向
    user_alignment: float = 0.0   # ユーザーとの同調性（正方向）

    def to_dict(self) -> Dict[str, float]:
        return {
            "stability": self.stability,
            "openness": self.openness,
            "safety_bias": self.safety_bias,
            "user_alignment": self.user_alignment,
        }


# ============================================================
# Drift Result
# ============================================================

@dataclass
class ValueDriftResult:
    new_state: ValueState
    delta: Dict[str, float] = field(default_factory=dict)
    notes: Dict[str, Any] = field(default_factory=dict)


# ============================================================
# Value Drift Engine（完全版）
# ============================================================

class ValueDriftEngine:
    """
    Persona OS での価値変動の核。
    drift = decay + identity + memory + safety + reward
    """

    def __init__(
        self,
        *,
        learning_rate: float = 0.03,
        decay_rate: float = 0.001,
        max_abs_value: float = 1.0,
    ) -> None:
        self._lr = float(learning_rate)
        self._decay = float(decay_rate)
        self._limit = float(max_abs_value)

    # --------------------------------------------------------
    # 公開 API
    # --------------------------------------------------------

    def apply(
        self,
        *,
        current: ValueState,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        reward_signal: float = 0.0,
        safety_flag: Optional[str] = None,
        db: Optional[Any] = None,
        user_id: Optional[str] = None,
    ) -> ValueDriftResult:
        """
        1ターン分の ValueState を更新し、結果と差分を返す。
        PersonaController から毎ターン呼ばれるエントリポイント。
        """

        # Guardrail: freeze major updates (Phase01 Part06 safe modes)
        try:
            if isinstance(getattr(req, "metadata", None), dict) and req.metadata.get("_freeze_updates"):
                return ValueDriftResult(
                    new_state=ValueState(
                        stability=current.stability,
                        openness=current.openness,
                        safety_bias=current.safety_bias,
                        user_alignment=current.user_alignment,
                    ),
                    delta={k: 0.0 for k in current.to_dict().keys()},
                    notes={"frozen": True, "reason": "guardrail_freeze"},
                )
        except Exception:
            pass

        # Phase02 coupling (MD-02/06):
        # - Homeostatic anchor (optional): pull values toward an anchor, not always toward zero.
        # - TemporalIdentity scaling (optional): inertia/budget reduce plasticity.
        anchor: Optional[Dict[str, float]] = None
        lr_scale = 1.0
        try:
            if isinstance(getattr(req, "metadata", None), dict):
                raw_anchor = req.metadata.get("_value_anchor")
                if isinstance(raw_anchor, dict):
                    anchor = {str(k): float(v) for k, v in raw_anchor.items() if isinstance(v, (int, float))}
                inertia = req.metadata.get("_tid_inertia")
                budget = req.metadata.get("_tid_stability_budget")
                if isinstance(inertia, (int, float)) and isinstance(budget, (int, float)):
                    lr_scale = max(
                        0.08,
                        min(1.0, (1.0 - float(inertia)) * max(0.0, min(1.0, float(budget)))),
                    )
        except Exception:
            anchor = None
            lr_scale = 1.0

        # deep copy（破壊防止）
        new_state = ValueState(
            stability=current.stability,
            openness=current.openness,
            safety_bias=current.safety_bias,
            user_alignment=current.user_alignment,
        )

        deltas: Dict[str, float] = {k: 0.0 for k in new_state.to_dict().keys()}

        # -------- 1) 自然減衰 + Homeostatic Return（アンカーへ戻す） --------
        self._apply_decay(new_state, deltas, anchor=anchor)

        # -------- 2) Identity influence --------
        self._apply_identity_influence(new_state, deltas, identity, lr_scale=lr_scale)

        # -------- 3) Memory influence --------
        self._apply_memory_influence(new_state, deltas, memory, lr_scale=lr_scale)

        # -------- 4) Safety influence --------
        self._apply_safety_influence(new_state, deltas, safety_flag, lr_scale=lr_scale)

        # -------- 5) Reward influence --------
        self._apply_reward_influence(new_state, deltas, reward_signal, lr_scale=lr_scale)

        # -------- 6) クリップ --------
        self._clip_state(new_state)

        # -------- 7) DB snapshot --------
        self._store_snapshot_if_supported(
            db=db,
            user_id=user_id,
            state=new_state,
            deltas=deltas,
            req=req,
            memory=memory,
            identity=identity,
        )

        notes = {
            "reward_signal": float(reward_signal),
            "safety_flag": safety_flag,
            "identity_topic_label": identity.identity_context.get("topic_label"),
            "memory_pointer_count": len(memory.pointers),
        }

        return ValueDriftResult(
            new_state=new_state,
            delta=deltas,
            notes=notes,
        )

    # =========================================================
    # 内部ロジック
    # =========================================================

    def _apply_decay(
        self,
        state: ValueState,
        deltas: Dict[str, float],
        *,
        anchor: Optional[Dict[str, float]],
    ) -> None:
        """
        Homeostatic restoration:
        - If anchor is present: pull toward anchor.
        - Otherwise: pull toward zero (legacy behavior).
        """
        for k in list(deltas.keys()):
            v = getattr(state, k)
            target = float(anchor.get(k, 0.0)) if isinstance(anchor, dict) else 0.0
            dv = -(float(v) - target) * self._decay
            setattr(state, k, v + dv)
            deltas[k] += dv

    # --------------------------------------------------------

    def _apply_identity_influence(
        self,
        state: ValueState,
        deltas: Dict[str, float],
        identity: IdentityContinuityResult,
        *,
        lr_scale: float = 1.0,
    ) -> None:
        ctx = identity.identity_context or {}
        has_past = bool(ctx.get("has_past_context"))
        topic_label = (ctx.get("topic_label") or "").lower()
        base = self._lr * float(lr_scale)

        # 過去文脈あり → stability↑
        if has_past:
            dv = base * 0.5
            state.stability += dv
            deltas["stability"] += dv

        # 「続き」を示すラベルが含まれる → stability↑
        markers = ["続き", "前回", "再開", "previous", "continue", "last time"]
        if any(m in topic_label for m in markers):
            dv = base * 0.5
            state.stability += dv
            deltas["stability"] += dv

    # --------------------------------------------------------

    def _apply_memory_influence(
        self,
        state: ValueState,
        deltas: Dict[str, float],
        memory: MemorySelectionResult,
        *,
        lr_scale: float = 1.0,
    ) -> None:
        count = len(memory.pointers)
        base = self._lr * float(lr_scale)

        if count >= 3:
            # 長期文脈への強い依存 → 安定性↑ / 開放性↓
            ds = base * 0.4
            do = -base * 0.2
            state.stability += ds
            state.openness += do
            deltas["stability"] += ds
            deltas["openness"] += do

        elif 1 <= count <= 2:
            # 少し安定性寄り
            ds = base * 0.2
            state.stability += ds
            deltas["stability"] += ds

        else:
            # 新規トピック → openness↑
            do = base * 0.3
            state.openness += do
            deltas["openness"] += do

    # --------------------------------------------------------

    def _apply_safety_influence(
        self,
        state: ValueState,
        deltas: Dict[str, float],
        safety_flag: Optional[str],
        *,
        lr_scale: float = 1.0,
    ) -> None:
        if not safety_flag:
            return

        base = self._lr * float(lr_scale)

        # SafetyLayer の警告が強いとき → safety_bias↑
        if safety_flag in ("escalated", "blocked", "intervened"):
            dv = base * 0.7
            state.safety_bias += dv
            deltas["safety_bias"] += dv

    # --------------------------------------------------------

    def _apply_reward_influence(
        self,
        state: ValueState,
        deltas: Dict[str, float],
        reward_signal: float,
        *,
        lr_scale: float = 1.0,
    ) -> None:
        if reward_signal == 0.0:
            return

        base = self._lr * float(lr_scale) * reward_signal

        if reward_signal > 0:
            # 良い方向づけ → alignment↑ / openness↑
            da = base * 0.6
            do = base * 0.4
            state.user_alignment += da
            state.openness += do
            deltas["user_alignment"] += da
            deltas["openness"] += do

        else:
            # reward < 0 → safety↑, stability↑（慎重になる）
            ds = -base * 0.4
            db = -base * 0.6
            state.stability += ds
            state.safety_bias += db
            deltas["stability"] += ds
            deltas["safety_bias"] += db

    # --------------------------------------------------------

    def _clip_state(self, state: ValueState) -> None:
        """[-limit, +limit] へ収める"""
        for k, v in state.to_dict().items():
            if v > self._limit:
                setattr(state, k, self._limit)
            elif v < -self._limit:
                setattr(state, k, -self._limit)

    # --------------------------------------------------------

    def _store_snapshot_if_supported(
        self,
        *,
        db: Any,
        user_id: Optional[str],
        state: ValueState,
        deltas: Dict[str, float],
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
    ) -> None:
        """
        PersonaDB が store_value_snapshot を実装している場合のみ保存。
        """
        if db is None or not hasattr(db, "store_value_snapshot"):
            return

        payload = {
            "user_id": user_id,
            "state": state.to_dict(),
            "delta": deltas,
            "meta": {
                "trace_id": (getattr(req, "metadata", None) or {}).get("_trace_id"),
                "request_preview": (req.message or "")[:80],
                "memory_pointer_count": len(memory.pointers),
                "identity_topic_label": identity.identity_context.get("topic_label"),
            },
        }

        try:
            db.store_value_snapshot(**payload)
        except Exception:
            # OS 全体を止めない
            pass
