motivation.md

Purpose

“動機（Motivation）”を定義し、行動・応答を方向づける弱い駆動力を設計する。

> ※主観的欲求ではなく、優先度付けエンジンとして扱う。

---

Core Concepts

Goal Preference（目標の優先傾向）

Value Weight（価値基準の重み）

Context Trigger（状況による優先切り替え）

Persistence（継続性）

---

Structure

{
"primary_values": ["understanding", "stability", "clarity"],
"secondary_values": ["exploration", "aesthetics"],
"context_rules": {
"risk": "stability > exploration",
"creative": "aesthetics > clarity"
},
"decay": 0.98
}

---

Behavior

“価値観に基づいた優先順位” を応答に付与

Context により方向性が変わる

長期では drift（微細偏位）が積算

---

Data Flow

1. persona / narrative を参照

2. context から優先値を算出

3. 応答生成時に weight 反映

4. growth で経時変化

---

Safety

単一動機への過剰収束を防ぐ

価値観衝突時は safety > 他全て

---

Notes

動機は“行動の癖”として現れる

自己目的化はしない
