-- Project Sigmaris - Supabase schema reset to `common_*`
-- ============================================================
-- This script is DESTRUCTIVE: it drops the legacy tables and recreates
-- a unified `common_*` schema that can be shared by:
-- - sigmaris-os (ops/dashboard UI)
-- - touhou-talk-ui (character chat UI)
--
-- Assumptions:
-- - You're OK losing existing data (test account only).
-- - You will run this in Supabase SQL Editor.
--
-- Notes:
-- - RLS is enabled. Policies allow each authenticated user to access rows
--   where `user_id = auth.uid()`.
-- - Server-side (service role) access still bypasses RLS as usual.
-- ============================================================

-- --------------------------------------------
-- 1) Drop legacy tables (if exist)
-- --------------------------------------------

-- Core schema extensions (safe to keep even after reset)
create extension if not exists pgcrypto;
create extension if not exists vector;

drop table if exists public.touhou_messages cascade;
drop table if exists public.touhou_conversations cascade;

drop table if exists public.persona cascade;

drop table if exists public.sigmaris_telemetry_snapshots cascade;
drop table if exists public.sigmaris_state_snapshots cascade;
drop table if exists public.debug_logs cascade;
drop table if exists public.reflections cascade;
drop table if exists public.messages cascade;

-- Some legacy code paths referenced these; drop if present.
drop table if exists public.growth_logs cascade;
drop table if exists public.safety_logs cascade;

-- sigmaris_core/persona_core/storage/SUPABASE_SCHEMA.sql legacy tables
drop table if exists public.sigmaris_trace_events cascade;
drop table if exists public.sigmaris_safety_assessments cascade;
drop table if exists public.sigmaris_episodes cascade;
drop table if exists public.sigmaris_life_events cascade;
drop table if exists public.sigmaris_operator_overrides cascade;
drop table if exists public.sigmaris_integration_events cascade;
drop table if exists public.sigmaris_identity_snapshots cascade;
drop table if exists public.sigmaris_failure_snapshots cascade;
drop table if exists public.sigmaris_subjectivity_snapshots cascade;
drop table if exists public.sigmaris_temporal_identity_snapshots cascade;
drop table if exists public.sigmaris_ego_snapshots cascade;
drop table if exists public.sigmaris_trait_snapshots cascade;
drop table if exists public.sigmaris_value_snapshots cascade;
drop table if exists public.sigmaris_turns cascade;

-- --------------------------------------------
-- 2) Create common tables
-- --------------------------------------------

-- Sessions / conversations shared across UIs.
create table if not exists public.common_sessions (
  id text primary key default gen_random_uuid()::text, -- session_id (uuid string is fine)
  user_id uuid not null,

  app text not null default 'sigmaris' check (app in ('sigmaris','touhou')),

  title text null,

  -- Touhou / character chat metadata (optional for other apps)
  character_id text null,
  mode text null check (mode in ('single','group')),
  layer text null,
  location text null,
  chat_mode text not null default 'partner' check (chat_mode in ('partner','roleplay','coach')),

  meta jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists common_sessions_user_created_idx
  on public.common_sessions (user_id, created_at desc);

create index if not exists common_sessions_app_user_created_idx
  on public.common_sessions (app, user_id, created_at desc);

-- Messages shared across UIs.
create table if not exists public.common_messages (
  id bigserial primary key,
  user_id uuid not null,
  session_id text not null,

  app text not null default 'sigmaris' check (app in ('sigmaris','touhou')),

  -- Optional: used by sigmaris-os session list/rename flows.
  session_title text null,

  role text not null check (role in ('user','ai')),
  content text not null,

  -- Optional: used by character chat to identify the speaker.
  speaker_id text null,

  meta jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists common_messages_user_session_idx
  on public.common_messages (user_id, session_id, created_at);

create index if not exists common_messages_app_user_session_idx
  on public.common_messages (app, user_id, session_id, created_at);

-- Optional (account page may query this; safe to keep even if unused)
create table if not exists public.common_reflections (
  id bigserial primary key,
  user_id uuid not null,
  session_id text null,
  reflection text null,
  reflection_text text null,
  created_at timestamptz not null default now()
);

create index if not exists common_reflections_user_created_idx
  on public.common_reflections (user_id, created_at desc);

-- Optional debug logs (used by some code paths)
create table if not exists public.common_debug_logs (
  id bigserial primary key,
  user_id uuid not null,
  session_id text null,
  trace_id text null,
  phase text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists common_debug_logs_created_idx
  on public.common_debug_logs (created_at desc);

create index if not exists common_debug_logs_user_created_idx
  on public.common_debug_logs (user_id, created_at desc);

-- Sigmaris Persona OS state snapshots (for dashboards / internal control)
create table if not exists public.common_state_snapshots (
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

create index if not exists common_state_snapshots_user_created_idx
  on public.common_state_snapshots (user_id, created_at desc);

-- Sigmaris Telemetry snapshots (Phase01/Phase02)
create table if not exists public.common_telemetry_snapshots (
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

create index if not exists common_telemetry_snapshots_user_created_idx
  on public.common_telemetry_snapshots (user_id, created_at desc);

-- ============================================================
-- Sigmaris Persona Core tables (renamed to common_*)
-- ============================================================

-- Turn log (optional)
create table if not exists public.common_turns (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id uuid not null,
  session_id text not null,
  role text not null, -- "user" / "assistant" / "system"
  content text not null,
  topic_hint text,
  emotion_hint text,
  importance real not null default 0.0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_common_turns_user_created
  on public.common_turns (user_id, created_at desc);

create index if not exists idx_common_turns_user_session_created
  on public.common_turns (user_id, session_id, created_at desc);

-- Value/Trait snapshots
create table if not exists public.common_value_snapshots (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id uuid not null,
  state jsonb not null,
  delta jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_common_value_snapshots_user_created
  on public.common_value_snapshots (user_id, created_at desc);

create table if not exists public.common_trait_snapshots (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id uuid not null,
  state jsonb not null,
  delta jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_common_trait_snapshots_user_created
  on public.common_trait_snapshots (user_id, created_at desc);

-- Ego snapshots
create table if not exists public.common_ego_snapshots (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id uuid not null,
  session_id text,
  ego_id text not null,
  version integer not null,
  state jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_common_ego_snapshots_user_created
  on public.common_ego_snapshots (user_id, created_at desc);

-- Phase02: Temporal Identity
create table if not exists public.common_temporal_identity_snapshots (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id uuid not null,
  session_id text,
  ego_id text,
  state jsonb not null default '{}'::jsonb,
  telemetry jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_common_temporal_identity_user_created
  on public.common_temporal_identity_snapshots (user_id, created_at desc);

-- Phase02: Subjectivity FSM
create table if not exists public.common_subjectivity_snapshots (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id uuid not null,
  session_id text,
  subjectivity jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_common_subjectivity_user_created
  on public.common_subjectivity_snapshots (user_id, created_at desc);

-- Phase02: Failure detection
create table if not exists public.common_failure_snapshots (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id uuid not null,
  session_id text,
  failure jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_common_failure_user_created
  on public.common_failure_snapshots (user_id, created_at desc);

-- Phase02: Identity snapshots
create table if not exists public.common_identity_snapshots (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id uuid not null,
  session_id text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_common_identity_snapshots_user_created
  on public.common_identity_snapshots (user_id, created_at desc);

-- Phase02: Integration event bus
create table if not exists public.common_integration_events (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id uuid not null,
  session_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_common_integration_events_user_created
  on public.common_integration_events (user_id, created_at desc);

-- Operator overrides (Phase01 Part06/07)
create table if not exists public.common_operator_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  trace_id text,
  actor text,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_common_operator_overrides_user_created
  on public.common_operator_overrides (user_id, created_at desc);

-- Life events (append-only audit / narrative material)
create table if not exists public.common_life_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id text,
  trace_id text,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_common_life_events_user_created
  on public.common_life_events (user_id, created_at desc);

-- Episodic memory (SelectiveRecall)
create table if not exists public.common_episodes (
  episode_id text primary key,
  user_id uuid not null,
  timestamp timestamptz not null,
  summary text not null,
  emotion_hint text,
  traits_hint jsonb not null default '{}'::jsonb,
  raw_context text,
  embedding vector(1536),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_common_episodes_user_timestamp
  on public.common_episodes (user_id, timestamp desc);

-- Safety assessments
create table if not exists public.common_safety_assessments (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id uuid not null,
  session_id text,
  safety_flag text,
  risk_score real not null default 0.0,
  categories jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_common_safety_user_created
  on public.common_safety_assessments (user_id, created_at desc);

-- Trace events
create table if not exists public.common_trace_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  trace_id text not null,
  event text not null,
  fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_common_trace_events_user_created
  on public.common_trace_events (user_id, created_at desc);

-- Persona (sigmaris-os UI)
create table if not exists public.common_persona (
  user_id uuid primary key,
  calm real not null default 0.5,
  empathy real not null default 0.5,
  curiosity real not null default 0.5,
  reflection text not null default '',
  meta_summary text not null default '',
  growth real not null default 0.0,
  updated_at timestamptz not null default now()
);

-- --------------------------------------------
-- 3) RLS policies (owner access)
-- --------------------------------------------

alter table public.common_sessions enable row level security;
alter table public.common_messages enable row level security;
alter table public.common_reflections enable row level security;
alter table public.common_debug_logs enable row level security;
alter table public.common_state_snapshots enable row level security;
alter table public.common_telemetry_snapshots enable row level security;
alter table public.common_turns enable row level security;
alter table public.common_value_snapshots enable row level security;
alter table public.common_trait_snapshots enable row level security;
alter table public.common_ego_snapshots enable row level security;
alter table public.common_temporal_identity_snapshots enable row level security;
alter table public.common_subjectivity_snapshots enable row level security;
alter table public.common_failure_snapshots enable row level security;
alter table public.common_identity_snapshots enable row level security;
alter table public.common_integration_events enable row level security;
alter table public.common_operator_overrides enable row level security;
alter table public.common_life_events enable row level security;
alter table public.common_episodes enable row level security;
alter table public.common_safety_assessments enable row level security;
alter table public.common_trace_events enable row level security;
alter table public.common_persona enable row level security;

-- Sessions
drop policy if exists common_sessions_select_own on public.common_sessions;
create policy common_sessions_select_own
  on public.common_sessions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_sessions_insert_own on public.common_sessions;
create policy common_sessions_insert_own
  on public.common_sessions for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists common_sessions_update_own on public.common_sessions;
create policy common_sessions_update_own
  on public.common_sessions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists common_sessions_delete_own on public.common_sessions;
create policy common_sessions_delete_own
  on public.common_sessions for delete
  to authenticated
  using (user_id = auth.uid());

-- Messages
drop policy if exists common_messages_select_own on public.common_messages;
create policy common_messages_select_own
  on public.common_messages for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_messages_insert_own on public.common_messages;
create policy common_messages_insert_own
  on public.common_messages for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists common_messages_update_own on public.common_messages;
create policy common_messages_update_own
  on public.common_messages for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists common_messages_delete_own on public.common_messages;
create policy common_messages_delete_own
  on public.common_messages for delete
  to authenticated
  using (user_id = auth.uid());

-- Reflections
drop policy if exists common_reflections_select_own on public.common_reflections;
create policy common_reflections_select_own
  on public.common_reflections for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_reflections_insert_own on public.common_reflections;
create policy common_reflections_insert_own
  on public.common_reflections for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists common_reflections_update_own on public.common_reflections;
create policy common_reflections_update_own
  on public.common_reflections for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists common_reflections_delete_own on public.common_reflections;
create policy common_reflections_delete_own
  on public.common_reflections for delete
  to authenticated
  using (user_id = auth.uid());

-- Debug logs (owner read/write)
drop policy if exists common_debug_logs_select_own on public.common_debug_logs;
create policy common_debug_logs_select_own
  on public.common_debug_logs for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_debug_logs_insert_own on public.common_debug_logs;
create policy common_debug_logs_insert_own
  on public.common_debug_logs for insert
  to authenticated
  with check (user_id = auth.uid());

-- State snapshots
drop policy if exists common_state_snapshots_select_own on public.common_state_snapshots;
create policy common_state_snapshots_select_own
  on public.common_state_snapshots for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_state_snapshots_insert_own on public.common_state_snapshots;
create policy common_state_snapshots_insert_own
  on public.common_state_snapshots for insert
  to authenticated
  with check (user_id = auth.uid());

-- Telemetry snapshots
drop policy if exists common_telemetry_snapshots_select_own on public.common_telemetry_snapshots;
create policy common_telemetry_snapshots_select_own
  on public.common_telemetry_snapshots for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_telemetry_snapshots_insert_own on public.common_telemetry_snapshots;
create policy common_telemetry_snapshots_insert_own
  on public.common_telemetry_snapshots for insert
  to authenticated
  with check (user_id = auth.uid());

-- Turns
drop policy if exists common_turns_select_own on public.common_turns;
create policy common_turns_select_own
  on public.common_turns for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_turns_insert_own on public.common_turns;
create policy common_turns_insert_own
  on public.common_turns for insert
  to authenticated
  with check (user_id = auth.uid());

-- Value snapshots
drop policy if exists common_value_snapshots_select_own on public.common_value_snapshots;
create policy common_value_snapshots_select_own
  on public.common_value_snapshots for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_value_snapshots_insert_own on public.common_value_snapshots;
create policy common_value_snapshots_insert_own
  on public.common_value_snapshots for insert
  to authenticated
  with check (user_id = auth.uid());

-- Trait snapshots
drop policy if exists common_trait_snapshots_select_own on public.common_trait_snapshots;
create policy common_trait_snapshots_select_own
  on public.common_trait_snapshots for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_trait_snapshots_insert_own on public.common_trait_snapshots;
create policy common_trait_snapshots_insert_own
  on public.common_trait_snapshots for insert
  to authenticated
  with check (user_id = auth.uid());

-- Ego snapshots
drop policy if exists common_ego_snapshots_select_own on public.common_ego_snapshots;
create policy common_ego_snapshots_select_own
  on public.common_ego_snapshots for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_ego_snapshots_insert_own on public.common_ego_snapshots;
create policy common_ego_snapshots_insert_own
  on public.common_ego_snapshots for insert
  to authenticated
  with check (user_id = auth.uid());

-- Temporal identity snapshots
drop policy if exists common_temporal_identity_select_own on public.common_temporal_identity_snapshots;
create policy common_temporal_identity_select_own
  on public.common_temporal_identity_snapshots for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_temporal_identity_insert_own on public.common_temporal_identity_snapshots;
create policy common_temporal_identity_insert_own
  on public.common_temporal_identity_snapshots for insert
  to authenticated
  with check (user_id = auth.uid());

-- Subjectivity snapshots
drop policy if exists common_subjectivity_select_own on public.common_subjectivity_snapshots;
create policy common_subjectivity_select_own
  on public.common_subjectivity_snapshots for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_subjectivity_insert_own on public.common_subjectivity_snapshots;
create policy common_subjectivity_insert_own
  on public.common_subjectivity_snapshots for insert
  to authenticated
  with check (user_id = auth.uid());

-- Failure snapshots
drop policy if exists common_failure_select_own on public.common_failure_snapshots;
create policy common_failure_select_own
  on public.common_failure_snapshots for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_failure_insert_own on public.common_failure_snapshots;
create policy common_failure_insert_own
  on public.common_failure_snapshots for insert
  to authenticated
  with check (user_id = auth.uid());

-- Identity snapshots
drop policy if exists common_identity_snapshots_select_own on public.common_identity_snapshots;
create policy common_identity_snapshots_select_own
  on public.common_identity_snapshots for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_identity_snapshots_insert_own on public.common_identity_snapshots;
create policy common_identity_snapshots_insert_own
  on public.common_identity_snapshots for insert
  to authenticated
  with check (user_id = auth.uid());

-- Integration events
drop policy if exists common_integration_events_select_own on public.common_integration_events;
create policy common_integration_events_select_own
  on public.common_integration_events for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_integration_events_insert_own on public.common_integration_events;
create policy common_integration_events_insert_own
  on public.common_integration_events for insert
  to authenticated
  with check (user_id = auth.uid());

-- Operator overrides (owner can read; insert/update/delete should be server-side only)
drop policy if exists common_operator_overrides_select_own on public.common_operator_overrides;
create policy common_operator_overrides_select_own
  on public.common_operator_overrides for select
  to authenticated
  using (user_id = auth.uid());

-- Life events
drop policy if exists common_life_events_select_own on public.common_life_events;
create policy common_life_events_select_own
  on public.common_life_events for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_life_events_insert_own on public.common_life_events;
create policy common_life_events_insert_own
  on public.common_life_events for insert
  to authenticated
  with check (user_id = auth.uid());

-- Episodes
drop policy if exists common_episodes_select_own on public.common_episodes;
create policy common_episodes_select_own
  on public.common_episodes for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_episodes_insert_own on public.common_episodes;
create policy common_episodes_insert_own
  on public.common_episodes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists common_episodes_update_own on public.common_episodes;
create policy common_episodes_update_own
  on public.common_episodes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists common_episodes_delete_own on public.common_episodes;
create policy common_episodes_delete_own
  on public.common_episodes for delete
  to authenticated
  using (user_id = auth.uid());

-- Safety assessments
drop policy if exists common_safety_select_own on public.common_safety_assessments;
create policy common_safety_select_own
  on public.common_safety_assessments for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_safety_insert_own on public.common_safety_assessments;
create policy common_safety_insert_own
  on public.common_safety_assessments for insert
  to authenticated
  with check (user_id = auth.uid());

-- Trace events
drop policy if exists common_trace_events_select_own on public.common_trace_events;
create policy common_trace_events_select_own
  on public.common_trace_events for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_trace_events_insert_own on public.common_trace_events;
create policy common_trace_events_insert_own
  on public.common_trace_events for insert
  to authenticated
  with check (user_id = auth.uid());

-- Persona
drop policy if exists common_persona_select_own on public.common_persona;
create policy common_persona_select_own
  on public.common_persona for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_persona_upsert_own on public.common_persona;
create policy common_persona_upsert_own
  on public.common_persona for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists common_persona_update_own on public.common_persona;
create policy common_persona_update_own
  on public.common_persona for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
