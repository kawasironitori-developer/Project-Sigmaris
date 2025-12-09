# persona_core/types/message.py
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal, List
import time

Role = Literal["user", "assistant", "system", "system_user", "meta"]

@dataclass
class Message:
    role: Role
    content: str
    timestamp: float = field(default_factory=lambda: time.time())
    tags: List[str] = field(default_factory=list)