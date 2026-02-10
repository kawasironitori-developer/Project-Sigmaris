-- Sigmaris OS (frontend) minimal schema
-- This is intentionally small: login is handled by Supabase Auth.
-- These tables support chat history in the Next.js app server routes.

create table if not exists public.messages (
  id bigserial primary key,
  user_id uuid not null,
  session_id text not null,
  session_title text null,
  role text not null check (role in ('user','ai')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_user_session_idx
  on public.messages (user_id, session_id, created_at);

-- Optional (account page may query this; safe to keep even if unused)
create table if not exists public.reflections (
  id bigserial primary key,
  user_id uuid not null,
  session_id text null,
  reflection text null,
  reflection_text text null,
  created_at timestamptz not null default now()
);

create index if not exists reflections_user_created_idx
  on public.reflections (user_id, created_at desc);

-- Optional debug logs (used by some legacy code paths)
create table if not exists public.debug_logs (
  id bigserial primary key,
  phase text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists debug_logs_created_idx
  on public.debug_logs (created_at desc);

-- ============================================================
-- Sigmaris Persona OS state snapshots (for dashboards)
-- - /api/aei が /persona/chat の meta を受け取り、必要な数値を抽出して保存する
-- - グラフ/状態ページで「今どういう状態か」を即表示できるようにする
-- ============================================================
create table if not exists public.sigmaris_state_snapshots (
  id bigserial primary key,
  user_id uuid not null,
  session_id text null,
  trace_id text null,

  global_state text null,
  overload_score double precision null,
  reflective_score double precision null,
  memory_pointer_count integer null,

  safety_flag text null,
  safety_risk_score double precision null,

  value_state jsonb null,
  trait_state jsonb null,

  meta jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists sigmaris_state_snapshots_user_created_idx
  on public.sigmaris_state_snapshots (user_id, created_at desc);

-- ============================================================
-- Sigmaris Telemetry snapshots (Phase01 Part05: C/N/M/S/R)
-- - /api/aei が /persona/chat の meta.controller_meta.telemetry を抽出して保存する
-- ============================================================
create table if not exists public.sigmaris_telemetry_snapshots (
  id bigserial primary key,
  user_id uuid not null,
  session_id text null,
  trace_id text null,

  scores jsonb null,
  ema jsonb null,
  flags jsonb null,
  reasons jsonb null,

  meta jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists sigmaris_telemetry_snapshots_user_created_idx
  on public.sigmaris_telemetry_snapshots (user_id, created_at desc);

-- ============================================================
-- Phase02: Temporal Identity / Subjectivity / Failure / Integration
-- - /api/aei が /persona/chat の meta.controller_meta.integration を抽出して保存する
-- ============================================================

create table if not exists public.sigmaris_temporal_identity_snapshots (
  id bigserial primary key,
  user_id uuid not null,
  session_id text null,
  trace_id text null,
  ego_id text null,
  state jsonb null,
  telemetry jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists sigmaris_temporal_identity_user_created_idx
  on public.sigmaris_temporal_identity_snapshots (user_id, created_at desc);

create table if not exists public.sigmaris_subjectivity_snapshots (
  id bigserial primary key,
  user_id uuid not null,
  session_id text null,
  trace_id text null,
  subjectivity jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists sigmaris_subjectivity_user_created_idx
  on public.sigmaris_subjectivity_snapshots (user_id, created_at desc);

create table if not exists public.sigmaris_failure_snapshots (
  id bigserial primary key,
  user_id uuid not null,
  session_id text null,
  trace_id text null,
  failure jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists sigmaris_failure_user_created_idx
  on public.sigmaris_failure_snapshots (user_id, created_at desc);

create table if not exists public.sigmaris_identity_snapshots (
  id bigserial primary key,
  user_id uuid not null,
  session_id text null,
  trace_id text null,
  snapshot jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists sigmaris_identity_snapshots_user_created_idx
  on public.sigmaris_identity_snapshots (user_id, created_at desc);

create table if not exists public.sigmaris_integration_events (
  id bigserial primary key,
  user_id uuid not null,
  session_id text null,
  trace_id text null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sigmaris_integration_events_user_created_idx
  on public.sigmaris_integration_events (user_id, created_at desc);
-- DEPRECATED
-- This file is kept for reference only.
-- Use `supabase/RESET_TO_COMMON.sql` as the authoritative schema (unified `common_*` tables).
