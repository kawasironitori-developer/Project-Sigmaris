# sigmaris-core/persona_core/__init__.py

"""
Sigmaris Persona OS 完全版のパッケージルート。

外部からは基本的に PersonaController を通して利用する。
"""

from .controller.persona_controller import PersonaController

__all__ = ["PersonaController"]