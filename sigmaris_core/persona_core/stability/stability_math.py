from __future__ import annotations

import hashlib
import math
from typing import Any, Dict, Iterable, Tuple


def _safe_float(v: Any) -> float:
    try:
        return float(v)
    except Exception:
        return 0.0


def value_vector(state: Any) -> Dict[str, float]:
    if hasattr(state, "to_dict"):
        d = state.to_dict() or {}
        return {str(k): _safe_float(v) for k, v in d.items() if isinstance(v, (int, float, str))}
    return {}


def trait_vector(state: Any) -> Dict[str, float]:
    return value_vector(state)


def euclid(d1: Dict[str, float], d2: Dict[str, float]) -> float:
    keys = set(d1.keys()) | set(d2.keys())
    s = 0.0
    for k in keys:
        s += (float(d1.get(k, 0.0)) - float(d2.get(k, 0.0))) ** 2
    return float(math.sqrt(s))


def js_like(p: Iterable[float], q: Iterable[float]) -> float:
    # Lightweight divergence proxy (not a strict JS divergence; good enough for stability heuristics)
    p = [max(0.0, _safe_float(x)) for x in p]
    q = [max(0.0, _safe_float(x)) for x in q]
    if not p or not q or len(p) != len(q):
        return 0.0
    sp = sum(p) or 1.0
    sq = sum(q) or 1.0
    p = [x / sp for x in p]
    q = [x / sq for x in q]
    m = [(a + b) * 0.5 for a, b in zip(p, q)]

    def _kl(a: list[float], b: list[float]) -> float:
        s = 0.0
        for ai, bi in zip(a, b):
            if ai <= 0.0 or bi <= 0.0:
                continue
            s += ai * math.log(ai / bi)
        return float(s)

    return float(0.5 * _kl(p, m) + 0.5 * _kl(q, m))


def identity_distance(
    *,
    value1: Dict[str, float],
    value2: Dict[str, float],
    trait1: Dict[str, float],
    trait2: Dict[str, float],
    narrative_meta1: Dict[str, Any],
    narrative_meta2: Dict[str, Any],
    self_meta1: Dict[str, Any],
    self_meta2: Dict[str, Any],
    wV: float = 0.45,
    wS: float = 0.20,
    wN: float = 0.20,
    wM: float = 0.15,
) -> float:
    dv = euclid(value1, value2)
    ds = euclid(trait1, trait2)

    n1 = float(narrative_meta1.get("fragmentation_entropy", 0.0)) + float(narrative_meta1.get("identity_uncertainty_entropy", 0.0))
    n2 = float(narrative_meta2.get("fragmentation_entropy", 0.0)) + float(narrative_meta2.get("identity_uncertainty_entropy", 0.0))
    dn = abs(n1 - n2)

    m1 = float(self_meta1.get("coherence_score", 0.0)) + float(self_meta1.get("noise_level", 0.0))
    m2 = float(self_meta2.get("coherence_score", 0.0)) + float(self_meta2.get("noise_level", 0.0))
    dm = abs(m1 - m2)

    return float(wV * dv + wS * ds + wN * dn + wM * dm)


def fingerprint(payload: Dict[str, Any]) -> str:
    raw = repr(sorted(payload.items())).encode("utf-8", errors="ignore")
    return hashlib.sha256(raw).hexdigest()

