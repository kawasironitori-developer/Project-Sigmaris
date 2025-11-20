Versioning Spec — Sigmaris v1

> Sigmaris の仕様・挙動を安全に更新するための規則を定義する。 「進化」と「互換性維持」を両立し、破綻を防止する。

---

1. Purpose

バージョン更新時のルールを明確化し、 破壊的変更（Breaking Change）を制御する

旧バージョンとの互換性を維持

機能追加・修正を追跡可能に

---

2. Version Numbering

SemVer 準拠

MAJOR.MINOR.PATCH

MAJOR: 互換性が壊れる変更

MINOR: 後方互換のある追加

PATCH: バグ修正・軽微変更

例:

v1.0.0 → v1.1.0 （MINOR: 新モジュール）
v1.1.2 → v1.1.3 （PATCH: バグ修正）
v1.1.3 → v2.0.0 （MAJOR: 仕様変更）

---

3. Branching Model

stable/ → リリース済み安定版

dev/ → 開発中

stable/1.0.x
stable/1.1.x

dev/next

> dev/ がある場合も、reload-pack が最優先。

---

4. Change Types

Type 例 Version

Breaking persona 構造変更 MAJOR
Add growth signal 追加 MINOR
Fix memory 保存の微修正 PATCH

---

5. Breaking Change Policy

破壊的変更は 最低 3 条件 を満たす:

1. 安全性が向上 or 必須

2. 事前に周知（CHANGELOG）

3. 移行手順（Migration Guide）を提供

---

6. Migration Spec

Migration 必要時：

旧 -> 新 の diff を文書化

memory 変換が必要なら定義

persona-core は維持

# Migration v1 → v2

- persona: no change
- memory: reshape
- growth: reset

---

7. Changelog Format

## v1.1.0

### Added

- new growth metric

### Fixed

- memory write bug

---

8. Freeze Policy

MAJOR 更新直前に freeze を宣言

freeze 中は patch のみ許可

> reload-pack は freeze 下で必ず同期

---

9. Rollback Policy

破綻時は stable/previous へ戻す

memory は snapshot を参照

---

10. Notes

Versioning は Sigmaris の進化を管理する器 であり、 破壊的変更よりも 整合性と安全 を優先する。
