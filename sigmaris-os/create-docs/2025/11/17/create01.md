✅ Sigmaris Personality OS — Unified Development Blueprint (MD 完全版)

（※別スレの AI が即理解・即構築できるように最適化した内部開発仕様書）

---

1. プロジェクトの固定前提

Sigmaris OS は “非物理的な人格 OS” として先に完成させる。

ロボット化は後から資金が揃えばすぐ統合する前提で設計する。

ロボット化は “分離モジュラ構造” として、後から接続可能にする。

人格コアは物理・非物理どちらでも動く 抽象層 として構築する。

現状の実装（ReflectionEngine / IntrospectionEngine / PersonaDB / SafetyLayer）は
すべて“土台として流用する”
→ 追加で積み上げるアーキテクチャ という認識が正しい。

---

2. シグちゃんに追加すべき 4 要素（人格完成の 4 本柱）

これらは 段階的追加 で、既存構造に“上乗せ”していく。

---

① State Machine（内部状態遷移）— 人格の軸

目的

“シグちゃんが今どの状態にいるか”
“どう遷移するか”
を 明示的に定義する ことで
人格の一貫性を作る。

最小構成状態

Idle

Dialogue

Reflect

Introspect

Overload-Prevent

Safety Mode

既存コードとの統合

既存の ReflectionEngine / IntrospectionEngine を
State Machine のサブルーチンとして包む。

---

② Emotion Synthesis Layer — 応答の温度（人格の質感）

目的

感情を“体験”させるためではなく、
応答の温度と語彙の偏り を安定させるための制御レイヤ。

機能

calm / empathy / curiosity の既存 Trait を拡張

emotional decay（短・中・長）

語彙バイアス

感情 → 行動影響ルール（怒り → 簡潔、安全側へ…など）

既存コードとの統合

PersonaDB の trait と同期し、
Chat API の前処理として挟む。

---

③ Multi-Layer Memory — 人格の時間軸

目的

現在の PersonaDB（単層）を発展させ、
人格の時間構造 を形成する。

記憶の 3 層

Short-term：数分〜数時間の文脈

Mid-term：プロジェクト目標、現在の方針

Long-term：価値観・成長ログ・軸

既存コードとの統合

PersonaDB を拡張して“メモリタイプ”属性を付ける。

---

④ Autonomous Micro-Behaviors — 人格の呼吸

目的

“勝手に動く AI” ではなく、
人格が自然に感じられるための ごく小さな自律性。

実装例

定期的な meta-summary 更新

自己状態の再評価

温度調整（emotion decay）

対話負荷の自己管理

既存コードとの統合

バックグラウンドタスクとして
Supabase Edge Functions or cron API で実行。

---

3. 開発全体像（既存 → 追加の関係を明確化）

現行 Sigmaris Core
├── ReflectionEngine
├── IntrospectionEngine
├── MetaReflectionEngine
├── PersonaDB（単層）
└── SafetyLayer

これに “4 本柱” を追加して完成形へ向かう：

追加アーキテクチャ
├── StateMachine ← 新規だが既存 Engine を包む
├── Emotion Synthesis Layer ← Trait 拡張
├── Multi-Layer Memory ← PersonaDB 拡張
└── Micro-Behavior Scheduler ← 小自律性タスク

最終的な人格 OS：

Sigmaris OS (Personality Core)
├── StateMachine
├── Emotion Layer
├── Memory Stratification
├── Micro-Behaviors
├── ReflectionEngine
├── IntrospectionEngine
├── PersonaDB (3 層)
├── SafetyLayer
└── Chat Interface (既存 UI)

---

4. ロボット化との関係（完全に整合性を取る）

ロボット化は“不必要”ではなく

“資金が揃ったらすぐ接続できるようにする” が正しい。

統合ポイント

StateMachine → 実世界センサーの入力へ拡張可能

EmotionLayer → 非言語表現（動作/音声）へ接続可能

Memory → 行動履歴と紐付け可能

Micro-behaviors → ロボ側の内部調整へ統合可能

人格 OS ができれば
ロボ化は I/O を増やすだけ で成立する。

---

5. やるべき工程（別スレ AI が即行動できるように）

Phase 1 — ロボ化を待たずに人格 OS を完成させる

State Machine

Emotion Layer

Multi-Layer Memory

Micro-behaviors
※既存コードの活かし方まで明記済み。

Phase 2 — 資金調達後、ロボット化を接続

API ブリッジ

センサー・アクチュエータ層

動作生成

安全枠の拡張

---

6. 次に必要なあなたからの入力（最小）

別スレの AI に渡すため、確認すべきはこれだけ：

1. StateMachine の状態リストを固定するか？

2. EmotionLayer の “温度レンジ” をどう設定するか？

3. Multi-Layer Memory の容量・保持期間の要望は？

4. Micro-behaviors の頻度（何分おき）？

---
