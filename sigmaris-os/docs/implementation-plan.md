implementation-plan.md — Sigmaris v3

> 目的: 実装の戦略・手順・標準・運用体制を定義し、破綻なく“作れる・回せる”状態にする。

---

1. 技術スタック（推奨）

Runtime: Node.js (LTS)

Lang: TypeScript（サーバ/ツール）、（任意で）Python 小モジュール

Web: Next.js / React（UI）

Store: FS（開発）→ SQLite（小規模本番）→ S3（アーカイブ任意）

Test: Vitest/Jest + Playwright（E2E）

Lint/Format: ESLint + Prettier + EditorConfig

CI: GitHub Actions（lint/test/build）

---

2. リポジトリ構成（モノレポ例）

repo/
packages/
core/ # pipeline, engines (persona/memory/...)
adapters/ # llm, storage, telemetry
ui/ # nextjs app
tools/ # scripts, schema, fixtures
docs/ # 仕様書（本 MD 群）
tests/ # e2e / integration / fixtures

2.1 packages/core

src/
controller/
pipeline/
engines/
persona/
memory/
growth/
safety/
v2/
v3/
adapters/
schemas/
index.ts

---

3. 実装マイルストーン

M0: Boot

Node/TS/Next 初期化、ESLint/Prettier 導入

docs/ をサブモジュール扱い or 同梱

CI: lint + typecheck

M1: Pipeline MVP

controller + pipeline + LLM adapter

pre-safety/post-safety の最小実装

io-spec に合致する I/O 型

M2: Memory + Persona

memory CRUD + retrieval（SQLite）

persona パラメトリック制御

E2E: 入力 → 応答 → 記録まで

M3: Growth + Logging

growth 信号（cap/pace/rollback）

logging 構造化出力 + 眺め用 UI（LogConsole）

M4: v2（内省/物語/動機）

内省: drift/consistency チェック

物語: 軽い方向付け

動機: context-based 優先

M5: v3（美意識/好奇心/葛藤/メタ）

スタイル選好・探索・調停・視点切替

persona ドリフト監視 + テスト

M6: Hardening

safety チューニング

テスト拡充（異常系/攻撃系）

エラーバジェット/SLI/SLO 仮設定

---

4. コーディング標準

Public API は 型で契約（schemas/ に Zod）

例外は Result 型 で扱う（Ok/Err）

ログは JSON 構造化（level/timestamp/source）

副作用部は adapter に集約

TODO: は issue に紐づける

---

5. テスト戦略（test-spec.md 対応）

Unit: engines, adapters, controller

Integration: pipeline + storage + safety

E2E: UI → pipeline → LLM（モック）

Safety: 禁止/境界/連続攻撃ケース

Regression: persona/growth/safety の不変条件

---

6. 設定・Secrets 管理

.env（開発）→ GitHub Secrets（CI）

OPENAI_API_KEY, LOG_LEVEL, STORE_KIND, SAFETY_MODE

Secrets は サーバ側限定（ブラウザに出さない）

---

7. デプロイ/運用

Dev: local + mocked LLM

Stg: real LLM, SQLite, limited users

Prod: 狭いロールアウト、監視有効

ログ保持: 30〜90 日（環境変数）

障害時: rollback（versioning.md）

---

8. 観測と品質

logging.md に準拠（INFO/WARN/ERROR）

重要メトリクス:

safety-fallback rate

llm error/timeout rate

growth-update count

persona-drift score

---

9. リスクと対策

リスク 対策

Safety の過剰/過少 スコア調整 + 監査ログ + 手動レビュー
Persona ドリフト 再学習 cap / reset / rollback
記憶汚染 信頼度タグ + 隔離領域
LLM 仕様変更 adapter 層を薄く保守
コスト上振れ キャッシュ/短縮プロンプト/モック運用

---

10. リリース手順（例）

1. dev/next を freeze

1. CI にて全テスト green

1. stable/x.y.z リリースブランチ作成

1. CHANGELOG 更新

1. タグ打ち（SemVer）→ デプロイ

1. 監視（24h）→ 問題あれば rollback

---

11. 運用 Runbook（抜粋）

障害検知: Error レート > 閾値

一時対応: SAFE_MODE=hard で強制抑制

原因分析: 直近 200 イベントの監査

恒久対応: safety/growth/persona の調整

---

12. 付録

参照: index.md（仕様一覧）

実装との対応:

architecture.md（構成）

io-spec.md（I/O）

logging.md（ログ）

test-spec.md（テスト）

versioning.md（移行）

---

(EOF)
