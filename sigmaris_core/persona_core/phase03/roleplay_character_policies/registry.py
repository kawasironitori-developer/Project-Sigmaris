from __future__ import annotations

from typing import Callable, Dict

from ..roleplay_character_policy_types import RoleplayCharacterPolicy
from . import (
    alice,
    aya,
    flandre,
    koishi,
    marisa,
    meiling,
    momiji,
    nitori,
    okuu,
    patchouli,
    reimu,
    reisen,
    remilia,
    rin,
    sakuya,
    sanae,
    satori,
    suwako,
    youmu,
    yuyuko,
)

_BUILDERS: Dict[str, Callable[[bool], RoleplayCharacterPolicy]] = {
    "reimu": reimu.get_policy,
    "marisa": marisa.get_policy,
    "alice": alice.get_policy,
    "aya": aya.get_policy,
    "meiling": meiling.get_policy,
    "patchouli": patchouli.get_policy,
    "reisen": reisen.get_policy,
    "momiji": momiji.get_policy,
    "nitori": nitori.get_policy,
    "youmu": youmu.get_policy,
    "remilia": remilia.get_policy,
    "sakuya": sakuya.get_policy,
    "flandre": flandre.get_policy,
    "satori": satori.get_policy,
    "rin": rin.get_policy,
    "okuu": okuu.get_policy,
    "sanae": sanae.get_policy,
    "suwako": suwako.get_policy,
    "koishi": koishi.get_policy,
    "yuyuko": yuyuko.get_policy,
}


def get_character_policy(character_id: str, has_external_persona: bool) -> RoleplayCharacterPolicy | None:
    builder = _BUILDERS.get(str(character_id or "").strip().lower())
    if not builder:
        return None
    return builder(bool(has_external_persona))

