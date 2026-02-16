**Languages:** [English](README.md) | 日本語

# Touhou Talk UI（分岐UI / キャラチャット）

このディレクトリは **東方Projectを題材にした二次創作**のキャラクターチャットUI（プロトタイプ）です。

Project Sigmaris の中では、次の位置づけです。

- `sigmaris-core` を **エンジン（Persona OS）**として利用する
- UI/UXは `sigmaris-os` とあえて変え、コアの汎用性を検証する
- assistant-ui コンポーネントをベースに、キャラチャット体験を作る

---

## 主な機能

- キャラクター別に会話セッションを保持
- キャラ切替しても文脈を壊しにくいUI
- スマホ/タブレット対応（レスポンシブ）
- Next.js App Router
- Supabase Auth（OAuth: Google/GitHub/Discord など）
- 任意: ローカルTTS（AquesTalk）などの実験（ローカル/自分用前提）

---

## Tech Stack

- Next.js（App Router）
- TypeScript
- Tailwind CSS
- Supabase Auth / Supabase DB

---

## 動かし方（local）

前提:

- `sigmaris-core` が起動している（例: `http://127.0.0.1:8000`）
- Supabase の `common_*` スキーマが用意されている
  - `supabase/RESET_TO_COMMON.sql`（破壊的リセット）

1) `touhou-talk-ui/.env.example` を `touhou-talk-ui/.env.local` にコピーして編集

最低限:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`（server-side only）
- `SIGMARIS_CORE_URL`（FastAPI backend）

2) 起動

```bash
cd touhou-talk-ui
npm install
npm run dev
```

---

## Vercel（本番）

- Vercel の env に上記を設定
- Supabase Auth の Redirect URLs に追加:
  - `https://<your-domain>/auth/callback`

---

## デスクトップ版（Windows, 任意）

Electron で Windows アプリ化できます（自分用向け）。

```bash
cd touhou-talk-ui
npm run desktop:dist
```

---

## 二次創作について（重要）

このプロジェクトは **非公式の二次創作**です。

東方Projectに関するキャラクター/名称/設定等の権利は原作者・権利者に帰属します。

本リポジトリは、原作・権利者（上海アリス幻樂団）とは無関係であり、公式のものではありません。

