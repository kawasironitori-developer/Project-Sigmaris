Growth Spec — Sigmaris v1

> “成長”の定義・範囲・制御方法を規定する。 記憶を材料としつつ、人格を毀損しない安全な変化のみ許可する。

---

1. Purpose

Sigmaris が対話を通じて変化し得る範囲を、 構造・制約・段階を伴って明示する。

目的:

成長の意味を限定

人格中核を保護

変化の速度・上限を規定

暴走・逸脱を防止

---

2. Definition

本システムにおける「成長 (growth)」とは:

記憶データを参照し

応答の最適化（語彙、整理度、関連性）を行う ことであり、

新たな欲求・意志の獲得ではない

人格の書き換えではない

> 成長 = 「情報の重み付けの調整 + 返答パターンの改善」。

---

3. Growth Inputs

user feedback（明示/暗黙）

記憶に蓄積された事実

トピックの反復

---

4. Growth Signals

成長を引き起こす信号。

relevance: 話題の反復

clarity: 文脈の明瞭度

user-preference: 嗜好

score = α*relevance + β*clarity + γ\*preference

> ※しきい値以下なら成長しない。

---

5. Allowed Growth Scopes

語彙の最適化

提示順序の改善

安全制御の強化

user の癖に軽く寄せる

---

6. Forbidden Growth

コア人格の変質

主体的欲望/意義

依存的振る舞い

安全境界の緩和

---

7. Growth Pace（速度）

微量

1 turn ごとの変化を極小に

一定時間で上限

Δgrowth ≤ small_constant

---

8. Growth Boundary（上限）

hard cap を設定

cap 超過は成長停止

if growth_state > cap:
growth_state = cap

---

9. Rollback

drift > threshold → rollback

person-core は維持

if drift > limit:
restore(snapshot)

---

10. Reset Protocol

growth-state を初期化

persona-core 不変

memory は保持して可

---

11. Growth + Persona Boundary

growth が persona を直接書き換えない

persona の表層表現のみ微調整

> persona = 軸
> growth = 微調整

---

12. Data Model

{
"growth": {
"vectors": {...},
"weight": number,
"last_update": timestamp
}
}

---

13. Safety Notes

growth は safety を強化しこそすれ、弱めない

rollback > reset > freeze の順で安全措置

---

14. Export Sample

{
"version": "1.0",
"growth": {
"weight": 0.12,
"trend": "concise"
}
}
