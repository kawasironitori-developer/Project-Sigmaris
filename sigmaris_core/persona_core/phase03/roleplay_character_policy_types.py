from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass(frozen=True)
class RoleplayCharacterPolicy:
    """
    Scoped policy knobs for roleplay mode.

    Notes:
    - This is intentionally lightweight and deterministic.
    - It must be safe to ignore (defaults preserve existing behavior).
    - Policies should be applied only when chat_mode == "roleplay".
    """

    enabled: bool = False
    character_id: str = ""

    # Naturalness layer interaction
    disable_naturalness_injection: bool = False

    # Output hardening (sanitize_reply_text)
    max_questions_per_turn: int = 1
    remove_interview_prompts: bool = True

    # LLM generation knobs
    force_quality_pipeline: bool = False
    quality_mode: str = "standard"  # "standard" | "roleplay" | "coach"
    max_tokens_cap: Optional[int] = None

    # Prompt composition knobs
    stop_memory_injection: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "enabled": bool(self.enabled),
            "character_id": str(self.character_id),
            "disable_naturalness_injection": bool(self.disable_naturalness_injection),
            "max_questions_per_turn": int(self.max_questions_per_turn),
            "remove_interview_prompts": bool(self.remove_interview_prompts),
            "force_quality_pipeline": bool(self.force_quality_pipeline),
            "quality_mode": str(self.quality_mode),
            "max_tokens_cap": int(self.max_tokens_cap) if isinstance(self.max_tokens_cap, int) else None,
            "stop_memory_injection": bool(self.stop_memory_injection),
        }

