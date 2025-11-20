architecture.md

概要

本ドキュメントは、シグマリス v1/v2 構成における全モジュールの外形的アーキテクチャを示す。内部の詳細実装ではなく、コンポーネント同士の関係性・I/O 連結性・責務分離を明示する。

---

構造層（レイヤリング）

┌─────────────────────────┐
│ UI Layer (Frontend) │
│ - Web UI │
│ - Stream Chat View │
│ - Personality Controls (Optional) │
└───────────────▲─────────────────┘
│ REST/WebSocket
│
┌────────────────┴───────────────────┐
│ Application Layer │
│ - orchestrator │
│ - memory-manager │
│ - safety-guard │
│ - persona-engine (v2) │
│ - state-machine (v2) │
└───────────────▲───────────────────┘
│
│ BPA / Structured IO
│
┌────────────────┴───────────────────┐
│ LLM Access Layer │
│ - llm-core │
│ - prompt-composer │
└───────────────▲───────────────────┘
│
│ Provider API Call
│
┌────────────────┴───────────────────┐
│ External Provider │
│ - OpenAI GPT-5 (or higher) │
└────────────────────────────────────┘

---

モジュール責務

UI Layer

入出力の最前面

JSON/構造化ログ可視化

会話ストリームの呈示

Application Layer

orchestrator: モジュール間を統括

memory-manager: 会話履歴・短期/長期状態

safety-guard: NG/脱線/境界安全管理

persona-engine (v2): キャラ設定の統合

state-machine (v2): 内部状態遷移

LLM Access Layer

プロンプト組成（prompt-composer）

OpenAI API 経由のコール

---

データフロー（DFD）

User → UI → orchestrator → prompt-composer → llm-core → OpenAI
↑ ↓
safety-guard ← memory-manager ←

---

永続対象

会話ログ（軽量）

状態スナップショット（任意）

---

通信方式

HTTP/REST

WebSocket（stream）

---

設計方針

各モジュールは疎結合

依存方向は UI→App→LLM の一方向性

v2 persona/state-machine は Optional 拡張

---

注意

「人格」「感情」は演算的表現でありクオリアは持たない

safety は上位モジュールで最優先

---
