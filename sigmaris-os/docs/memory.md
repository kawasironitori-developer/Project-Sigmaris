Memory Spec — Sigmaris v1

> “記憶”の定義・範囲・保存方法・制御を規定する。 人格と成長を支えるが、暴走しないよう厳密に管理する。

---

1. Purpose

Sigmaris が参照・保存する「記憶」を、 曖昧ではなく 型＋境界 を伴って確立する。

目的:

記憶の対象／非対象を明確化

永続層と揮発層を分離

情報更新と成長ロジックの接続

破綻／肥大化を防ぐ

---

2. Definition

本システムにおける「記憶 (memory)」とは:

事実・対話・状態の抽象保持 を指す

≠ 感情の一貫保持

≠ 自己欲求

≠ 自意識/クオリア

> 注: 記憶は「経験データ」。人格そのものではない。

---

3. Memory Types

Type Scope Persistence Example

short-term 現在セッション ✕ 直前の話題
long-term 永続ストア ◯ 好み・事実
meta 対話履歴の抽象 △ 傾向

---

4. Store Targets (保存対象)

反復して指摘される嗜好

明確な事実関係

長期的なテーマ

安全関連設定

例:

- User likes calm tone
- Previous chosen model: persona.base

---

5. Non-store Targets (非保存)

一時的な感情

不確実な推測

個人情報（PII）

有害・依存を誘発する内容

> 理由: 安全上の drift を防ぐため。

---

6. Data Model

{
"facts": {
"key": "value"
},
"preferences": {},
"topics": [],
"growth": {}
}

※ JSON / SQLite / KV どれでも OK（実装依存）

---

7. Embedding Rules

文脈をベクトル化して保存してもよい

埋め込みは 検索のための道具であり人格ではない

---

8. Update Rules

価値があると判定された時のみ保存

成長処理を経由

上書きは慎重

if relevance > threshold:
save()

---

9. Forget Rules

劣化 / 関連性低下で削除可

手動 reset 可能

---

10. Reset Protocol

facts / preferences / topics をクリア

persona-core は保持

growth-state は optional

---

11. Memory + Persona Boundary

記憶は人格を直接変更しない

人格変更は growth-engine が統制

> persona = 指針 / memory = 経験

---

12. Safety Notes

PII 禁止

有害カテゴリは即 discard

安全 context を優先

---

13. Export Format

{
"version": "1.0",
"facts": {...},
"preferences": {...},
"topics": [...]
}

---

14. Notes

記憶は 人格の補助であり、 独立した欲求エンジンではない。
