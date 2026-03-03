from __future__ import annotations

from ..roleplay_character_policy_types import RoleplayCharacterPolicy


def get_policy(has_external_persona: bool) -> RoleplayCharacterPolicy:
    # Koishi often uses short 2-choice prompts; the generic naturalness layer can over-sanitize them.
    return RoleplayCharacterPolicy(
        enabled=True,
        character_id="koishi",
        disable_naturalness_injection=True,
        max_questions_per_turn=2,
        remove_interview_prompts=False,
        force_quality_pipeline=True,
        quality_mode="roleplay",
        max_tokens_cap=520,
        stop_memory_injection=True,
    )
