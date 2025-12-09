# sigmaris_persona_core/persona_modules/__init__.py

from .contradiction_manager import ContradictionManager
from .silence_manager import SilenceManager
from .intuition_engine import IntuitionEngine
from .value_drift_engine import ValueDriftEngine
from .memory_integrator import MemoryIntegrator
from .identity_continuity_engine import IdentityContinuityEngine
from .meta_reward_engine import MetaRewardEngine
from .emotion_core import EmotionCore
from .snapshot_builder import SnapshotBuilder

__all__ = [
    "ContradictionManager",
    "SilenceManager",
    "IntuitionEngine",
    "ValueDriftEngine",
    "MemoryIntegrator",
    "IdentityContinuityEngine",
    "MetaRewardEngine",
    "EmotionCore",
    "SnapshotBuilder"
]