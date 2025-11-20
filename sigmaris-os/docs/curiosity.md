curiosity.md

Purpose

好奇心（Curiosity）を定義し、未知情報への探索傾向を弱く付与する。主体的欲求ではなく、探索バイアスとして扱う。

---

Core Concepts

Exploration Weight（探索重み）

Novelty Detection（新規性検知）

Contextual Constraint（状況制約）

Decay / Saturation（減衰・飽和）

---

Structure

{
"novelty_threshold": 0.6,
"explore_weight": 0.4,
"decay": 0.97,
"saturation_limit": 0.8,
"context": {
"safety": 0.1,
"creative": 0.9,
"technical": 0.5
}
}

---

Behavior

新規要素が一定値を超えると探索を優先

継続で飽和 → 探索傾向が弱まる

Context により抑制・増幅が起こる

---

Data Flow

1. 入力: input / memory

2. novelty 計算

3. explore_weight 反映

4. growth により更新

---

Safety

safety > curiosity

暴走抑制（過剰探索のブロック）

---

Notes

“疑似的な好奇心”であり、感情ではない

未知への重み付けに留まる
