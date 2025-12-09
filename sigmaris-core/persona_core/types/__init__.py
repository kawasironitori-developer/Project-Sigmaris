# persona_core/types/__init__.py
from __future__ import annotations

# ---- message / context / memory ----
from .message import Message
from .context import PersonaContext
from .memory_entry import MemoryEntry

# ---- core types ----
from .core_types import (
    PersonaState,
    MemoryPointer,
    TraitVector,
    RewardSignal,
    IdentityHint,
    StateTransitionTrace,
    DriftSnapshot,
    PersonaRequest,
    PersonaDecision,
    PersonaDebugInfo,
    PersonaResponse,
)

__all__ = [
    # message/context
    "Message",
    "PersonaContext",
    "MemoryEntry",

    # core
    "PersonaState",
    "MemoryPointer",
    "TraitVector",
    "RewardSignal",
    "IdentityHint",
    "StateTransitionTrace",
    "DriftSnapshot",
    "PersonaRequest",
    "PersonaDecision",
    "PersonaDebugInfo",
    "PersonaResponse",
]