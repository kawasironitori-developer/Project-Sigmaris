from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable, Optional


def _parse_env_line(line: str) -> Optional[tuple[str, str]]:
    s = line.strip()
    if not s or s.startswith("#"):
        return None
    if "=" not in s:
        return None

    key, value = s.split("=", 1)
    key = key.strip()
    if not key:
        return None

    value = value.strip()
    # strip quotes
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        value = value[1:-1]

    return key, value


def load_env_file(path: Path, *, override: bool = False) -> bool:
    """
    .env を読み込み、環境変数に反映する（外部依存なし）。

    - 既に設定済みの環境変数は、`override=True` のときのみ上書き。
    - 見つからなければ False。
    """
    try:
        if not path.exists() or not path.is_file():
            return False

        for raw in path.read_text(encoding="utf-8").splitlines():
            parsed = _parse_env_line(raw)
            if not parsed:
                continue
            k, v = parsed
            if not override and os.getenv(k) is not None:
                continue
            os.environ[k] = v

        return True
    except Exception:
        return False


def load_dotenv(*, override: bool = False) -> None:
    """
    代表的な場所から .env を探索して読み込む。
    """
    cwd = Path.cwd()
    repo_root = Path(__file__).resolve().parents[3]
    candidates: Iterable[Path] = (
        # Prefer repo root `.env` so the monorepo can be configured from a single place.
        repo_root / ".env",  # repo root/.env
        repo_root / "sigmaris_core" / ".env",  # sigmaris_core/.env (fallback)
        cwd / ".env",
        cwd / "sigmaris_core" / ".env",
        Path(__file__).resolve().parents[2] / ".env",  # sigmaris_core/.env (fallback)
    )

    for p in candidates:
        if load_env_file(p, override=override):
            # 最初に見つかったものを採用
            return
