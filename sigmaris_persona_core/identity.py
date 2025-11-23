# sigmaris_persona_core/identity_continuity.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

import re
from datetime import datetime

from persona_db.memory_db import MemoryDB
from .types import Message, PersonaContext


@dataclass
class AnchorItem:
    """
    プロセス内で保持するアンカー情報。
    DB にも写すが、直近のヒントはここから即座に取る。
    """
    label: str
    session_id: Optional[str]
    created_at: datetime
    source: str = "auto"  # "auto" / "explicit" など将来拡張用


@dataclass
class IdentityContinuityEngine:
    """
    「前に話してたあの件だけど？」に対応するための Identity Continuity v2。

    - update(...) で新しい発話から Anchor を抽出
    - Anchor は
        - プロセス内: anchors リスト
        - PersonaDB: identity_events / concepts
      に両方保存される
    - get_hint() で「最後に登録されたアンカーのラベル」を返す
    """

    # 直近アンカー（メモリ上）
    anchors: List[AnchorItem] = field(default_factory=list)

    # どのような発話を「アンカー候補」とみなすかの閾値
    min_length_for_topic: int = 30  # 30文字以上なら「トピックらしい」とみなす
    max_label_length: int = 80     # ラベルとして DB に残す最大長

    def update(
        self,
        message: Message,
        context: PersonaContext,
        db: MemoryDB,
    ) -> None:
        """
        新しい発話を受け取り、必要ならアンカーとして登録する。
        - message: ユーザー or システムからの発話
        - context: user_id / session_id / client など
        - db: ユーザーごとの MemoryDB
        """
        label = self._extract_anchor_label(message.content)
        if not label:
            return

        item = AnchorItem(
            label=label,
            session_id=context.session_id,
            created_at=datetime.utcnow(),
            source="auto",
        )
        self.anchors.append(item)

        # --- PersonaDB への反映: identity_events に記録 ---
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
                "source": "identity_continuity",
            },
        )

        # --- PersonaDB への反映: concepts としてもアップサート ---
        db.store_concept(
            label=label,
            score=1.0,  # v0.1: 固定値。将来は頻度や重要度で重み付け
            occurrences=1,
            meta={
                "source": "identity_anchor",
                "last_session_id": context.session_id,
            },
        )

    # ------------------------------------------------------------------
    # 内部ロジック
    # ------------------------------------------------------------------

    def _extract_anchor_label(self, text: str) -> Optional[str]:
        """
        発話テキストから「アンカーとして使える短いラベル」を抽出する。

        シンプルなヒューリスティック：
        - 以下のいずれかを満たす場合にアンカー候補
          1) 「件」「続き」「前に」「前回」「その後」などのキーワードを含む
          2) 全体文字数が min_length_for_topic 以上（＝何かしら話題っぽい）

        ラベル生成：
        - 改行・余計なスペースを潰して 1 行に
        - max_label_length 文字でカット
        """
        raw = (text or "").strip()
        if not raw:
            return None

        # ① キーワードベース
        markers = [
            "件",
            "続き",
            "前に",
            "前回",
            "その後",
            "あのとき",
            "the last",
            "previous",
            "last time",
        ]
        has_marker = any(m in raw for m in markers)

        # ② 長さベース
        long_enough = len(raw) >= self.min_length_for_topic

        if not (has_marker or long_enough):
            # どちらも満たさない場合はアンカーにしない
            return None

        # 改行・連続空白を潰す
        normalized = re.sub(r"\s+", " ", raw)

        # 最大長でカット（末尾に…を付けるかどうかは任意）
        if len(normalized) > self.max_label_length:
            return normalized[: self.max_label_length].rstrip() + "…"
        return normalized

    # ------------------------------------------------------------------
    # パブリック API
    # ------------------------------------------------------------------

    def get_hint(self) -> Optional[str]:
        """
        PersonaOS から呼ばれ、
        「最後に登録されたアンカーの短い説明」を返す。

        例:
        - "前に話していた Sigmaris OS 設計の続き…"
        - "昨日の“AI誘発性精神病”の考察の件…"
        """
        if not self.anchors:
            return None
        return self.anchors[-1].label

    def debug_anchors(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        デバッグ用: 直近のアンカーを辞書形式で返す。
        /debug やノート用に使える。
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