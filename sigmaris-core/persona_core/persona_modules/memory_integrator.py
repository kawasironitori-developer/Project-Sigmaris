# sigmaris_persona_core/persona_modules/memory_integrator.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Dict, Any
import time

from ..types import MemoryEntry
from ..config import MemoryConfig


@dataclass
class MemoryIntegrator:
    """
    記憶統合レイヤ v0.2

    - 「短期（short）」「中期（mid）」の 2 ストラタをプロセス内で保持
    - long-term は persona_db（episodes / concepts）側に委譲
    - PersonaOS からは:

        self.memory.feed(
            MemoryEntry(
                ts=incoming.timestamp,
                kind="short" | "mid",
                content=...,
                meta={...},
            )
        )

      のように呼び出されることを想定。

    役割:
      - 時間窓に応じて short / mid バッファをメンテナンス
      - UI / デバッグ用に snapshot() で状態を返す
      - long-term は MemoryDB.store_episode / store_concept 側が担当
    """

    config: MemoryConfig

    # プロセス内の短期・中期メモリバッファ
    short_buffer: List[MemoryEntry] = field(default_factory=list)
    mid_buffer: List[MemoryEntry] = field(default_factory=list)

    # ============================================================
    # Feed
    # ============================================================
    def feed(self, entry: MemoryEntry) -> None:
        """
        1 つの MemoryEntry を受け取り、short / mid のストラタを更新する。

        kind は現状 "short" / "mid" を想定しているが、
        多少ラフに扱えるよう、防御的に実装。
        """
        now = time.time()

        # kind 自体は今のところ挙動には使わないが、
        # 将来の分岐用に一応抜き出しておく
        kind = getattr(entry, "kind", "short") or "short"
        _ = kind  # reserved for future use

        # short レイヤに追加
        self.short_buffer.append(entry)
        # mid レイヤにも積む（mid 専用エントリも short と同様に蓄積）
        self.mid_buffer.append(entry)

        # 古い short / mid を時間窓から外す
        self._gc_short(now=now)
        self._gc_mid(now=now)

    # ============================================================
    # ガーベジコレクション（時間窓でのトリミング）
    # ============================================================
    def _gc_short(self, now: float) -> None:
        """
        short_window_sec を超えたエントリを short_buffer から除去。
        """
        window = float(self.config.short_window_sec)
        threshold = now - window

        new_buf: List[MemoryEntry] = []
        for e in self.short_buffer:
            try:
                ts = float(getattr(e, "ts", 0.0))
            except Exception:
                # ts が取れないものは念のため残しておく（ログ用途など）
                new_buf.append(e)
                continue

            if ts >= threshold:
                new_buf.append(e)

        self.short_buffer = new_buf

    def _gc_mid(self, now: float) -> None:
        """
        mid_window_sec を超えたエントリを mid_buffer から除去。
        """
        window = float(self.config.mid_window_sec)
        threshold = now - window

        new_buf: List[MemoryEntry] = []
        for e in self.mid_buffer:
            try:
                ts = float(getattr(e, "ts", 0.0))
            except Exception:
                new_buf.append(e)
                continue

            if ts >= threshold:
                new_buf.append(e)

        self.mid_buffer = new_buf

    # ============================================================
    # Snapshot / 可視化用ヘルパ
    # ============================================================
    def snapshot(self) -> Dict[str, Any]:
        """
        UI / デバッグ用に、現在の short / mid メモリの概況を返す。

        内容全文ではなく、
        - 件数
        - 直近 N 件の簡易情報
        だけ返す。
        """

        def _to_view(entries: List[MemoryEntry], limit: int = 8) -> List[Dict[str, Any]]:
            view: List[Dict[str, Any]] = []
            for e in entries[-limit:]:
                try:
                    view.append(
                        {
                            "ts": float(getattr(e, "ts", 0.0)),
                            "kind": getattr(e, "kind", "short"),
                            "content_preview": (getattr(e, "content", "") or "")[:64],
                            "meta": getattr(e, "meta", {}) or {},
                        }
                    )
                except Exception:
                    continue
            return view

        return {
            "short": {
                "count": len(self.short_buffer),
                "entries": _to_view(self.short_buffer),
            },
            "mid": {
                "count": len(self.mid_buffer),
                "entries": _to_view(self.mid_buffer),
            },
        }