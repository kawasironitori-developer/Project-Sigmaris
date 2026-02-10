# Sigmaris Persona OS — Phase01 実装対応表

このファイルは `create-doc/phase01/*.md`（仕様）と、現行コード（`sigmaris_core/persona_core` / UI）を対応付けて、
不足差分を実装タスクとして切り出すためのメモです。

## 仕様（Phase01）→ 現行実装の対応

### Part 01 Philosophy and System Goal
- **対応**: `sigmaris_core/persona_core/types/core_types.py`（`PersonaRequest` などの「外部制御層」前提）
- **対応**: `sigmaris_core/persona_core/controller/persona_controller.py`（Identity/Memory/Drift/FSM/LLMの分離）
- **不足**: “Functional Subjective Equivalence” を評価する **定量指標（L5）** が未整備

### Part 02 Architecture Layer Definition（L1..L6）
- **対応（概ね）**
  - L1 Identity: `sigmaris_core/persona_core/identity/identity_continuity.py`
  - L2 Persona/Value/Trait: `sigmaris_core/persona_core/value/*`, `sigmaris_core/persona_core/trait/*`
  - L3 Memory Orchestration: `sigmaris_core/persona_core/memory/*`
  - L6 Integration: `sigmaris_core/persona_core/server_persona_os.py`
- **不足**
  - L4 Narrative & Continuity: “自己物語・矛盾登録・テーマ抽出”の専用層が未整備
  - L5 Evaluation/Telemetry: C/N/M/S/R などの評価指標が未整備

### Part 03 E Layer Specification（Ego Continuity）
- **対応（部分）**
  - “Identity continuity” は存在（`IdentityContinuityEngineV3`）
  - “Trait/Value anchoring” は存在（Value/Trait drift）
- **不足**
  - `EgoContinuityState` 相当の **統合状態モデル**（versioned state / integrity flags / contradiction register）
  - セッション開始/終了のライフサイクル（batch更新・再構成・信念値のEMAなど）

### Part 04–05 Memory/Narrative/Value + Telemetry
- **対応（部分）**
  - memory lifecycleの一部（select/merge）
  - value/trait driftの抑制（clamp/decay）
  - trace/meta で可観測性の土台
- **不足**
  - Narrative Theme Engine（自己テーマ抽出・強化・安定性）
  - Telemetry（C/N/M/S/R）算出・保存・しきい値での自動ガード

### Part 06 Failure Modes & Guardrail
- **対応（部分）**
  - SafetyLayer / GlobalStateMachine / trace による最小限のガードは存在
- **不足**
  - スキーマバージョン/整合性チェック（F1）
  - 破損/欠損時の復旧モード（Continuity Risk / Identity Reconstruction など）
  - “矛盾爆発”の検知とライフサイクル（F4）

### Part 07 Operational Ethics & UI Constraints
- **対応（部分）**
  - “システムは意識を主張しない”という前提はREADME/実装に組み込みやすい
  - `meta` を返しているので透明性パネルに繋げられる
- **不足**
  - “連続性低下の明示”や “能力境界” をUIで一貫して表示する設計
  - R(t)（依存リスク）などの観測→抑制（トーン制御）ループ

## 実装方針（段階導入）

1) **L5 Telemetry（C/N/M/S/R）** をまず追加（最小の観測軸を確立）
2) **L4 Narrative/Contradiction** を “追記ログ + 圧縮” として追加（既存のMemory/Identityに干渉しすぎない）
3) Failure mode の “検知→セーフモード” を FSM/Prompt へ反映
4) UIに透明性パネル（状態/連続性/注意事項）を追加（Part07）

