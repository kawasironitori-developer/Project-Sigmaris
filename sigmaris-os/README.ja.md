**Languages:** [English](README.md) | 日本語

# sigmaris-os（Sigmaris のリファレンスUI）

`sigmaris-os` は Project Sigmaris の **リファレンスUI**です。  
Sigmaris のコア（Persona OS エンジン）を **忠実に表に出す**ことを目的にしています。

- Supabase Auth（OAuth）
- チャットUI
- 可観測性ダッシュボード（例: `/status`）
- 運用者（Operator）機能（任意・アクセス制限）

`sigmaris-os` は `sigmaris-core` にリクエストをプロキシし、Supabase の統一テーブル `common_*` にログ/スナップショットを保存します。

---

## Quickstart（local）

### 1) Supabase スキーマ

Supabase の SQL Editor で実行:

- `supabase/RESET_TO_COMMON.sql`（破壊的リセット。`common_*` を再作成）

### 2) env

コピー:

- `sigmaris-os/.env.example` → `sigmaris-os/.env.local`

最小:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`（server-side only）
- `SIGMARIS_CORE_URL`（FastAPI backend。例: `http://127.0.0.1:8000`）

### 3) 起動

```bash
cd sigmaris-os
npm install
npm run dev
```

- App: `http://localhost:3000`
- Dashboard: `http://localhost:3000/status`

---

## Deploy（Vercel）

- Vercel Project Settings で env を設定
- Supabase Auth の Redirect URLs を設定:
  - `https://<your-domain>/auth/callback`

---

## レビューポイント（採用/一般向け）

- `app/api/aei/*`：SSE中継 + `common_*` への永続化
- `/status`：コアが返す `meta`（trace/intent/state/timing 等）を可視化

