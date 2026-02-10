-- DEPRECATED
-- This file is kept for reference only.
-- Use `supabase/RESET_TO_COMMON.sql` as the authoritative schema (unified `common_*` tables).

-- touhou-talk-ui Supabase schema (Touhou tables)
-- ============================================================
-- This file is intended to be run in Supabase SQL Editor.
-- It contains only additive/safe migrations to keep existing data.
--
-- Current migration:
-- - Add `chat_mode` to `public.touhou_conversations` to let the UI switch
--   between roleplay/partner/coach styles while keeping one shared backend.
-- ============================================================

-- Conversation mode:
-- - partner: balanced "partner-like" conversation + usefulness
-- - roleplay: stronger lore/character-first roleplay
-- - coach: more structured, pragmatic advice (still in-character)
alter table if exists public.touhou_conversations
  add column if not exists chat_mode text not null default 'partner';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'touhou_conversations'
      and column_name = 'chat_mode'
  ) then
    begin
      alter table public.touhou_conversations
        add constraint touhou_conversations_chat_mode_check
        check (chat_mode in ('partner','roleplay','coach'));
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;
