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
-- Storage policies live on storage.objects. These are conservative defaults:
-- - Authenticated users can read/write only within their own prefix: `<user_id>/...`
--
-- If you intend to only access storage from the server (service role), you can skip policies.

-- Enable RLS (should already be enabled in Supabase)
alter table storage.objects enable row level security;

-- Read own objects
drop policy if exists sigmaris_attachments_read_own on storage.objects;
create policy sigmaris_attachments_read_own
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'sigmaris-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Insert own objects
drop policy if exists sigmaris_attachments_insert_own on storage.objects;
create policy sigmaris_attachments_insert_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sigmaris-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update own objects
drop policy if exists sigmaris_attachments_update_own on storage.objects;
create policy sigmaris_attachments_update_own
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'sigmaris-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'sigmaris-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete own objects
drop policy if exists sigmaris_attachments_delete_own on storage.objects;
create policy sigmaris_attachments_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'sigmaris-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

