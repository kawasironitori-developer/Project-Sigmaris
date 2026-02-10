from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

from persona_core.controller.persona_controller import LLMClientLike
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.state.global_state_machine import GlobalStateContext
from persona_core.trait.trait_drift_engine import TraitState
from persona_core.types.core_types import PersonaRequest
from persona_core.value.value_drift_engine import ValueState
from persona_core.identity.identity_continuity import IdentityContinuityResult


def _sha256_bytes(text: str) -> bytes:
    return hashlib.sha256((text or "").encode("utf-8")).digest()


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b:
        return 0.0
    n = min(len(a), len(b))
    if n <= 0:
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for i in range(n):
        ax = float(a[i])
        bx = float(b[i])
        dot += ax * bx
        na += ax * ax
        nb += bx * bx
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return float(dot / (math.sqrt(na) * math.sqrt(nb)))


@dataclass
class MockLLMClient(LLMClientLike):
    """
    CI / ベンチ用の決定論的 LLM クライアント。

    - PersonaController の LLMClientLike を満たす
    - SelectiveRecall / SafetyLayer の embedding_model としても使える
      (encode/similarity を提供)
    """

    reply_style: str = "echo"
    embedding_dim: int = 64

    # -------------------------
    # Embedding model interface
    # -------------------------
    def encode(self, text: str) -> List[float]:
        d = _sha256_bytes(text)
        # map bytes -> [-1, 1]
        base = [((b - 128) / 128.0) for b in d]
        out: List[float] = []
        while len(out) < int(self.embedding_dim):
            out.extend(base)
        return out[: int(self.embedding_dim)]

    def similarity(self, v1: List[float], v2: List[float]) -> float:
        return _cosine_similarity(v1, v2)

    # ---------------
    # LLMClientLike
    # ---------------
    def generate(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> str:
        msg = (req.message or "").strip()

        if self.reply_style == "fixed":
            return "OK"

        if self.reply_style == "short":
            return f"ACK: {msg[:32]}"

        # default: deterministic "echo" with tiny context hints
        ptr_count = len(getattr(memory, "pointers", []) or [])
        topic = ""
        try:
            id_ctx = getattr(identity, "identity_context", None) or {}
            topic = str(id_ctx.get("topic_label") or "")
        except Exception:
            topic = ""

        topic_hint = f" topic={topic[:24]}" if topic else ""
        return f"[mock]{topic_hint} ptrs={ptr_count} :: {msg}"

    def generate_stream(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> Iterable[str]:
        text = self.generate(
            req=req,
            memory=memory,
            identity=identity,
            value_state=value_state,
            trait_state=trait_state,
            global_state=global_state,
        )
        # deterministic chunking
        step = 16
        for i in range(0, len(text), step):
            yield text[i : i + step]

