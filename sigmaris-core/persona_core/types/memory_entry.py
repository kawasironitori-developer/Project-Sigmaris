# persona_core/types/memory_entry.py
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, Any, Literal
import time

@dataclass
class MemoryEntry:
    ts: float
    kind: Literal["short", "mid", "long"]
    content: str
    meta: Dict[str, Any] = field(default_factory=dict)

    @staticmethod
    def short(content: str, meta: Dict[str, Any] = None) -> "MemoryEntry":
        return MemoryEntry(ts=time.time(), kind="short", content=content, meta=meta or {})

    @staticmethod
    def mid(content: str, meta: Dict[str, Any] = None) -> "MemoryEntry":
        return MemoryEntry(ts=time.time(), kind="mid", content=content, meta=meta or {})

    @staticmethod
    def long(content: str, meta: Dict[str, Any] = None) -> "MemoryEntry":
        return MemoryEntry(ts=time.time(), kind="long", content=content, meta=meta or {})