# sigmaris_persona_core/persona_modules/contradiction_manager.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Dict, Any
import re
import time

from ..types import Message


@dataclass
class ContradictionManager:
    """
    矛盾検出モジュール（PersonaOS 完全版）

    役割:
      - feed(): 直近のユーザーメッセージ（最大 max_history 件）を蓄積
      - detect(): 直前メッセージと今回メッセージを比較し、態度や意図の急反転を検出

    PersonaOS での利用想定:

        self.contradiction.feed(incoming)
        info = self.contradiction.detect(incoming)

        info = {
            "flags": {
                "contradiction": bool,
            },
            "note": str | None,
        }

    ※ v0.2 では「軽量ヒューリスティック」のみ。将来的な強化（系列矛盾など）は
       このインターフェースを維持したまま拡張する前提。
    """

    # 保存履歴（content のみ）
    history: List[str] = field(default_factory=list)
    timestamps: List[float] = field(default_factory=list)

    # 最大保持件数
    max_history: int = 32

    # 軽量肯定/否定パターン（normalize 後のテキストに対して検索）
    POSITIVE: List[str] = field(default_factory=lambda: [
        r"そう思う",
        r"賛成",
        r"いいと思う",
        r"そうだね",
        r"はい",
        r"ok",
        r"同意",
        r"なるほど",
        r"理解した",
        r"わかる",
        r"好き",
        r"興味ある",
    ])

    NEGATIVE: List[str] = field(default_factory=lambda: [
        r"そう思わない",
        r"違う",
        r"反対",
        r"よくない",
        r"だめ",
        r"無理",
        r"いや",
        r"納得できない",
        r"嫌い",
        r"わからない",
    ])

    # ============================================================
    # normalize
    # ============================================================
    def _normalize(self, text: str) -> str:
        """
        ゆらぎを落とす軽量正規化。

        - 前後の空白トリム
        - 改行・連続空白を削除
        - 全角/半角の単純な混在をある程度吸収
        - 句読点・一般的な終端記号を除去
        """
        if not text:
            return ""
        t = text.lower().strip()
        # 空白類を削る
        t = re.sub(r"[ \t\r\n　]+", "", t)
        # 句読点・記号を削る
        t = re.sub(r"[。,.!?！？…、]", "", t)
        return t

    # ============================================================
    # Feed
    # ============================================================
    def feed(self, message: Message) -> None:
        """
        incoming Message から content を取り出し、履歴に積む。

        - role は問わないが、通常は user/system_user を想定。
        - timestamp があれば尊重し、なければ現在時刻を使う。
        """
        content = getattr(message, "content", "") or ""
        if not content:
            return

        self.history.append(content)

        ts_raw = getattr(message, "timestamp", None)
        try:
            ts = float(ts_raw) if ts_raw is not None else time.time()
        except Exception:
            ts = time.time()
        self.timestamps.append(ts)

        # 上限管理（古いものから削除）
        if len(self.history) > self.max_history:
            overflow = len(self.history) - self.max_history
            if overflow > 0:
                self.history = self.history[overflow:]
                self.timestamps = self.timestamps[overflow:]

    # ============================================================
    # Detect
    # ============================================================
    def detect(self, message: Message) -> Dict[str, Any]:
        """
        「直前の履歴メッセージ」と今回の message を比較して
        明確な矛盾（態度の急反転・意図の逆転など）があれば検出する。

        戻り値:
            {
              "flags": { "contradiction": bool },
              "note": str | None,
            }
        """
        new_raw = getattr(message, "content", "") or ""
        new_text = self._normalize(new_raw)

        # 比較対象となる「前のメッセージ」がない場合は矛盾なし
        if len(self.history) < 2 or not new_text:
            return {
                "flags": {"contradiction": False},
                "note": None,
            }

        # feed() で既に incoming を積んでいる前提なので、
        # 比較対象は history[-2]（ひとつ前の発話）とする
        last_raw = self.history[-2]
        last_text = self._normalize(last_raw)

        # history があっても last_text が空なら矛盾判定はスキップ
        if not last_text:
            return {
                "flags": {"contradiction": False},
                "note": None,
            }

        # ========================================================
        # 1. 肯定 → 否定 / 否定 → 肯定 の急反転
        # ========================================================
        pos_new = any(re.search(p, new_text) for p in self.POSITIVE)
        neg_new = any(re.search(n, new_text) for n in self.NEGATIVE)
        pos_last = any(re.search(p, last_text) for p in self.POSITIVE)
        neg_last = any(re.search(n, last_text) for n in self.NEGATIVE)

        if (pos_last and neg_new) or (neg_last and pos_new):
            return {
                "flags": {"contradiction": True},
                "note": f"態度の急反転（『{last_raw}』→『{new_raw}』）",
            }

        # ========================================================
        # 2. 単語レベルの反転（できる/できない・行く/行かない など）
        # ========================================================
        pairs = [
            ("できる", "できない"),
            ("行く", "行かない"),
            ("やる", "やらない"),
            ("続ける", "やめる"),
        ]

        for pos, neg in pairs:
            if (pos in last_text and neg in new_text) or \
               (neg in last_text and pos in new_text):
                return {
                    "flags": {"contradiction": True},
                    "note": f"意図の逆転（{pos}/{neg}）",
                }

        # ========================================================
        # 3. 否定語の急増
        #    ※ 完全な NLP ではなくヒューリスティック
        # ========================================================
        neg_markers = ["違う", "いや", "無理", "否定", "そんなことない", "だめ", "嫌"]

        last_neg_count = sum(m in last_text for m in neg_markers)
        new_neg_count = sum(m in new_text for m in neg_markers)

        if (new_neg_count - last_neg_count) >= 3:
            return {
                "flags": {"contradiction": True},
                "note": "否定語の急増",
            }

        # ========================================================
        # 4. 文面の多くが一致しつつ “ない” だけ増える
        #    → 典型的な 軽否定 → 強否定 への反転パターン
        # ========================================================
        # 例:
        #   last: "たぶんできると思う"
        #   new : "たぶんできると思わない / できないかもしれない"
        if last_text and new_text.startswith(last_text) and ("ない" in new_text):
            return {
                "flags": {"contradiction": True},
                "note": "文面一致からの否定方向への反転",
            }

        # ========================================================
        # Default: 矛盾なし
        # ========================================================
        return {
            "flags": {"contradiction": False},
            "note": None,
        }