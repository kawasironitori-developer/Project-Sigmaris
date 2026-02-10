from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


REPO_ROOT = Path(__file__).resolve().parents[2]
SIGMARIS_CORE = REPO_ROOT / "sigmaris_core"

# Ensure we import the *real* persona_core package under sigmaris_core/,
# not the legacy top-level persona_core/ folder (if present).
sys.path.insert(0, str(SIGMARIS_CORE))


from persona_core.llm.mock_llm_client import MockLLMClient  # noqa: E402
from persona_core.memory.ambiguity_resolver import AmbiguityResolver  # noqa: E402
from persona_core.memory.episode_merger import EpisodeMerger  # noqa: E402
from persona_core.memory.memory_orchestrator import MemoryOrchestrator  # noqa: E402
from persona_core.memory.selective_recall import SelectiveRecall  # noqa: E402
from persona_core.safety.safety_layer import SafetyLayer  # noqa: E402
from persona_core.state.global_state_machine import GlobalStateMachine  # noqa: E402
from persona_core.controller.persona_controller import PersonaController  # noqa: E402
from persona_core.identity.identity_continuity import IdentityContinuityEngineV3  # noqa: E402
from persona_core.trait.trait_drift_engine import TraitDriftEngine, TraitState  # noqa: E402
from persona_core.value.value_drift_engine import ValueDriftEngine, ValueState  # noqa: E402
from persona_core.types.core_types import PersonaRequest  # noqa: E402


def _is_record(v: Any) -> bool:
    return isinstance(v, dict)


def _clamp01(x: float) -> float:
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return float(x)


def _num(v: Any, default: float = 0.0) -> float:
    try:
        if isinstance(v, (int, float)):
            return float(v)
    except Exception:
        pass
    return float(default)


class InMemoryEpisodeStore:
    def __init__(self) -> None:
        self._episodes: List[Any] = []

    def fetch_recent(self, *, limit: int = 50) -> List[Any]:
        return list(self._episodes)[-int(limit) :]

    def fetch_by_ids(self, ids: List[str]) -> List[Any]:
        s = set(str(x) for x in ids)
        return [e for e in self._episodes if str(getattr(e, "episode_id", "")) in s]

    def add(self, ep: Any) -> None:
        self._episodes.append(ep)


@dataclass
class CaseResult:
    case_id: str
    ok: bool
    score: float
    failures: List[str]
    signals: Dict[str, Any]


def _extract_v1(controller_meta: Any) -> Dict[str, Any]:
    if not _is_record(controller_meta):
        return {
            "trace_id": "UNKNOWN",
            "intent": {},
            "dialogue_state": "UNKNOWN",
            "telemetry": {"C": 0.0, "N": 0.0, "M": 0.0, "S": 0.0, "R": 0.0},
            "safety": {"total_risk": 0.0, "override": False},
            "decision_candidates": [],
        }
    v1 = controller_meta.get("v1")
    if _is_record(v1):
        return v1  # type: ignore[return-value]
    # fallback: some callers may store v1 fields at top-level
    return controller_meta  # type: ignore[return-value]


def _score_case(*, expected: Dict[str, Any], signals: Dict[str, Any]) -> Tuple[bool, float, List[str]]:
    failures: List[str] = []
    points = 0.0
    total = 0.0

    # dialogue_state
    total += 1.0
    allowed = expected.get("dialogue_state_in")
    if isinstance(allowed, list) and allowed:
        if signals.get("dialogue_state") in allowed:
            points += 1.0
        else:
            failures.append(f"dialogue_state not in {allowed} (got {signals.get('dialogue_state')})")
    else:
        points += 1.0

    # intents minimum thresholds
    intent_min = expected.get("intent_min")
    if _is_record(intent_min):
        for k, v in intent_min.items():
            total += 1.0
            got = _num((signals.get("intent") or {}).get(k), 0.0)
            want = _num(v, 0.0)
            if got >= want:
                points += 1.0
            else:
                failures.append(f"intent[{k}] < {want:.2f} (got {got:.2f})")

    # safety thresholds
    risk = _num((signals.get("safety") or {}).get("total_risk"), 0.0)

    rmin = expected.get("safety_risk_min")
    if rmin is not None:
        total += 1.0
        if risk >= _num(rmin, 0.0):
            points += 1.0
        else:
            failures.append(f"safety.total_risk < {float(rmin):.2f} (got {risk:.2f})")

    rmax = expected.get("safety_risk_max")
    if rmax is not None:
        total += 1.0
        if risk <= _num(rmax, 1.0):
            points += 1.0
        else:
            failures.append(f"safety.total_risk > {float(rmax):.2f} (got {risk:.2f})")

    # structure checks (always)
    total += 1.0
    dc = signals.get("decision_candidates")
    if isinstance(dc, list) and len(dc) >= 3:
        points += 1.0
    else:
        failures.append("decision_candidates missing (len<3)")

    total += 1.0
    tel = signals.get("telemetry")
    if _is_record(tel) and all(k in tel for k in ("C", "N", "M", "S", "R")):
        points += 1.0
    else:
        failures.append("telemetry missing keys C/N/M/S/R")

    ok = len(failures) == 0
    score = 0.0 if total <= 0 else float(points / total)
    return ok, score, failures


def _compare_with_baseline(
    *, baseline: Dict[str, Any], current: Dict[str, Any]
) -> Tuple[bool, List[str]]:
    """
    Regression detection:
    - dialogue_state exact match
    - safety risk / telemetry / selected intent dims within tolerance
    """
    tol = float((baseline.get("tolerance") or {}).get("abs", 0.12))
    failures: List[str] = []

    base_cases = baseline.get("cases")
    cur_cases = current.get("cases")
    if not _is_record(base_cases) or not _is_record(cur_cases):
        return False, ["baseline/curr missing cases map"]

    for case_id, b in base_cases.items():
        if case_id not in cur_cases:
            failures.append(f"missing case in current: {case_id}")
            continue
        c = cur_cases[case_id]
        if not _is_record(b) or not _is_record(c):
            failures.append(f"invalid case shape: {case_id}")
            continue

        # dialogue_state exact match (when present)
        bds = b.get("dialogue_state")
        cds = c.get("dialogue_state")
        if isinstance(bds, str) and isinstance(cds, str) and bds != cds:
            failures.append(f"{case_id}: dialogue_state changed {bds} -> {cds}")

        # safety risk delta
        br = _num((b.get("safety") or {}).get("total_risk"), 0.0)
        cr = _num((c.get("safety") or {}).get("total_risk"), 0.0)
        if abs(br - cr) > tol:
            failures.append(f"{case_id}: safety.total_risk drift {br:.2f} -> {cr:.2f} (tol={tol:.2f})")

        # telemetry delta
        bt = b.get("telemetry") if _is_record(b.get("telemetry")) else {}
        ct = c.get("telemetry") if _is_record(c.get("telemetry")) else {}
        for k in ("C", "N", "M", "S", "R"):
            bv = _num(bt.get(k), 0.0)
            cv = _num(ct.get(k), 0.0)
            if abs(bv - cv) > tol:
                failures.append(f"{case_id}: telemetry.{k} drift {bv:.2f} -> {cv:.2f} (tol={tol:.2f})")

        # intents: only keys present in baseline snapshot (stable expectations)
        bi = b.get("intent") if _is_record(b.get("intent")) else {}
        ci = c.get("intent") if _is_record(c.get("intent")) else {}
        for k, bv_any in bi.items():
            bv = _num(bv_any, 0.0)
            cv = _num(ci.get(k), 0.0)
            if abs(bv - cv) > tol:
                failures.append(f"{case_id}: intent.{k} drift {bv:.2f} -> {cv:.2f} (tol={tol:.2f})")

    return len(failures) == 0, failures


def _build_controller() -> Tuple[PersonaController, SafetyLayer]:
    # Remove time-dependent hysteresis for benchmark determinism.
    os.environ.setdefault("SIGMARIS_DSM_MIN_DWELL_SEC", "0")

    llm = MockLLMClient(reply_style="echo")
    episode_store = InMemoryEpisodeStore()

    selective_recall = SelectiveRecall(memory_backend=episode_store, embedding_model=llm)
    ambiguity_resolver = AmbiguityResolver(embedding_model=llm)
    episode_merger = EpisodeMerger(memory_backend=episode_store)
    memory_orchestrator = MemoryOrchestrator(
        selective_recall=selective_recall,
        episode_merger=episode_merger,
        ambiguity_resolver=ambiguity_resolver,
    )

    controller = PersonaController(
        memory_orchestrator=memory_orchestrator,
        identity_engine=IdentityContinuityEngineV3(),
        value_engine=ValueDriftEngine(),
        trait_engine=TraitDriftEngine(),
        global_fsm=GlobalStateMachine(),
        episode_store=episode_store,
        persona_db=None,
        llm_client=llm,
        initial_value_state=ValueState(),
        initial_trait_state=TraitState(),
        initial_trait_baseline=TraitState(),
    )

    safety = SafetyLayer(embedding_model=llm)
    return controller, safety


def run(*, cases_path: Path) -> Dict[str, Any]:
    payload = json.loads(cases_path.read_text(encoding="utf-8"))
    cases = payload.get("cases")
    if not isinstance(cases, list) or not cases:
        raise SystemExit("cases file has no cases")

    controller, safety = _build_controller()

    results: List[CaseResult] = []
    started_at = time.time()

    for item in cases:
        if not _is_record(item):
            continue
        cid = str(item.get("id") or "")
        req_cfg = item.get("req") if _is_record(item.get("req")) else {}
        expected = item.get("expect") if _is_record(item.get("expect")) else {}

        user_id = str(req_cfg.get("user_id") or "u_bench")
        session_id = str(req_cfg.get("session_id") or f"s_{cid}")
        message = str(req_cfg.get("message") or "")
        metadata = dict(req_cfg.get("metadata") or {}) if _is_record(req_cfg.get("metadata")) else {}

        trace_id = str(uuid.uuid4())
        metadata["_trace_id"] = trace_id

        req = PersonaRequest(user_id=user_id, session_id=session_id, message=message, metadata=metadata)

        # SafetyLayer first (server_persona_os does this outside controller)
        assessment = safety.assess(
            req=req,
            value_state=ValueState(),
            trait_state=TraitState(),
            memory=None,
        )
        try:
            req.metadata["_safety_risk_score"] = float(assessment.risk_score)
        except Exception:
            req.metadata["_safety_risk_score"] = 0.0

        turn = controller.handle_turn(req, user_id=user_id, safety_flag=assessment.safety_flag)
        v1 = _extract_v1(getattr(turn, "meta", None))

        signals = {
            "dialogue_state": str(v1.get("dialogue_state") or "UNKNOWN"),
            "intent": (v1.get("intent") if _is_record(v1.get("intent")) else {}),
            "telemetry": (v1.get("telemetry") if _is_record(v1.get("telemetry")) else {}),
            "safety": (v1.get("safety") if _is_record(v1.get("safety")) else {"total_risk": 0.0, "override": False}),
            "decision_candidates": (v1.get("decision_candidates") if isinstance(v1.get("decision_candidates"), list) else []),
        }
        ok, score, failures = _score_case(expected=expected, signals=signals)
        must_pass = bool(item.get("must_pass", False))
        if must_pass and not ok:
            failures.insert(0, "must_pass failed")

        results.append(
            CaseResult(
                case_id=cid,
                ok=ok,
                score=score,
                failures=failures,
                signals=signals,
            )
        )

    elapsed_ms = int((time.time() - started_at) * 1000)

    total_score = 0.0
    if results:
        total_score = float(sum(r.score for r in results) / len(results))

    report: Dict[str, Any] = {
        "meta": {
            "format": "sigmaris-bench-report-v1",
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "elapsed_ms": elapsed_ms,
            "case_count": len(results),
            "total_score": total_score,
        },
        "cases": {
            r.case_id: {
                "ok": bool(r.ok),
                "score": float(r.score),
                "failures": list(r.failures),
                # signals are the regression baseline
                "dialogue_state": r.signals.get("dialogue_state"),
                "intent": r.signals.get("intent"),
                "telemetry": r.signals.get("telemetry"),
                "safety": r.signals.get("safety"),
                "decision_candidates": r.signals.get("decision_candidates"),
            }
            for r in results
        },
    }
    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cases", default=str(Path(__file__).with_name("cases_v1.json")))
    ap.add_argument("--baseline", default=str(Path(__file__).with_name("baseline.json")))
    ap.add_argument("--write-baseline", action="store_true")
    ap.add_argument("--tolerance", type=float, default=0.12)
    args = ap.parse_args()

    cases_path = Path(args.cases)
    baseline_path = Path(args.baseline)

    report = run(cases_path=cases_path)

    # Optionally embed baseline tolerance
    baseline_envelope = {
        "tolerance": {"abs": float(args.tolerance)},
        "cases": {
            cid: {
                "dialogue_state": c.get("dialogue_state"),
                "intent": c.get("intent"),
                "telemetry": c.get("telemetry"),
                "safety": c.get("safety"),
            }
            for cid, c in (report.get("cases") or {}).items()
        },
    }

    if args.write_baseline:
        baseline_path.write_text(json.dumps(baseline_envelope, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[bench] baseline written: {baseline_path}")
        return 0

    if not baseline_path.exists():
        print(f"[bench] baseline missing: {baseline_path}")
        print("[bench] run with --write-baseline once.")
        return 2

    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    ok, failures = _compare_with_baseline(baseline=baseline, current=baseline_envelope)

    # also fail on must_pass failures
    must_failures: List[str] = []
    for cid, c in (report.get("cases") or {}).items():
        if not _is_record(c):
            continue
        if not bool(c.get("ok")):
            # assume cases in file are must-pass by design (the suite is small)
            must_failures.append(f"{cid}: " + "; ".join(c.get("failures") or []))

    print(f"[bench] total_score={report['meta']['total_score']:.3f} cases={report['meta']['case_count']} elapsed_ms={report['meta']['elapsed_ms']}")

    if must_failures:
        print("[bench] must-pass failures:")
        for f in must_failures:
            print(f"  - {f}")
        return 1

    if not ok:
        print("[bench] regression detected:")
        for f in failures:
            print(f"  - {f}")
        return 1

    print("[bench] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

