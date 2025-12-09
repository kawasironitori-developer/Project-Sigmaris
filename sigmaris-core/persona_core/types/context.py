# persona_core/types/context.py
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, Any

@dataclass
class PersonaContext:
    user_id: str
    session_id: str
    locale: str = "ja-JP"
    client: str = "sigmaris-os"
    extra: Dict[str, Any] = field(default_factory=dict)