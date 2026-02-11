-- ============================================================
-- Phase04 Storage Setup (Sigmaris Attachments)
-- ------------------------------------------------------------
-- Run this in Supabase SQL Editor AFTER applying RESET_TO_COMMON.sql
--
-- Purpose:
-- - Create a Storage bucket for attachments
-- - Add minimal RLS policies for user-scoped access (optional)
--
-- Notes:
-- - The backend can also use the service role key to bypass RLS.
-- - If you keep the bucket private, prefer signed URLs or server-side fetch.
-- ============================================================

-- 1) Create bucket (id = name)
insert into storage.buckets (id, name, public)
values ('sigmaris-attachments', 'sigmaris-attachments', false)
on conflict (id) do nothing;

-- 2) Policies (optional)
-- Storage policies live on `storage.objects`.
--
-- IMPORTANT:
-- In some Supabase projects, the SQL Editor role is NOT the owner of `storage.objects`,
-- so `ALTER TABLE storage.objects ...` / `CREATE POLICY ...` may fail with:
--   ERROR: 42501: must be owner of table objects
--
-- This project’s backend uploads/downloads using the service role key (server-side),
-- so these Storage RLS policies are OPTIONAL. You can skip them safely.
--
-- If you want end-user direct browser access to Storage objects, create policies via:
--   Supabase Dashboard -> Storage -> Policies (or run SQL as the table owner).
