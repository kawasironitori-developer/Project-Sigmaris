# sigmaris_persona_core/identity_continuity.py
# （旧 Identity Continuity：アンカー抽出モジュール）
# Persona OS 完全版では persona_core/identity/ にある上位Engineから参照される

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from datetime import datetime
import re

# --- import を完全版構造に合わせて修正 ---
from persona_db.memory_db import MemoryDB
from persona_core.types import Message, PersonaContext


@dataclass
class AnchorItem:
    """
    「アンカー」と呼ばれる “話題を示す短いラベル” を保持する。
    PersonaDB の identity_events にも保存される。
    """
    label: str
    session_id: Optional[str]
    created_at: datetime
    source: str = "auto"  # 将来的に "explicit" などへ拡張可能


@dataclass
class IdentityContinuityEngine:
    """
    旧 Identity Continuity（アンカー抽出エンジン）

    - ユーザー発話から anchor label（話題のラベル）を抽出
    - PersonaDB に identity_event として保存
    - Concept としてもスコア付きで記録
    - 直近のアンカーを get_hint() で返す

    Persona OS 完全版では：
    - PersonaDB の identity_snapshot / continuity_engine による
      上位レイヤ（新 Identity Continuity Engine）に統合される。
    - このモジュールは “アンカー抽出サブ層” として保持する。
    """

    anchors: List[AnchorItem] = field(default_factory=list)

    # トピック判定閾値
    min_length_for_topic: int = 30
    max_label_length: int = 80

    def update(
        self,
        message: Message,
        context: PersonaContext,
        db: MemoryDB,
    ) -> None:
        """
        新しい発話を見て、アンカーとして登録すべきなら登録する。
        """
        label = self._extract_anchor_label(message.content)
        if not label:
            return

        # --- Anchor をプロセス内に追加 ---
        item = AnchorItem(
            label=label,
            session_id=context.session_id,
            created_at=datetime.utcnow(),
            source="auto",
        )
        self.anchors.append(item)

        # --- PersonaDB に identity_event として登録 ---
        db.store_identity_event(
            kind="anchor",
            delta_calm=0.0,
            delta_empathy=0.0,
            delta_curiosity=0.0,
            reward=0.0,
            meta={
                "label": label,
                "session_id": context.session_id,
                "client": context.client,
                "source": "identity_continuity_legacy",
            },
        )

        # --- Concept としても登録（かつアップサート）---
        db.store_concept(
            label=label,
            score=1.0,  # 今後は頻度・重要度に応じて調整される
            occurrences=1,
            meta={
                "source": "identity_anchor",
                "last_session_id": context.session_id,
            },
        )

    # ------------------------------------------------------------------
    # 内部処理：アンカー抽出ロジック
    # ------------------------------------------------------------------

    def _extract_anchor_label(self, text: str) -> Optional[str]:
        """
        発話から「アンカーにできるラベル」を抽出する。

        条件：
        1) 「件」「続き」「前に」などの marker を含む
        2) または発話が 30字以上（＝話題性が高い）
        """
        raw = (text or "").strip()
        if not raw:
            return None

        markers = [
            "件", "続き", "前に", "前回", "その後", "あのとき",
            "the last", "previous", "last time",
        ]

        has_marker = any(m in raw for m in markers)
        long_enough = len(raw) >= self.min_length_for_topic

        if not (has_marker or long_enough):
            return None

        # 改行・連続空白を 1スペースに統一
        normalized = re.sub(r"\s+", " ", raw)

        # 長すぎる場合はカット
        if len(normalized) > self.max_label_length:
            return normalized[: self.max_label_length].rstrip() + "…"
        return normalized

    # ------------------------------------------------------------------
    # パブリック API
    # ------------------------------------------------------------------

    def get_hint(self) -> Optional[str]:
        """
        最後に登録されたアンカーのラベルを返す。
        Persona OS の応答補助に利用される。
        """
        if not self.anchors:
            return None
        return self.anchors[-1].label

    def debug_anchors(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        直近の anchor を辞書形式で返す（デバッグ用）
        """
        items = self.anchors[-limit:]
        return [
            {
                "label": a.label,
                "session_id": a.session_id,
                "created_at": a.created_at.isoformat(),
                "source": a.source,
            }
            for a in items
        ]