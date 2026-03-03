from __future__ import annotations

from typing import Any, Dict

from .roleplay_character_policy_types import RoleplayCharacterPolicy
from .roleplay_character_policies.registry import get_character_policy


def _norm_str(v: Any) -> str:
    s = str(v) if v is not None else ""
    return s.strip().lower()


def get_roleplay_character_policy(metadata: Dict[str, Any]) -> RoleplayCharacterPolicy:
    md = metadata if isinstance(metadata, dict) else {}
    chat_mode = _norm_str(md.get("chat_mode"))
    if chat_mode != "roleplay":
        return RoleplayCharacterPolicy(enabled=False)

    character_id = _norm_str(md.get("character_id"))
    # If the client injected an explicit persona prompt, keep core-side steering minimal
    # to avoid "prompt tug-of-war" in strict roleplay mode.
    has_external_persona = False
    try:
        ps = md.get("persona_system")
        has_external_persona = bool(isinstance(ps, str) and ps.strip())
    except Exception:
        has_external_persona = False

    if not character_id:
        return RoleplayCharacterPolicy(
            enabled=True,
            character_id="",
            disable_naturalness_injection=bool(has_external_persona),
            stop_memory_injection=bool(has_external_persona),
        )

    # ---- Per-character policies (extend over time) ----
    p = get_character_policy(character_id, has_external_persona)
    if p is not None:
        return p

    return RoleplayCharacterPolicy(
        enabled=True,
        character_id=character_id,
        disable_naturalness_injection=bool(has_external_persona),
        stop_memory_injection=bool(has_external_persona),
    )
