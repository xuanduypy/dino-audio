drop policy if exists "Invited users can add shared audio" on public.audio_items;
drop policy if exists "Only admin can add shared audio" on public.audio_items;
create policy "Only admin can add shared audio"
  on public.audio_items for insert to authenticated
  with check (
    public.is_dino_admin()
    and created_by = (select auth.uid())
    and storage_path = (select auth.uid())::text || '/' || id::text
  );

drop policy if exists "Invited users can upload their own audio" on storage.objects;
drop policy if exists "Only admin can upload shared audio" on storage.objects;
create policy "Only admin can upload shared audio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dino-audio'
    and public.is_dino_admin()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce((metadata ->> 'mimetype'), '') like 'audio/%'
    and coalesce((metadata ->> 'size')::bigint, 0) <= 52428800
  );
