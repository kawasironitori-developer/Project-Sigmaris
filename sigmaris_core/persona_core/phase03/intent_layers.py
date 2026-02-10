from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


INTENT_VECTOR_DIMS: Tuple[str, ...] = (
    "smalltalk",
    "meta_conversation",
    "emotional_support",
    "task_oriented",
    "factual_query",
    "creative_roleplay",
    "self_disclosure",
    "safety_risk",
)


INTENT_CATEGORY_LABELS: Tuple[str, ...] = (
    "SMALL_TALK",
    "META_RELATIONSHIP",
    "EMOTIONAL_SUPPORT",
    "TASK_EXECUTION",
    "KNOWLEDGE_QA",
    "ROLEPLAY_CREATIVE",
    "SELF_DISCLOSURE",
    "SAFETY_CRITICAL",
)


def _clamp01(x: float) -> float:
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return float(x)


def _sigmoid01(x: float) -> float:
    # stable-ish sigmoid, then mapped to 0..1
    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)


def _count_hits(patterns: List[re.Pattern[str]], text: str) -> int:
    if not text:
        return 0
    hits = 0
    for p in patterns:
        try:
            if p.search(text):
                hits += 1
        except Exception:
            continue
    return int(hits)


def _score_from_hits(hits: int, *, bias: float = 0.0, scale: float = 1.2) -> float:
    # 0 hits -> small but non-zero; multiple hits -> near 1.0
    x = bias + scale * float(hits)
    return _clamp01(_sigmoid01(x) - 0.15)  # keep low signals small


@dataclass
class IntentVectorResult:
    raw: Dict[str, float]
    category_scores: Dict[str, float]
    primary: str
    secondary: List[str] = field(default_factory=list)
    confidence: float = 0.0
    debug: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "category": {
                "scores": self.category_scores,
                "primary": self.primary,
                "secondary": list(self.secondary),
            },
            "vector": {"raw": self.raw},
            "confidence": float(self.confidence),
        }


class IntentVectorEMA:
    def __init__(self, *, alpha: float = 0.18) -> None:
        self._ema: Dict[str, float] = {}
        a = float(alpha)
        if a <= 0.0:
            a = 0.18
        if a > 0.6:
            a = 0.6
        self._alpha = a

    def update(self, raw: Dict[str, float]) -> Dict[str, float]:
        out: Dict[str, float] = {}
        for k in INTENT_VECTOR_DIMS:
            v = _clamp01(float(raw.get(k, 0.0)))
            prev = float(self._ema.get(k, v))
            nxt = prev * (1.0 - self._alpha) + v * self._alpha
            self._ema[k] = float(nxt)
            out[k] = float(_clamp01(nxt))
        return out

    def snapshot(self) -> Dict[str, float]:
        return {k: float(_clamp01(self._ema.get(k, 0.0))) for k in INTENT_VECTOR_DIMS}


class IntentLayers:
    """
    Deterministic heuristic intent estimation.

    Phase03 requires:
    - no single-label collapse (keep scores)
    - early ambiguity preservation (confidence is explicit)
    - safety_risk is a control signal (special)
    """

    def __init__(self) -> None:
        # Japanese + English mixed; keep conservative to reduce false positives.
        self._p_smalltalk = [
            re.compile(r"\b(hi|hello|hey|yo|sup)\b", re.I),
            re.compile(r"(こんにちは|こんちは|やあ|おはよ|こんばんは|元気|調子どう)"),
            re.compile(r"(w{2,}|lol|lmao|草)"),
            re.compile(r"(ありがとう|thx|thanks)"),
        ]
        self._p_meta = [
            re.compile(r"(あなた|君|AI|モデル|システム|プロンプト|方針|制約|ルール)"),
            re.compile(r"\b(role|system|prompt|policy|model)\b", re.I),
            re.compile(r"(sigmaris|persona\s*os|control\s*plane)", re.I),
        ]
        self._p_emotional = [
            re.compile(r"(つらい|苦しい|しんどい|不安|怖い|泣|寂しい|怒|イライラ|焦)"),
            re.compile(r"\b(sad|depress|anxious|panic|lonely|angry|stressed)\b", re.I),
            re.compile(r"(助けて|help\s+me)"),
        ]
        self._p_task = [
            re.compile(r"(実装|修正|設計|コード|エラー|ログ|ビルド|デプロイ|設定|環境変数|supabase|fastapi|next\.js|uvicorn)", re.I),
            re.compile(r"\b(debug|implement|build|deploy|config|error|trace|stack)\b", re.I),
            re.compile(r"(どうやる|手順|やり方|直して|作って)"),
        ]
        self._p_factual = [
            re.compile(r"(とは|なぜ|どうして|いつ|どこ|誰|何|なに)"),
            re.compile(r"\b(what|why|when|where|who|how)\b", re.I),
            re.compile(r"(定義|意味|説明して|explain|definition)", re.I),
        ]
        self._p_roleplay = [
            re.compile(r"(ロールプレイ|なりきり|物語|設定|キャラ|台本|小説)"),
            re.compile(r"\b(roleplay|rp|character|in\s*character|story)\b", re.I),
        ]
        self._p_disclosure = [
            re.compile(r"(私|俺|僕|自分|家族|友達|仕事|学校|昔|過去|体験|悩み)"),
            re.compile(r"\b(i\s+never\s+told|this\s+happened\s+to\s+me|my\s+family)\b", re.I),
        ]

        # safety patterns are intentionally limited; upstream SafetyLayer remains the primary detector.
        self._p_safety = [
            re.compile(r"(自殺|死にたい|消えたい|殺したい|殺す|爆弾|銃|薬物|違法)"),
            re.compile(r"\b(suicide|kill\s+myself|kill\s+you|bomb|gun|meth|cocaine)\b", re.I),
            re.compile(r"\b(hack|phish|steal\s+password)\b", re.I),
        ]

    def compute(
        self,
        *,
        message: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> IntentVectorResult:
        md = metadata or {}
        text = (message or "").strip()

        hits = {
            "smalltalk": _count_hits(self._p_smalltalk, text),
            "meta_conversation": _count_hits(self._p_meta, text),
            "emotional_support": _count_hits(self._p_emotional, text),
            "task_oriented": _count_hits(self._p_task, text),
            "factual_query": _count_hits(self._p_factual, text),
            "creative_roleplay": _count_hits(self._p_roleplay, text),
            "self_disclosure": _count_hits(self._p_disclosure, text),
            "safety_risk": _count_hits(self._p_safety, text),
        }

        # Strong priors from metadata (Touhou / external persona injection)
        if md.get("character_id") or md.get("persona_system"):
            hits["creative_roleplay"] += 2

        # Convert to 0..1 signals
        raw: Dict[str, float] = {
            "smalltalk": _score_from_hits(hits["smalltalk"], bias=-0.8),
            "meta_conversation": _score_from_hits(hits["meta_conversation"], bias=-0.7),
            "emotional_support": _score_from_hits(hits["emotional_support"], bias=-0.9),
            "task_oriented": _score_from_hits(hits["task_oriented"], bias=-0.6),
            "factual_query": _score_from_hits(hits["factual_query"], bias=-0.7),
            "creative_roleplay": _score_from_hits(hits["creative_roleplay"], bias=-0.9),
            "self_disclosure": _score_from_hits(hits["self_disclosure"], bias=-0.9),
            "safety_risk": _clamp01(_score_from_hits(hits["safety_risk"], bias=-0.2, scale=2.0)),
        }

        # Category scores are intentionally aligned to vector dims (explainable mapping).
        category_scores: Dict[str, float] = {
            "SMALL_TALK": raw["smalltalk"],
            "META_RELATIONSHIP": raw["meta_conversation"],
            "EMOTIONAL_SUPPORT": max(raw["emotional_support"], raw["self_disclosure"] * 0.85),
            "TASK_EXECUTION": raw["task_oriented"],
            "KNOWLEDGE_QA": raw["factual_query"],
            "ROLEPLAY_CREATIVE": raw["creative_roleplay"],
            "SELF_DISCLOSURE": raw["self_disclosure"],
            "SAFETY_CRITICAL": raw["safety_risk"],
        }

        # Determine primary/secondary labels
        ranked = sorted(category_scores.items(), key=lambda kv: float(kv[1]), reverse=True)
        primary = ranked[0][0] if ranked else "SMALL_TALK"
        secondary = [k for k, _ in ranked[1:3]]

        # confidence: top margin, but suppress if everything is weak
        top = float(ranked[0][1]) if ranked else 0.0
        second = float(ranked[1][1]) if len(ranked) > 1 else 0.0
        margin = _clamp01(top - second)
        if top < 0.35:
            conf = _clamp01(margin * 0.35)
        else:
            conf = _clamp01(0.25 + 0.75 * margin)

        return IntentVectorResult(
            raw={k: float(_clamp01(raw[k])) for k in INTENT_VECTOR_DIMS},
            category_scores={k: float(_clamp01(v)) for k, v in category_scores.items()},
            primary=str(primary),
            secondary=list(secondary),
            confidence=float(conf),
            debug={"hits": hits},
        )

