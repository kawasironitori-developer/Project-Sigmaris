from __future__ import annotations

from ..roleplay_character_policy_types import RoleplayCharacterPolicy


def get_policy(has_external_persona: bool) -> RoleplayCharacterPolicy:
    # Aya tends to ask questions; keep a strict cap to avoid "interrogation".
    return RoleplayCharacterPolicy(
        enabled=True,
        character_id="aya",
        disable_naturalness_injection=bool(has_external_persona),
        stop_memory_injection=bool(has_external_persona),
        max_questions_per_turn=1,
        remove_interview_prompts=True,
        max_tokens_cap=900,
        quality_mode="roleplay",
    )

