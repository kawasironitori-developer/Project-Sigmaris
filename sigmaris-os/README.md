**Languages:** English | [日本語](README.ja.md)

# sigmaris-os (Reference UI for Sigmaris)

`sigmaris-os` is the **reference UI** for Project Sigmaris.

It is designed to surface the Sigmaris engine (“Persona OS”) **faithfully**:

- Supabase Auth (OAuth)
- Chat UI
- Observability dashboards (e.g. `/status`)
- Operator controls (optional, access-restricted)

This app proxies requests to `sigmaris-core` and persists logs/snapshots to unified `common_*` tables in Supabase.

---

## Quickstart (local)

### 1) Supabase schema

In Supabase SQL Editor run:

- `supabase/RESET_TO_COMMON.sql` (destructive reset to `common_*`)

### 2) Env

Copy:

- `sigmaris-os/.env.example` → `sigmaris-os/.env.local`

Minimum:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only; Route Handlers insert snapshots)
- `SIGMARIS_CORE_URL` (FastAPI backend, e.g. `http://127.0.0.1:8000`)

### 3) Run

```bash
cd sigmaris-os
npm install
npm run dev
```

- App: `http://localhost:3000`
- Dashboard: `http://localhost:3000/status`

---

## Deploy (Vercel)

- Set the same env vars in Vercel Project Settings
- Configure Supabase Auth redirect URLs:
  - `https://<your-domain>/auth/callback`

---

## What to look at (for reviewers)

- `app/api/aei/*` Route Handlers: SSE proxy + persistence to `common_*`
- `/status`: visualize per-turn `meta` from the core

