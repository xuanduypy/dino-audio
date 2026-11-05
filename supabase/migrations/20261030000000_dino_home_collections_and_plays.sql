alter table public.audio_items
  add column if not exists collections text[] not null default array[]::text[],
  add column if not exists play_count bigint not null default 0;

alter table public.audio_items
  drop constraint if exists audio_items_valid_collections,
  add constraint audio_items_valid_collections
    check (collections <@ array['sleep', 'relax', 'fairytale']::text[]),
  drop constraint if exists audio_items_nonnegative_play_count,
  add constraint audio_items_nonnegative_play_count
    check (play_count >= 0);

create index if not exists audio_items_popularity_idx
  on public.audio_items (play_count desc, created_at desc);

create table if not exists public.audio_play_events (
  audio_item_id uuid not null references public.audio_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  played_minute timestamptz not null,
  primary key (audio_item_id, user_id, played_minute)
);

alter table public.audio_play_events enable row level security;
revoke all on table public.audio_play_events from public, anon, authenticated;

create or replace function public.record_audio_play(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  play_minute timestamptz := date_bin(
    '1 minute',
    now(),
    '2000-01-01 00:00:00+00'::timestamptz
  );
  inserted_rows integer;
begin
  if current_user_id is null or not public.is_dino_user() then
    raise exception 'Only invited DiNo users can record playback.';
  end if;

  insert into public.audio_play_events (audio_item_id, user_id, played_minute)
  values (p_item_id, current_user_id, play_minute)
  on conflict do nothing;

  get diagnostics inserted_rows = row_count;

  if inserted_rows > 0 then
    update public.audio_items
    set play_count = play_count + 1
    where id = p_item_id;

    if not found then
      raise exception 'Audio item does not exist.';
    end if;
  end if;
end;
$$;

revoke all on function public.record_audio_play(uuid) from public, anon;
grant execute on function public.record_audio_play(uuid) to authenticated;

revoke insert on table public.audio_items from authenticated;
grant insert (id, title, creator, kind, artwork, collections, storage_path, created_by)
  on table public.audio_items to authenticated;

revoke update on table public.audio_items from authenticated;
grant update (collections) on table public.audio_items to authenticated;

drop policy if exists "Owners and admin can update audio collections" on public.audio_items;
create policy "Owners and admin can update audio collections"
  on public.audio_items for update to authenticated
  using (
    public.is_dino_user()
    and (created_by = (select auth.uid()) or public.is_dino_admin())
  )
  with check (
    public.is_dino_user()
    and (created_by = (select auth.uid()) or public.is_dino_admin())
  );
