# sigmaris_persona_core/concepts/clusterer.py
from __future__ import annotations

from typing import List, Dict, Any, Optional

from persona_db.memory_db import MemoryDB
from .extractor import LLMConceptExtractor, ConceptCandidate


class ConceptClusterer:
    """
    PersonaDB に蓄積された episodes などを元に、
    LLM を使って「概念クラスタ」を抽出し、concepts テーブルに反映する。

    v0.1 の役割:
      - 外部からテキスト群（episodes.content のリスト）を渡される
      - LLMConceptExtractor で概念候補を作る
      - MemoryDB.store_concept() で永続化する
    """

    def __init__(
        self,
        db: MemoryDB,
        extractor: LLMConceptExtractor,
        max_batch_chars: int = 4000,
    ) -> None:
        self.db = db
        self.extractor = extractor
        self.max_batch_chars = max_batch_chars

    # ============================================================
    # パブリック API
    # ============================================================

    def update_from_texts(
        self,
        texts: List[str],
        extra_meta: Optional[Dict[str, Any]] = None,
    ) -> int:
        """
        任意のテキスト群から概念クラスタを再抽出し、concepts テーブルを更新する。

        戻り値:
            実際に保存した Concept 数
        """
        normalized = self._truncate_batch(texts)
        if not normalized:
            return 0

        candidates: List[ConceptCandidate] = self.extractor.extract_from_texts(normalized)
        if not candidates:
            return 0

        meta_base = extra_meta or {}

        for c in candidates:
            meta = {
                "kind": c.kind,
                "evidence": c.evidence,
            }
            meta.update(meta_base)

            # persona_db.memory_db.MemoryDB.store_concept を利用
            self.db.store_concept(
                label=c.label,
                score=c.score,
                occurrences=1,
                meta=meta,
            )

        return len(candidates)

    # ------------------------------------------------------------
    # （オプション）最近の episodes から自動抽出するヘルパー
    # ------------------------------------------------------------

    def update_from_recent_episodes(
        self,
        limit: int = 80,
        extra_meta: Optional[Dict[str, Any]] = None,
    ) -> int:
        """
        persona-db の episodes テーブルから直近の content を取り出し、
        そこから概念抽出を行うヘルパー。

        MemoryDB は episodes を読むための専用メソッドは持っていないが、
        .conn を直接叩いている（内部実装に依存するので将来ラップ予定）。
        """
        cur = self.db.conn.cursor()  # type: ignore[attr-defined]

        cur.execute(
            """
            SELECT content
            FROM episodes
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = cur.fetchall()
        texts = [str(r["content"]) for r in rows if r["content"]]

        return self.update_from_texts(texts, extra_meta=extra_meta)

    # ============================================================
    # 内部: バッチの長さ制御
    # ============================================================

    def _truncate_batch(self, texts: List[str]) -> List[str]:
        """
        LLM に渡す総文字数が極端に膨らまないように、
        おおざっぱに max_batch_chars までに切り詰める。
        """
        result: List[str] = []
        total = 0

        for t in texts:
            if not t:
                continue
            t_str = str(t)
            length = len(t_str)
            if total + length > self.max_batch_chars:
                # 溢れそうな場合は残りの枠だけ切り出して終了
                remain = self.max_batch_chars - total
                if remain <= 0:
                    break
                result.append(t_str[:remain])
                total += remain
                break

            result.append(t_str)
            total += length

        return result