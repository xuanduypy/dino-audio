create table if not exists public.dino_public_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  avatar_url text not null default '' check (char_length(avatar_url) <= 2048),
  updated_at timestamptz not null default now()
);

alter table public.dino_public_profiles enable row level security;
revoke all on table public.dino_public_profiles from public, anon, authenticated;
grant select on table public.dino_public_profiles to authenticated;

drop policy if exists "Invited users can read public member profiles" on public.dino_public_profiles;
create policy "Invited users can read public member profiles"
  on public.dino_public_profiles for select to authenticated
  using (public.is_dino_user());

create or replace function public.sync_dino_public_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
  profile_avatar text;
begin
  profile_name := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(new.email, '@', 1), ''),
    'Thành viên DiNo'
  ), 100);
  profile_avatar := coalesce(
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(new.raw_user_meta_data ->> 'picture', ''),
    ''
  );
  if profile_avatar !~ '^https://[^[:space:]]+$' or char_length(profile_avatar) > 2048 then
    profile_avatar := '';
  end if;

  insert into public.dino_public_profiles (user_id, display_name, avatar_url, updated_at)
  values (new.id, profile_name, profile_avatar, now())
  on conflict (user_id) do update
  set display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      updated_at = excluded.updated_at;
  return new;
end;
$$;

revoke all on function public.sync_dino_public_profile() from public, anon, authenticated;
drop trigger if exists sync_dino_public_profile on auth.users;
create trigger sync_dino_public_profile
  after insert or update of raw_user_meta_data, email on auth.users
  for each row execute function public.sync_dino_public_profile();

insert into public.dino_public_profiles (user_id, display_name, avatar_url)
select
  users.id,
  left(coalesce(
    nullif(btrim(users.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(users.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(users.email, '@', 1), ''),
    'Thành viên DiNo'
  ), 100),
  case
    when coalesce(users.raw_user_meta_data ->> 'avatar_url', users.raw_user_meta_data ->> 'picture', '')
      ~ '^https://[^[:space:]]+$'
      and char_length(coalesce(users.raw_user_meta_data ->> 'avatar_url', users.raw_user_meta_data ->> 'picture', '')) <= 2048
    then coalesce(users.raw_user_meta_data ->> 'avatar_url', users.raw_user_meta_data ->> 'picture')
    else ''
  end
from auth.users as users
on conflict (user_id) do nothing;

create table if not exists public.audio_item_user_states (
  user_id uuid not null references auth.users (id) on delete cascade,
  audio_item_id uuid not null references public.audio_items (id) on delete cascade,
  liked boolean not null default false,
  saved boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, audio_item_id),
  check (liked or saved)
);

alter table public.audio_item_user_states enable row level security;
revoke all on table public.audio_item_user_states from public, anon, authenticated;
grant select on table public.audio_item_user_states to authenticated;

drop policy if exists "Users can read their own audio item states" on public.audio_item_user_states;
create policy "Users can read their own audio item states"
  on public.audio_item_user_states for select to authenticated
  using (public.is_dino_user() and user_id = (select auth.uid()));

create or replace function public.set_dino_audio_item_state(
  p_audio_item_id uuid,
  p_action text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or not public.is_dino_user() then
    raise exception 'Sign in to a DiNo library account to save audio.';
  end if;
  if p_action is null or p_action not in ('liked', 'saved') or p_enabled is null then
    raise exception 'Choose a valid audio library action.';
  end if;
  if not exists (select 1 from public.audio_items where id = p_audio_item_id) then
    raise exception 'The audio item does not exist.';
  end if;

  if p_enabled then
    insert into public.audio_item_user_states (user_id, audio_item_id, liked, saved, updated_at)
    values (
      current_user_id,
      p_audio_item_id,
      p_action = 'liked',
      p_action = 'saved',
      now()
    )
    on conflict (user_id, audio_item_id) do update
    set liked = case when p_action = 'liked' then true else audio_item_user_states.liked end,
        saved = case when p_action = 'saved' then true else audio_item_user_states.saved end,
        updated_at = now();
  else
    delete from public.audio_item_user_states
    where user_id = current_user_id
      and audio_item_id = p_audio_item_id
      and (
        (p_action = 'liked' and not saved)
        or (p_action = 'saved' and not liked)
      );

    update public.audio_item_user_states
    set liked = case when p_action = 'liked' then false else liked end,
        saved = case when p_action = 'saved' then false else saved end,
        updated_at = now()
    where user_id = current_user_id
      and audio_item_id = p_audio_item_id;
  end if;
end;
$$;

revoke all on function public.set_dino_audio_item_state(uuid, text, boolean) from public, anon;
grant execute on function public.set_dino_audio_item_state(uuid, text, boolean) to authenticated;

create table if not exists public.audio_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists audio_playlists_owner_idx
  on public.audio_playlists (user_id, created_at desc);

create table if not exists public.audio_playlist_items (
  playlist_id uuid not null references public.audio_playlists (id) on delete cascade,
  audio_item_id uuid not null references public.audio_items (id) on delete cascade,
  position integer not null check (position > 0),
  added_at timestamptz not null default now(),
  primary key (playlist_id, audio_item_id),
  unique (playlist_id, position)
);

alter table public.audio_playlists enable row level security;
alter table public.audio_playlist_items enable row level security;
revoke all on table public.audio_playlists, public.audio_playlist_items from public, anon, authenticated;
grant select on table public.audio_playlists, public.audio_playlist_items to authenticated;

drop policy if exists "Users can read their own playlists" on public.audio_playlists;
create policy "Users can read their own playlists"
  on public.audio_playlists for select to authenticated
  using (public.is_dino_user() and user_id = (select auth.uid()));

drop policy if exists "Users can read items from their own playlists" on public.audio_playlist_items;
create policy "Users can read items from their own playlists"
  on public.audio_playlist_items for select to authenticated
  using (
    public.is_dino_user()
    and exists (
      select 1
      from public.audio_playlists as playlist
      where playlist.id = playlist_id
        and playlist.user_id = (select auth.uid())
    )
  );

create or replace function public.add_dino_audio_item_to_playlist(
  p_audio_item_id uuid,
  p_playlist_id uuid default null,
  p_new_playlist_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_playlist_id uuid := p_playlist_id;
  next_position integer;
begin
  if current_user_id is null or not public.is_dino_user() then
    raise exception 'Sign in to a DiNo library account to manage playlists.';
  end if;
  if not exists (select 1 from public.audio_items where id = p_audio_item_id) then
    raise exception 'The audio item does not exist.';
  end if;

  if target_playlist_id is null then
    if char_length(trim(coalesce(p_new_playlist_title, ''))) not between 1 and 80 then
      raise exception 'Enter a playlist name between 1 and 80 characters.';
    end if;
    insert into public.audio_playlists (user_id, title)
    values (current_user_id, trim(p_new_playlist_title))
    returning id into target_playlist_id;
  else
    if p_new_playlist_title is not null then
      raise exception 'Choose an existing playlist or enter a new playlist name.';
    end if;
    if not exists (
      select 1 from public.audio_playlists
      where id = target_playlist_id and user_id = current_user_id
    ) then
      raise exception 'You can only add items to your own playlists.';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_playlist_id::text, 0));
  select coalesce(max(position), 0) + 1 into next_position
  from public.audio_playlist_items
  where playlist_id = target_playlist_id;
  insert into public.audio_playlist_items (playlist_id, audio_item_id, position)
  values (target_playlist_id, p_audio_item_id, next_position)
  on conflict (playlist_id, audio_item_id) do nothing;

  return target_playlist_id;
end;
$$;

revoke all on function public.add_dino_audio_item_to_playlist(uuid, uuid, text) from public, anon;
grant execute on function public.add_dino_audio_item_to_playlist(uuid, uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'audio_item_user_states'
  ) then
    alter publication supabase_realtime add table public.audio_item_user_states;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'audio_playlists'
  ) then
    alter publication supabase_realtime add table public.audio_playlists;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'audio_playlist_items'
  ) then
    alter publication supabase_realtime add table public.audio_playlist_items;
  end if;
end
$$;
