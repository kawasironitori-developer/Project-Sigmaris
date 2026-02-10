-- Sigmaris Persona Core v2 - Supabase schema (Postgres)
-- -----------------------------------------------------
-- 目的:
-- - PersonaController(v2) の「記憶/状態/監査」を Supabase(Postgres) に永続化する
-- - Fly.io 等で複数インスタンスになっても、同一 user_id の人格状態を継続できるようにする
--
-- 使い方:
-- 1) Supabase の SQL Editor で実行
-- 2) サーバ側は service_role key を用いて書き込み（RLS を迂回）する想定
--    ※ クライアント直書き運用にする場合は RLS/Policy を別途追加してください

-- UUID生成
create extension if not exists pgcrypto;

-- Embedding を持たせたい場合（推奨）
-- ※ もし vector extension が有効化されていない場合は Supabase の Extensions から有効化してください
create extension if not exists vector;

-- =====================================================
-- 1) ターンログ（入力/出力）
-- =====================================================
create table if not exists public.sigmaris_turns (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id text not null,
  session_id text not null,
  role text not null,               -- "user" / "assistant" など
  content text not null,
  topic_hint text,
  emotion_hint text,
  importance real not null default 0.0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sigmaris_turns_user_created
  on public.sigmaris_turns (user_id, created_at desc);

create index if not exists idx_sigmaris_turns_user_session_created
  on public.sigmaris_turns (user_id, session_id, created_at desc);


-- =====================================================
-- 2) Value/Trait のスナップショット（人格状態）
-- =====================================================
create table if not exists public.sigmaris_value_snapshots (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id text not null,
  state jsonb not null,
  delta jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sigmaris_value_snapshots_user_created
  on public.sigmaris_value_snapshots (user_id, created_at desc);

create table if not exists public.sigmaris_trait_snapshots (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id text not null,
  state jsonb not null,
  delta jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sigmaris_trait_snapshots_user_created
  on public.sigmaris_trait_snapshots (user_id, created_at desc);

-- =====================================================
-- 2.5) Telemetry (Phase01 Part05: C/N/M/S/R)
-- =====================================================
create table if not exists public.sigmaris_telemetry_snapshots (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id text not null,
  session_id text,
  scores jsonb not null,
  ema jsonb not null,
  flags jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sigmaris_telemetry_snapshots_user_created
  on public.sigmaris_telemetry_snapshots (user_id, created_at desc);

-- =====================================================
-- 2.6) Ego continuity snapshots (Phase01 Part03: E Layer)
-- =====================================================
create table if not exists public.sigmaris_ego_snapshots (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id text not null,
  session_id text,
  ego_id text not null,
  version integer not null,
  state jsonb not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sigmaris_ego_snapshots_user_created
  on public.sigmaris_ego_snapshots (user_id, created_at desc);

create index if not exists idx_sigmaris_ego_snapshots_ego_created
  on public.sigmaris_ego_snapshots (ego_id, created_at desc);

-- =====================================================
-- 2.7) Temporal Identity (Phase02 MD-01)
-- =====================================================
create table if not exists public.sigmaris_temporal_identity_snapshots (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id text not null,
  session_id text,
  ego_id text not null,
  state jsonb not null,
  telemetry jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sigmaris_temporal_identity_user_created
  on public.sigmaris_temporal_identity_snapshots (user_id, created_at desc);

-- =====================================================
-- 2.8) Subjectivity snapshots (Phase02 MD-04)
-- =====================================================
create table if not exists public.sigmaris_subjectivity_snapshots (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id text not null,
  session_id text,
  subjectivity jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sigmaris_subjectivity_user_created
  on public.sigmaris_subjectivity_snapshots (user_id, created_at desc);

-- =====================================================
-- 2.9) Failure snapshots (Phase02 MD-05)
-- =====================================================
create table if not exists public.sigmaris_failure_snapshots (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id text not null,
  session_id text,
  failure jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sigmaris_failure_user_created
  on public.sigmaris_failure_snapshots (user_id, created_at desc);

-- =====================================================
-- 2.10) Identity snapshot system (Phase02 MD-07)
-- =====================================================
create table if not exists public.sigmaris_identity_snapshots (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id text not null,
  session_id text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sigmaris_identity_snapshots_user_created
  on public.sigmaris_identity_snapshots (user_id, created_at desc);

-- =====================================================
-- 2.11) Integration event bus (Phase02 MD-07)
-- =====================================================
create table if not exists public.sigmaris_integration_events (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id text not null,
  session_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sigmaris_integration_events_user_created
  on public.sigmaris_integration_events (user_id, created_at desc);

-- Operator overrides (Phase01 Part06/07)
create table if not exists public.sigmaris_operator_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  trace_id text,
  actor text,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sigmaris_operator_overrides_user_created
  on public.sigmaris_operator_overrides (user_id, created_at desc);

-- Life events (append-only audit / narrative material)
create table if not exists public.sigmaris_life_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  session_id text,
  trace_id text,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sigmaris_life_events_user_created
  on public.sigmaris_life_events (user_id, created_at desc);


-- =====================================================
-- 3) Episodic memory（SelectiveRecall 用）
-- =====================================================
-- PersonaController は EpisodeStore.add(ep) を呼ぶため、これをDBに寄せると記憶が永続化される。
create table if not exists public.sigmaris_episodes (
  episode_id text primary key,
  user_id text not null,
  timestamp timestamptz not null,
  summary text not null,
  emotion_hint text,
  traits_hint jsonb not null default '{}'::jsonb,
  raw_context text,
  embedding vector(1536),           -- モデルに合わせて調整（text-embedding-3-small は 1536 が一般的）
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sigmaris_episodes_user_timestamp
  on public.sigmaris_episodes (user_id, timestamp desc);


-- =====================================================
-- 4) Safety の監査ログ（任意）
-- =====================================================
create table if not exists public.sigmaris_safety_assessments (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id text not null,
  session_id text,
  safety_flag text,
  risk_score real not null default 0.0,
  categories jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sigmaris_safety_user_created
  on public.sigmaris_safety_assessments (user_id, created_at desc);


-- =====================================================
-- 5) Trace events（任意）
-- =====================================================
create table if not exists public.sigmaris_trace_events (
  id uuid primary key default gen_random_uuid(),
  trace_id text not null,
  event text not null,
  fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sigmaris_trace_events_trace_created
  on public.sigmaris_trace_events (trace_id, created_at asc);
-- DEPRECATED
-- This file is kept for reference only.
-- Use `supabase/RESET_TO_COMMON.sql` as the authoritative schema (unified `common_*` tables).
