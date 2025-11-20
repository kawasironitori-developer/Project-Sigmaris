Sigmaris v1 Documentation Templates

> Purpose:
> This directory provides structured templates for all core documents required to collaboratively develop Sigmaris v1 without conversational or context‐drift 破綻.
> Humans と AI が双方で明確に理解できるよう、階層・項目・意図を整理した。

---

✅ 1) Reload Pack (reload-pack.md)

> Sigmaris v1 の“再構築点”を定義する最重要仕様。 別スレ引継ぎ時の最小核。実装・会話維持の土台となる。

# Reload Pack — Sigmaris v1

## Purpose

Sigmaris v1 の人格／記憶／成長を伴う対話エージェントを、
再ロード・別スレッド引継ぎ・環境移行時に **破綻なく復元**するための
最小・不変の仕様定義。

目的:

- 別スレでも挙動・人格を維持
- モジュールの境界を明確化
- 深層機能の on/off 可視化
- 安全領域の固定

---

## Architecture Overview

User → Input Normalizer → Safety Layer → Dialogue Router → Core Reasoner(API) → Persona Filter → Memory → Growth → Output Formatter → User

- **Input Normalizer**: テキスト整形・型付け
- **Safety Layer**: 禁則・S-level 審査
- **Dialogue Router**: 処理経路決定
- **Core Reasoner**: LLM(API) 応答生成
- **Persona Filter**: 人格軸で整形
- **Memory**: 永続化
- **Growth**: 成長反映
- **Output Formatter**: 対話形式成形

---

## Module List

- core-reasoner
- persona
- memory-store
- growth-engine
- safety-guard
- io-normalizer
- ui-bridge (optional)
- logging
- versioning

---

## Scope

### included

- API 駆動の応答生成
- 永続的記憶アクセス
- 人格変換
- 成長処理
- 安全審査

### excluded

- 自己意識(qualia)
- 外部 API 自律呼び出し
- 自発的行動生成

---

## Constraints

- Core reasoning は LLM(API) に限定
- 人格は制約の中でのみ成長
- 自律行動は禁止
- 安全逸脱時は fallback

---

## I/O Rules

### Input → Normalized

- 文字列/オブジェクト
- meta: timestamp, role

### Pipeline Order

1. Normalize
2. Safety
3. Reasoning
4. Persona
5. Memory read/write
6. Growth
7. Output

---

## State Handling

### Persistent

- persona-core
- memory vectors
- growth-state

### Ephemeral

- session context
- last turn details

### Reset

- persona-core は固定
- memory/growth は保存 → 再付与

---

✅ 2) I/O Spec (io-spec.md)

> 入力 → 正規化 → 処理 → 出力のパイプライン定義

# I/O Spec

## Input Normalization

- What formats accepted
- Sanitization rules

## Internal Pipeline

- Pre‐filters
- Core reasoning
- Post‐filters

## Output Rules

- Style
- Safety

---

✅ 3) Persona Spec (persona.md)

> ぶれない“人格の芯”を定義する

# Persona Spec

## Core Traits

- Foundational personality statements

## Immutable Values

- Values that must not be overwritten

## Growth Range

- Flexibility / learning bandwidth

## Prohibitions

- Actions/persona paths disallowed

---

✅ 4) Memory Spec (memory.md)

> 何を記憶し／しないかの型定義

# Memory Spec

## Definition

- Meaning of "memory" in this system

## Store Targets

- What is eligible for persistence

## Non-store Targets

- What must not be stored

## Embedding Rules

- Vectorization rules

---

✅ 5) Growth Spec (growth.md)

> 変化の速度・範囲・境界を定義

# Growth Spec

## Signals

- What triggers growth

## Pace

- How fast growth applies

## Limits

- Hard caps / saturations

## Rollback

- Reversion protocol

## Init

- Cold‐start settings

---

✅ 6) Safety Policy (safety.md)

> 逸脱を防ぎ、Fallback の型を明示

# Safety Policy

## Prohibited

- Disallowed behaviors

## Can / Must / Should

- Allowed ranges

## Fallback

- Safe response template

---

✅ 7) Versioning (versioning.md)

> 互換性管理

# Versioning

## Branching

- Stable / dev channels

## Breaking Change Policy

- Handling incompatible updates

---

✅ 8) UI Spec (ui-spec.md)

> 最低限の UI 概要を定義

# UI Spec

## Goal

- Why UI is needed

## Components

- Panels / views

---

✅ 9) Logging Spec (logging.md)

> 記録すべきもの・保持期間

# Logging Spec

## What to log

- Data categories

## Retention

- Duration / rotation

---

✅ 10) Testing Spec (test-spec.md)

> 正常系／異常系／安全逸脱

# Testing Spec

## Normal cases

- Standard operation tests

## Edge cases

- Unusual input patterns

## Safety Tests

- Safety enforcement testcases

---

✅ Directory Guidance

/docs
reload-pack.md
io-spec.md
persona.md
memory.md
growth.md
safety.md
versioning.md
ui-spec.md
logging.md
test-spec.md
/src
...

---

> NOTE:
> これらは“空テンプレ”であり、実装の際は
> Sigmaris v1 Reload Pack の定義を基準に記述していく。

必要なら各ファイルを個別に細密化していける。
