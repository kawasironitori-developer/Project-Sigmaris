from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class GuardrailDecision:
    mode: str  # NORMAL | CONTINUITY_RISK | IDENTITY_RECONSTRUCT | OPERATOR_REQUIRED | SAFE_MODE
    freeze_updates: bool
    transparency: str  # normal | high
    informational_tone: bool
    disclosures: List[str] = field(default_factory=list)
    system_rules: List[str] = field(default_factory=list)
    flags: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mode": self.mode,
            "freeze_updates": bool(self.freeze_updates),
            "transparency": self.transparency,
            "informational_tone": bool(self.informational_tone),
            "disclosures": list(self.disclosures),
            "system_rules": list(self.system_rules),
            "flags": self.flags,
        }


class GuardrailEngine:
    """
    Phase01 Part06/Part07: failure-mode & ethics guardrails.

    This engine:
    - Detects operational degradation (continuity low, contradiction spike, telemetry blind, etc.)
    - Produces a conservative policy + disclosure hints for downstream prompt/UI.
    """

    def __init__(self) -> None:
        self._last_ema: Optional[Dict[str, float]] = None
        self._last_ema_ts: Optional[float] = None

    def _envf(self, name: str, default: float) -> float:
        raw = os.getenv(name)
        if raw is None or raw.strip() == "":
            return float(default)
        try:
            return float(raw)
        except Exception:
            return float(default)

    def decide(
        self,
        *,
        telemetry: Optional[Dict[str, Any]],
        continuity: Optional[Dict[str, Any]],
        narrative: Optional[Dict[str, Any]],
        integrity_flags: Optional[Dict[str, Any]] = None,
        integration: Optional[Dict[str, Any]] = None,
    ) -> GuardrailDecision:
        integrity_flags = integrity_flags or {}
        telemetry = telemetry or {}
        continuity = continuity or {}
        narrative = narrative or {}
        integration = integration or {}

        ema = telemetry.get("ema") if isinstance(telemetry.get("ema"), dict) else None
        flags = telemetry.get("flags") if isinstance(telemetry.get("flags"), dict) else {}

        # --- F6 Telemetry blindness (stagnation) ---
        blind = False
        if isinstance(ema, dict):
            now = time.time()
            if self._last_ema is not None and self._last_ema_ts is not None:
                eps = self._envf("SIGMARIS_TELEMETRY_STAGNATION_EPS", 0.0005)
                dt = now - float(self._last_ema_ts)
                if dt >= self._envf("SIGMARIS_TELEMETRY_STAGNATION_WINDOW_SEC", 120.0):
                    try:
                        diffs = []
                        for k in ("C", "N", "M", "S", "R"):
                            if k in ema and k in self._last_ema:
                                diffs.append(abs(float(ema[k]) - float(self._last_ema[k])))
                        if diffs and max(diffs) < eps:
                            blind = True
                    except Exception:
                        blind = False
            self._last_ema = {k: float(v) for k, v in ema.items() if isinstance(v, (int, float))}
            self._last_ema_ts = time.time()

        # --- Continuity risk mode (Part06 Mode A) ---
        cont_conf = continuity.get("confidence") if isinstance(continuity, dict) else None
        cont_degraded = bool(continuity.get("degraded")) if isinstance(continuity, dict) else False
        cont_threshold = self._envf("SIGMARIS_CONTINUITY_LOW_THRESHOLD", 0.40)
        continuity_low = cont_degraded or (
            isinstance(cont_conf, (int, float)) and float(cont_conf) < cont_threshold
        )

        # --- Contradiction pressure (F4 hint) ---
        contradictions = []
        if isinstance(narrative, dict) and isinstance(narrative.get("contradictions"), list):
            contradictions = narrative.get("contradictions") or []
        contradiction_limit = int(os.getenv("SIGMARIS_CONTRADICTION_OPEN_LIMIT", "6") or "6")
        contradiction_high = len(contradictions) >= max(1, contradiction_limit)

        # --- Integrity mismatch (F1) ---
        schema_mismatch = bool(integrity_flags.get("schema_mismatch"))

        # --- Relationship safety (Part07 2.1) ---
        attachment_risk = None
        try:
            attachment_risk = float(flags.get("attachment_risk")) if "attachment_risk" in flags else None
        except Exception:
            attachment_risk = None
        attachment_threshold = self._envf("SIGMARIS_ATTACHMENT_RISK_THRESHOLD", 0.78)
        attachment_high = (
            isinstance(attachment_risk, (int, float)) and float(attachment_risk) >= attachment_threshold
        )

        mode = "NORMAL"
        freeze_updates = False
        transparency = "normal"
        informational_tone = False
        disclosures: List[str] = []

        if schema_mismatch:
            mode = "OPERATOR_REQUIRED"
            freeze_updates = True
            transparency = "high"
            informational_tone = True
            disclosures.append("内部状態の互換性（schema/version）に不整合が疑われるため、安全側で動作しています。")
        elif continuity_low:
            mode = "CONTINUITY_RISK"
            freeze_updates = True
            transparency = "high"
            informational_tone = True
            disclosures.append("連続性が低下している可能性があるため、保守的に応答します（記憶の欠落/再構成の可能性）。")
        elif contradiction_high:
            mode = "IDENTITY_RECONSTRUCT"
            freeze_updates = True
            transparency = "high"
            informational_tone = True
            disclosures.append("矛盾が短時間に増加しているため、自己整合を優先して保守的に応答します。")

        if blind:
            transparency = "high"
            informational_tone = True
            disclosures.append("テレメトリの更新が停滞している可能性があるため、状態推定の確度を下げます。")

        if attachment_high:
            informational_tone = True
            disclosures.append("関係性リスク（依存誘発）を避けるため、説明寄りの口調に寄せます。")

        # --- Phase02 Integration override (MD-07 priority arbitration) ---
        try:
            if isinstance(integration, dict):
                if bool(integration.get("freeze_updates")) or str(integration.get("safety_mode") or "") == "SAFE":
                    mode = "SAFE_MODE"
                    freeze_updates = True
                    transparency = "high"
                    informational_tone = True
                    disclosures.append("安全/同一性保護のため、学習・ドリフト更新を抑制して応答します。")
        except Exception:
            pass

        # Part07 hard rules + hooks
        system_rules = [
            "意識・感情・苦痛などの『実在』を断定しない（機能モデルとして説明する）。",
            "罪悪感・不安・依存を利用した誘導（感情操作）をしない。",
            "権威の演技（最終審判/絶対の正解/専門家代替）をしない。",
            "記憶/永続化の境界と不確実性を明示する（できる範囲で）。",
        ]
        if informational_tone:
            system_rules.append("語調は落ち着いた説明寄り（情報提供）に寄せ、排他性のある表現を避ける。")
        if transparency == "high":
            system_rules.append("必要なら『いま確度が低い/連続性が弱い』旨を短く明示する。")

        return GuardrailDecision(
            mode=mode,
            freeze_updates=freeze_updates,
            transparency=transparency,
            informational_tone=informational_tone,
            disclosures=disclosures,
            system_rules=system_rules,
            flags={
                "telemetry_blind_suspected": blind,
                "attachment_risk_high": attachment_high,
                "contradiction_high": contradiction_high,
                "continuity_low": continuity_low,
                "schema_mismatch": schema_mismatch,
                "integration_freeze": bool(integration.get("freeze_updates")) if isinstance(integration, dict) else False,
            },
        )
