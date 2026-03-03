from __future__ import annotations

from ..roleplay_character_policy_types import RoleplayCharacterPolicy


def get_policy(has_external_persona: bool) -> RoleplayCharacterPolicy:
    return RoleplayCharacterPolicy(
        enabled=True,
        character_id="suwako",
        disable_naturalness_injection=bool(has_external_persona),
        stop_memory_injection=bool(has_external_persona),
        max_questions_per_turn=2,
        remove_interview_prompts=True,
        max_tokens_cap=820,
        quality_mode="roleplay",
    )

