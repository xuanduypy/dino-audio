create table if not exists public.allowed_users (
  email text primary key check (
    email = lower(trim(email))
    and email ~ '^[^@[:space:]]+@gmail[.]com$'
  ),
  added_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.audio_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 140),
  creator text not null check (char_length(creator) between 1 and 100),
  kind text not null check (kind in ('music', 'book')),
  artwork text not null check (
    artwork in ('cover-blue', 'cover-forest', 'cover-sunrise', 'cover-road', 'cover-afterglow')
  ),
  storage_path text not null unique,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint audio_items_path_owned_by_creator
    check (storage_path = created_by::text || '/' || id::text)
);

create or replace function public.is_dino_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'xuanduy.cn@gmail.com';
$$;

create or replace function public.is_dino_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      public.is_dino_admin()
      or exists (
        select 1
        from public.allowed_users as invited
        where invited.email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      )
    );
$$;

revoke all on function public.is_dino_admin() from public, anon;
revoke all on function public.is_dino_user() from public, anon;
grant execute on function public.is_dino_admin() to authenticated;
grant execute on function public.is_dino_user() to authenticated;

alter table public.allowed_users enable row level security;
alter table public.audio_items enable row level security;
revoke all on table public.allowed_users, public.audio_items from anon, authenticated;
grant select, insert, delete on table public.allowed_users, public.audio_items to authenticated;

drop policy if exists "Admin and invited users can read invitations" on public.allowed_users;
create policy "Admin and invited users can read invitations"
  on public.allowed_users for select to authenticated
  using (
    public.is_dino_admin()
    or email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );

drop policy if exists "Only admin can invite users" on public.allowed_users;
create policy "Only admin can invite users"
  on public.allowed_users for insert to authenticated
  with check (
    public.is_dino_admin()
    and added_by = (select auth.uid())
    and email = lower(trim(email))
  );

drop policy if exists "Only admin can revoke invitations" on public.allowed_users;
create policy "Only admin can revoke invitations"
  on public.allowed_users for delete to authenticated
  using (public.is_dino_admin());

drop policy if exists "Invited users can read shared audio" on public.audio_items;
create policy "Invited users can read shared audio"
  on public.audio_items for select to authenticated
  using (public.is_dino_user());

drop policy if exists "Invited users can add shared audio" on public.audio_items;
create policy "Invited users can add shared audio"
  on public.audio_items for insert to authenticated
  with check (
    public.is_dino_user()
    and created_by = (select auth.uid())
    and storage_path = (select auth.uid())::text || '/' || id::text
  );

drop policy if exists "Only admin can delete shared audio" on public.audio_items;
create policy "Only admin can delete shared audio"
  on public.audio_items for delete to authenticated
  using (public.is_dino_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dino-audio',
  'dino-audio',
  false,
  52428800,
  array['audio/*']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = array['audio/*']::text[];

drop policy if exists "Invited users can listen to shared audio" on storage.objects;
create policy "Invited users can listen to shared audio"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dino-audio'
    and public.is_dino_user()
  );

drop policy if exists "Invited users can upload their own audio" on storage.objects;
create policy "Invited users can upload their own audio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dino-audio'
    and public.is_dino_user()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce((metadata ->> 'mimetype'), '') like 'audio/%'
    and coalesce((metadata ->> 'size')::bigint, 0) <= 52428800
  );

drop policy if exists "Only admin can delete shared audio files" on storage.objects;
create policy "Only admin can delete shared audio files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'dino-audio'
    and public.is_dino_admin()
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'audio_items'
  ) then
    alter publication supabase_realtime add table public.audio_items;
  end if;
end
$$;
