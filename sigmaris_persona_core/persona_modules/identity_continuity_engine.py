# sigmaris_persona_core/persona_modules/identity_continuity_engine.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import time
import re

from ..types import Message


@dataclass
class IdentityAnchor:
    """
    「アイデンティティの手がかり」1件分。

    - ts:   記録時刻（epoch秒）
    - text: アンカーとして使うテキスト（要約 or 抜粋）
    - kind: anchor の種類（"topic" / "self" / "ref" など）
    - meta: デバッグ・UI用メタ情報
    """
    ts: float
    text: str
    kind: str = "topic"
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class IdentityContinuityEngine:
    """
    Identity Continuity（文脈的一貫性）モジュール v0.2

    PersonaOS からの使われ方：
      - process() 内で identity.update(incoming)
      - identity_hint = identity.get_hint()

    目的：
      「前に話してた〇〇の件だけど」というときに、
      その「〇〇」を軽量に思い出すための“アンカー”を管理する。

    設計方針：
      - 完全な長期記憶検索ではなく、直近〜中期の「象徴的な断片」を保持
      - 役割は「ヒントを返す」ことであって、完全な要約ではない
      - DB（MemoryDB）に依存しない純ローカルモジュール
    """

    # 保持するアンカーのリスト（古いものから順に）
    anchors: List[IdentityAnchor] = field(default_factory=list)

    # 最大保持件数
    max_anchors: int = 32

    # アンカー候補の最低文字数
    min_length: int = 20

    # 「自分」「変化」「方向性」などアイデンティティ寄りの語
    self_keywords: List[str] = field(
        default_factory=lambda: [
            "私",
            "自分",
            "俺",
            "僕",
            "わたし",
            "将来",
            "これから",
            "方向",
            "変わった",
            "変えたい",
            "今の自分",
            "昔の自分",
            "居場所",
        ]
    )

    # 「前に話してた〜」「さっきの件」など参照表現
    ref_keywords: List[str] = field(
        default_factory=lambda: [
            "前に話してた",
            "この前の",
            "さっきの件",
            "前に言ってた",
            "前回の",
            "前の話",
            "さっきの話",
            "あの件",
        ]
    )

    # ============================================================
    #  Internal helpers
    # ============================================================

    def _normalize(self, text: str) -> str:
        """改行・余分なスペースを潰して軽く正規化。"""
        if not isinstance(text, str):
            text = str(text or "")
        t = text.strip()
        t = re.sub(r"\s+", " ", t)
        return t

    # ============================================================
    #  Public API
    # ============================================================

    def update(self, message: Message) -> None:
        """
        新しいメッセージを観測し、「アンカー化するかどうか」を判定して保存。

        ざっくりルール：
          - role == "user" のみ対象
          - 一定以上の長さがある
          - 自己言及 or 方向性 or 参照表現を含む場合は優先的にアンカー
        """
        content = getattr(message, "content", "") or ""
        role = getattr(message, "role", "user")

        if not content or role != "user":
            return

        text = self._normalize(content)

        # 短すぎるものはスキップ
        if len(text) < self.min_length:
            return

        # Message に timestamp があれば尊重、なければ現在時刻
        try:
            ts_attr = getattr(message, "timestamp", None)
            if isinstance(ts_attr, (int, float)):
                now_ts = float(ts_attr)
            else:
                now_ts = time.time()
        except Exception:
            now_ts = time.time()

        # 種類判定
        kind = "topic"
        meta: Dict[str, Any] = {"raw_length": len(text)}

        if any(k in text for k in self.ref_keywords):
            kind = "ref"
        elif any(k in text for k in self.self_keywords):
            kind = "self"

        # アンカー用の短い抜粋を作る（先頭 80〜120 文字）
        snippet = text
        max_len = 120
        if len(snippet) > max_len:
            snippet = snippet[: max_len - 3] + "..."

        # 直前のアンカーと全く同じならノイズとしてスキップ
        if self.anchors and self.anchors[-1].text == snippet:
            return

        anchor = IdentityAnchor(
            ts=now_ts,
            text=snippet,
            kind=kind,
            meta=meta,
        )

        self._push_anchor(anchor)

    # ------------------------------------------------------------

    def get_hint(self) -> Optional[Dict[str, Any]]:
        """
        PersonaDecision.debug["identity_hint"] に渡すヒント構造を返す。

        戻り値の例：
          {
            "last": { "text": "...", "kind": "self", "ts": 1730000000.0 },
            "recent_self": [...],
            "anchor_count": 7,
          }

        PersonaOS 側では「None かどうか」だけを見ることもあるが、
        UI/デバッグ向けにある程度構造化して返す。
        """
        if not self.anchors:
            return None

        last = self.anchors[-1]

        # 直近 N 件のうち self/ref 系だけを軽くまとめる
        recent_self: List[Dict[str, Any]] = []
        for a in reversed(self.anchors):
            if len(recent_self) >= 5:
                break
            if a.kind in ("self", "ref"):
                recent_self.append(
                    {
                        "text": a.text,
                        "kind": a.kind,
                        "ts": a.ts,
                    }
                )

        return {
            "last": {
                "text": last.text,
                "kind": last.kind,
                "ts": last.ts,
            },
            "recent_self": recent_self,
            "anchor_count": len(self.anchors),
        }

    # ============================================================
    #  Internal
    # ============================================================

    def _push_anchor(self, anchor: IdentityAnchor) -> None:
        """
        アンカーをキューに追加し、max_anchors を超えたら古いものから削る。
        """
        self.anchors.append(anchor)
        if len(self.anchors) > self.max_anchors:
            overflow = len(self.anchors) - self.max_anchors
            if overflow > 0:
                # 古い順に詰まっているので先頭から drop
                self.anchors = self.anchors[overflow:]